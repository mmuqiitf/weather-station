<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Location;
use App\Models\SensorReading;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Every successful response uses the resource envelope (§E.1):
 * single results under `data`, collections under `data` + paginator meta.
 */
class ResponseShapeTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE_KEY = 'shape-secret';

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['temp_air', 'humidity', 'rain_counter', 'wind_speed'] as $code) {
            SensorType::query()->create(['code' => $code, 'unit' => 'x', 'precision' => 1]);
        }

        Device::query()->create([
            'device_id' => 'WS-SHAPE-001',
            'name' => 'Shape probe',
            'location_id' => Location::query()->create([
                'name' => 'Garut', 'latitude' => -7.2, 'longitude' => 107.9,
            ])->id,
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', self::DEVICE_KEY),
        ]);

        Sanctum::actingAs(User::factory()->create(['email' => 'admin@weather.local']));
    }

    /** @return array<string, string> */
    private function deviceHeaders(): array
    {
        return ['Authorization' => 'Bearer '.self::DEVICE_KEY];
    }

    public function test_auth_endpoints_use_data_envelope(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@weather.local', 'password' => 'password',
        ])->assertOk();

        $login->assertJsonStructure(['data' => ['token', 'token_type', 'user']]);
        $token = $login->json('data.token');
        $this->assertNotEmpty($token);

        $this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('data.email', 'admin@weather.local');

        $this->postJson('/api/v1/auth/logout', [], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('data.revoked', true);
    }

    public function test_ingest_endpoints_use_data_envelope(): void
    {
        $payload = [
            'device_id' => 'WS-SHAPE-001',
            'fw' => '1.4.2',
            'ts' => 1757308800,
            'seq' => 1,
            'readings' => [['s' => 'temp_air', 'v' => 27.4]],
        ];

        $this->postJson('/api/v1/ingest/telemetry', $payload, $this->deviceHeaders())
            ->assertStatus(201)
            ->assertJsonPath('data.accepted', 1);

        $this->postJson('/api/v1/ingest/heartbeat', [
            'device_id' => 'WS-SHAPE-001',
            'ts' => 1757308920,
            'fw' => '1.4.2',
            'battery_v' => 3.90,
            'rssi' => -70,
            'uptime_s' => 864321,
        ], $this->deviceHeaders())
            ->assertOk()
            ->assertJsonPath('data.received', true);
    }

    public function test_query_endpoints_use_data_envelope(): void
    {
        $device = Device::query()->where('device_id', 'WS-SHAPE-001')->firstOrFail();
        $typeId = SensorType::query()->where('code', 'temp_air')->value('id');

        SensorReading::query()->create([
            'device_id' => $device->id,
            'sensor_type_id' => $typeId,
            'device_time' => '2026-09-19 10:00:00',
            'received_at' => now(),
            'raw_value' => 25.0,
            'value' => 25.0,
            'quality' => SensorReading::QUALITY_OK,
        ]);

        $this->getJson('/api/v1/devices/WS-SHAPE-001/readings/latest')
            ->assertOk()
            ->assertJsonPath('data.device_id', 'WS-SHAPE-001')
            ->assertJsonCount(1, 'data.sensors');

        $this->getJson('/api/v1/readings/summary?device_id=WS-SHAPE-001&from=2026-09-19T00:00:00Z&to=2026-09-20T00:00:00Z')
            ->assertOk()
            ->assertJsonPath('data.temp_avg', 25);

        $this->getJson('/api/v1/dashboard/overview')
            ->assertOk()
            ->assertJsonPath('data.counts.total', 1);

        $this->getJson('/api/v1/devices/WS-SHAPE-001/health')
            ->assertOk()
            ->assertJsonPath('data.device_id', 'WS-SHAPE-001');
    }

    public function test_rotate_returns_credential_resource(): void
    {
        $this->postJson('/api/v1/devices/WS-SHAPE-001/credentials/rotate')
            ->assertOk()
            ->assertJsonPath('data.device_id', 'WS-SHAPE-001');
    }
}
