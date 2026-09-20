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
            ->assertJsonPath('code', 'unprocessable_entity');
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
            ->assertJsonPath('code', 'conflict');
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
        ])->assertStatus(403)->assertJsonPath('code', 'forbidden');

        $this->assertSame('WS-ERR-002', $device->device_id);
    }
}
