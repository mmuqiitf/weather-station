<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Sensor;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Every error response exposes a stable, machine-readable `code` (§E.1).
 */
class ErrorContractTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsDashboardUser(): void
    {
        Sanctum::actingAs(User::factory()->create());
    }

    public function test_unauthenticated_error_has_code(): void
    {
        $this->getJson('/api/v1/devices')
            ->assertStatus(401)
            ->assertJsonPath('code', 'unauthenticated');
    }

    public function test_validation_error_has_validation_failed_code_and_field_errors(): void
    {
        $this->actingAsDashboardUser();

        $this->getJson('/api/v1/devices?sort=nope')
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonStructure(['message', 'errors' => ['sort']]);
    }

    public function test_domain_error_has_unprocessable_entity_code(): void
    {
        $this->actingAsDashboardUser();

        $device = Device::query()->create([
            'device_id' => 'WS-ERR-001',
            'name' => 'Error probe',
            'status' => Device::STATUS_PROVISIONED,
            'api_key_hash' => hash('sha256', 'key'),
        ]);

        // Illegal lifecycle jump provisioned -> decommissioned.
        $this->patchJson("/api/v1/devices/{$device->id}", ['status' => 'decommissioned'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'illegal_lifecycle_transition');
    }

    public function test_not_found_error_has_code(): void
    {
        $this->actingAsDashboardUser();

        $this->getJson('/api/v1/devices/999999')
            ->assertStatus(404)
            ->assertJsonPath('code', 'not_found');
    }

    public function test_conflict_error_has_code(): void
    {
        $this->actingAsDashboardUser();

        $type = SensorType::query()->create([
            'code' => 'temp_air', 'unit' => '°C', 'precision' => 1,
        ]);
        Sensor::query()->create(['serial' => 'SN-ERR-1', 'sensor_type_id' => $type->id]);

        $this->deleteJson("/api/v1/sensor-types/{$type->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'sensor_type_in_use');
    }

    public function test_error_carries_request_id_matching_header(): void
    {
        $this->actingAsDashboardUser();

        $response = $this->getJson('/api/v1/devices/999999');
        $response->assertStatus(404);

        $this->assertNotEmpty($response->json('request_id'));
        $this->assertSame($response->headers->get('X-Request-Id'), $response->json('request_id'));
    }

    public function test_inbound_request_id_is_honored(): void
    {
        $this->actingAsDashboardUser();

        $response = $this->getJson('/api/v1/devices/999999', ['X-Request-Id' => 'trace-123']);
        $response->assertStatus(404);

        $this->assertSame('trace-123', $response->json('request_id'));
        $this->assertSame('trace-123', $response->headers->get('X-Request-Id'));
    }

    public function test_ingest_rate_limit_returns_429_with_code_and_retry_after(): void
    {
        SensorType::query()->create(['code' => 'temp_air', 'unit' => '°C', 'precision' => 1]);

        $device = Device::query()->create([
            'device_id' => 'WS-ERR-RL',
            'name' => 'Rate limit probe',
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'rl-secret'),
        ]);

        $payload = [
            'device_id' => 'WS-ERR-RL',
            'ts' => 1757308800,
            'readings' => [['s' => 'temp_air', 'v' => 20]],
        ];
        $headers = ['Authorization' => 'Bearer rl-secret'];

        for ($i = 0; $i < 60; $i++) {
            $this->postJson('/api/v1/ingest/telemetry', $payload, $headers)->assertSuccessful();
        }

        $limited = $this->postJson('/api/v1/ingest/telemetry', $payload, $headers);
        $limited->assertStatus(429)->assertJsonPath('code', 'rate_limited');
        $this->assertNotNull($limited->headers->get('Retry-After'));

        $this->assertSame('WS-ERR-RL', $device->device_id);
    }

    public function test_forbidden_device_mismatch_has_code(): void
    {
        $device = Device::query()->create([
            'device_id' => 'WS-ERR-002',
            'name' => 'Error probe 2',
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'device-secret'),
        ]);

        $payload = [
            'device_id' => 'WS-OTHER',
            'ts' => 1757308800,
            'readings' => [['s' => 'temp_air', 'v' => 20]],
        ];

        $this->postJson('/api/v1/ingest/telemetry', $payload, [
            'Authorization' => 'Bearer device-secret',
        ])->assertStatus(403)->assertJsonPath('code', 'device_mismatch');

        $this->assertSame('WS-ERR-002', $device->device_id);
    }
}
