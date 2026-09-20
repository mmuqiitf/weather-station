<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Location;
use App\Models\Sensor;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ManagementApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
        SensorType::query()->create(['code' => 'temp_air', 'unit' => '°C', 'precision' => 1]);
    }

    public function test_device_crud_with_lifecycle_guard(): void
    {
        $location = Location::query()->create(['name' => 'Garut', 'latitude' => -7.2, 'longitude' => 107.9]);

        $create = $this->postJson('/api/v1/devices', [
            'device_id' => 'WS-T-001', 'name' => 'Test', 'location_id' => $location->id,
        ]);
        $create->assertStatus(201)->assertJsonPath('data.status', 'provisioned');
        $this->assertNotEmpty($create->json('data.api_key_plain'));

        $list = $this->getJson('/api/v1/devices?status=provisioned&q=WS-T');
        $list->assertOk()->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.device_id', 'WS-T-001')
            ->assertJsonPath('data.0.location.name', 'Garut');

        // Illegal jump provisioned -> decommissioned is rejected.
        $this->patchJson('/api/v1/devices/WS-T-001', ['status' => 'decommissioned'])->assertStatus(422);

        $this->patchJson('/api/v1/devices/WS-T-001', ['status' => 'active'])->assertOk();
        $this->getJson('/api/v1/devices/WS-T-001/health')->assertOk()->assertJsonPath('data.is_online', false);

        $this->postJson('/api/v1/devices/WS-T-001/credentials/rotate')->assertOk()
            ->assertJsonStructure(['data' => ['api_key_plain']]);

        $this->delete('/api/v1/devices/WS-T-001')->assertNoContent();
        $this->assertSoftDeleted('devices', ['device_id' => 'WS-T-001']);
    }

    public function test_sensor_attach_calibration_flow(): void
    {
        $type = SensorType::query()->where('code', 'temp_air')->first();
        $device = Device::query()->create([
            'device_id' => 'WS-T-002', 'name' => 'T2', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'k'),
        ]);
        $sensor = Sensor::query()->create(['serial' => 'SN-1', 'sensor_type_id' => $type->id]);

        $this->postJson('/api/v1/devices/WS-T-002/sensors', ['sensor_id' => $sensor->id])
            ->assertStatus(201);
        // Second attach of same sensor elsewhere conflicts.
        $device2 = Device::query()->create([
            'device_id' => 'WS-T-003', 'name' => 'T3', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'k2'),
        ]);
        $this->postJson('/api/v1/devices/WS-T-003/sensors', ['sensor_id' => $sensor->id])
            ->assertStatus(409);

        $this->postJson("/api/v1/sensors/{$sensor->id}/calibrations", [
            'offset' => 0.5, 'scale' => 1.0, 'effective_at' => now()->toIso8601String(),
        ])->assertStatus(201);
        $this->getJson("/api/v1/sensors/{$sensor->id}/calibrations")->assertOk();

        $this->deleteJson("/api/v1/devices/WS-T-002/sensors/{$sensor->id}")->assertOk();
    }

    public function test_readings_endpoints_need_known_device(): void
    {
        $this->getJson('/api/v1/readings?device_id=NOPE')->assertStatus(404)
            ->assertJsonPath('message', 'Device not found.');
        $this->getJson('/api/v1/devices/NOPE/readings/latest')->assertStatus(404);
        $this->getJson('/api/v1/dashboard/overview')->assertOk()->assertJsonStructure(['data' => ['devices', 'counts']]);
    }
}
