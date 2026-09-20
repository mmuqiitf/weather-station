<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Sensor;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ListingApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
        SensorType::query()->create(['code' => 'temp_air', 'unit' => '°C', 'precision' => 1]);
    }

    public function test_devices_sort(): void
    {
        Device::query()->create([
            'device_id' => 'WS-S-B', 'name' => 'Bravo', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'b'), 'last_seen_at' => now()->subHour(),
        ]);
        Device::query()->create([
            'device_id' => 'WS-S-A', 'name' => 'Alpha', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'a'), 'last_seen_at' => now(),
        ]);

        $this->getJson('/api/v1/devices?sort=name&direction=desc')->assertOk()
            ->assertJsonPath('data.0.device_id', 'WS-S-B')
            ->assertJsonPath('data.1.device_id', 'WS-S-A');

        $this->getJson('/api/v1/devices?sort=last_seen_at&direction=desc')->assertOk()
            ->assertJsonPath('data.0.device_id', 'WS-S-A');

        // Default order is unchanged (id asc).
        $this->getJson('/api/v1/devices')->assertOk()
            ->assertJsonPath('data.0.device_id', 'WS-S-B');

        $this->getJson('/api/v1/devices?sort=nope')->assertStatus(422);
        $this->getJson('/api/v1/devices?direction=sideways')->assertStatus(422);
    }

    public function test_sensors_search_filter_sort(): void
    {
        $temp = SensorType::query()->where('code', 'temp_air')->first();
        $hum = SensorType::query()->create(['code' => 'humidity', 'unit' => '%RH', 'precision' => 1]);
        $device = Device::query()->create([
            'device_id' => 'WS-S-1', 'name' => 'S1', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'k'),
        ]);
        $attached = Sensor::query()->create(['serial' => 'SN-A', 'sensor_type_id' => $temp->id]);
        Sensor::query()->create(['serial' => 'SN-B', 'sensor_type_id' => $hum->id]);
        Sensor::query()->create(['serial' => 'SN-C', 'sensor_type_id' => $temp->id]);
        $this->postJson('/api/v1/devices/WS-S-1/sensors', ['sensor_id' => $attached->id])
            ->assertStatus(201);

        $this->getJson('/api/v1/sensors?q=sn-a')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.serial', 'SN-A');

        $this->getJson("/api/v1/sensors?sensor_type_id={$temp->id}")->assertOk()
            ->assertJsonPath('meta.total', 2);

        $this->getJson('/api/v1/sensors?mounted=1')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.serial', 'SN-A');
        $this->getJson('/api/v1/sensors?mounted=0')->assertOk()
            ->assertJsonPath('meta.total', 2);

        $this->getJson('/api/v1/sensors?sort=serial&direction=desc')->assertOk()
            ->assertJsonPath('data.0.serial', 'SN-C');

        $this->getJson('/api/v1/sensors?sort=nope')->assertStatus(422);
    }

    public function test_sensor_type_crud(): void
    {
        $create = $this->postJson('/api/v1/sensor-types', [
            'code' => 'wind_speed', 'unit' => 'm/s', 'min_value' => 0, 'max_value' => 75, 'precision' => 1,
        ]);
        $create->assertStatus(201)->assertJsonPath('data.code', 'wind_speed');
        $typeId = $create->json('data.id');

        $this->postJson('/api/v1/sensor-types', ['code' => 'wind_speed', 'unit' => 'm/s'])
            ->assertStatus(422);

        $list = $this->getJson('/api/v1/sensor-types?q=wind&sort=code&direction=desc&per_page=1');
        $list->assertOk()->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.code', 'wind_speed');

        $this->getJson("/api/v1/sensor-types/{$typeId}")->assertOk()
            ->assertJsonPath('data.unit', 'm/s');
        $this->getJson('/api/v1/sensor-types/999999')->assertStatus(404);

        $this->patchJson("/api/v1/sensor-types/{$typeId}", ['unit' => 'meters/sec'])->assertOk()
            ->assertJsonPath('data.unit', 'meters/sec');
        $this->patchJson("/api/v1/sensor-types/{$typeId}", ['code' => 'temp_air'])
            ->assertStatus(422);

        // Type in use cannot be deleted.
        Sensor::query()->create(['serial' => 'SN-X', 'sensor_type_id' => $typeId]);
        $this->deleteJson("/api/v1/sensor-types/{$typeId}")->assertStatus(409);

        $free = $this->postJson('/api/v1/sensor-types', ['code' => 'pressure', 'unit' => 'hPa'])
            ->assertStatus(201)->json('data.id');
        $this->deleteJson("/api/v1/sensor-types/{$free}")->assertNoContent();
        $this->deleteJson('/api/v1/sensor-types/999999')->assertStatus(404);
    }

    public function test_devices_online_filter(): void
    {
        Device::query()->create([
            'device_id' => 'WS-O-ON', 'name' => 'On', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'on'), 'last_seen_at' => now(),
        ]);
        Device::query()->create([
            'device_id' => 'WS-O-STALE', 'name' => 'Stale', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'stale'), 'last_seen_at' => now()->subHour(),
        ]);
        Device::query()->create([
            'device_id' => 'WS-O-NEVER', 'name' => 'Never', 'status' => Device::STATUS_PROVISIONED,
            'api_key_hash' => hash('sha256', 'never'),
        ]);

        $this->getJson('/api/v1/devices?online=1')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.device_id', 'WS-O-ON');

        // Stale heartbeats and never-seen devices both count as offline.
        $this->getJson('/api/v1/devices?online=0')->assertOk()
            ->assertJsonPath('meta.total', 2);

        $this->getJson('/api/v1/devices?online=yes')->assertStatus(422);
    }

    public function test_sensor_types_unit_and_usage_filter(): void
    {
        $temp = SensorType::query()->where('code', 'temp_air')->first();
        $hum = SensorType::query()->create(['code' => 'humidity', 'unit' => '%RH', 'precision' => 1]);
        Sensor::query()->create(['serial' => 'SN-T1', 'sensor_type_id' => $temp->id]);

        $this->getJson('/api/v1/sensor-types?'.http_build_query(['unit' => '%RH']))->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.code', 'humidity');

        $this->getJson('/api/v1/sensor-types?in_use=1')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.code', 'temp_air')
            ->assertJsonPath('data.0.sensors_count', 1);

        $this->getJson('/api/v1/sensor-types?in_use=0')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.code', 'humidity')
            ->assertJsonPath('data.0.sensors_count', 0);

        $this->getJson('/api/v1/sensor-types?in_use=yes')->assertStatus(422);
    }
}
