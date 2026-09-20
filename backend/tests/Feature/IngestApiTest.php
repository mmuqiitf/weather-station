<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Location;
use App\Models\SensorType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IngestApiTest extends TestCase
{
    use RefreshDatabase;

    private string $apiKey = 'device-secret-key';

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['temp_air', 'humidity', 'rain_counter'] as $code) {
            SensorType::query()->create([
                'code' => $code, 'unit' => 'x', 'min_value' => $code === 'humidity' ? 0 : null,
                'max_value' => $code === 'humidity' ? 100 : null, 'precision' => 1,
            ]);
        }

        $this->device = Device::query()->create([
            'device_id' => 'WS-GRT-001',
            'name' => 'Garut 1',
            'location_id' => Location::query()->create(['name' => 'Garut', 'latitude' => -7.2, 'longitude' => 107.9])->id,
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', $this->apiKey),
        ]);
    }

    private function headers(): array
    {
        return ['Authorization' => 'Bearer '.$this->apiKey];
    }

    private function payload(): array
    {
        return [
            'device_id' => 'WS-GRT-001',
            'fw' => '1.4.2',
            'ts' => 1757308800,
            'seq' => 10432,
            'battery_v' => 3.92,
            'rssi' => -71,
            'readings' => [['s' => 'temp_air', 'v' => 27.4]],
        ];
    }

    public function test_telemetry_accepts_valid_payload(): void
    {
        $response = $this->postJson('/api/v1/ingest/telemetry', $this->payload(), $this->headers());

        $response->assertStatus(201)
            ->assertJsonPath('data.accepted', 1)
            ->assertJsonPath('data.duplicates', 0);
        $this->assertNotNull($response->headers->get('X-Request-Id'));
    }

    public function test_telemetry_rejects_bad_credentials(): void
    {
        $response = $this->postJson('/api/v1/ingest/telemetry', $this->payload(), ['Authorization' => 'Bearer wrong']);

        $response->assertStatus(401)->assertJsonPath('message', 'Invalid or missing device credentials.');
    }

    public function test_telemetry_rejects_device_mismatch(): void
    {
        $payload = $this->payload();
        $payload['device_id'] = 'WS-OTHER';

        $response = $this->postJson('/api/v1/ingest/telemetry', $payload, $this->headers());

        $response->assertStatus(403)->assertJsonPath('message', 'Payload device_id does not match authenticated device.');
    }

    public function test_duplicate_returns_200_with_duplicate_count(): void
    {
        $this->postJson('/api/v1/ingest/telemetry', $this->payload(), $this->headers());
        $response = $this->postJson('/api/v1/ingest/telemetry', $this->payload(), $this->headers());

        $response->assertStatus(200)->assertJsonPath('data.duplicates', 1);
    }

    public function test_batch_partial_success_returns_207(): void
    {
        $body = [
            'device_id' => 'WS-GRT-001',
            'fw' => '1.4.2',
            'batch' => [
                ['ts' => 1757308800, 'seq' => 1, 'readings' => [['s' => 'temp_air', 'v' => 27.4]]],
                ['ts' => 1757308800, 'seq' => 1, 'readings' => [['s' => 'temp_air', 'v' => 27.4]]],
            ],
        ];

        $response = $this->postJson('/api/v1/ingest/telemetry/batch', $body, $this->headers());

        $response->assertStatus(207)
            ->assertJsonPath('data.accepted', 1)
            ->assertJsonPath('data.duplicates', 1);
    }

    public function test_batch_over_limit_is_rejected(): void
    {
        $body = [
            'device_id' => 'WS-GRT-001',
            'batch' => array_fill(0, 501, ['ts' => 1757308800, 'readings' => [['s' => 'temp_air', 'v' => 1]]]),
        ];

        $response = $this->postJson('/api/v1/ingest/telemetry/batch', $body, $this->headers());

        $response->assertStatus(422);
    }

    public function test_heartbeat_records_health(): void
    {
        $response = $this->postJson('/api/v1/ingest/heartbeat', [
            'device_id' => 'WS-GRT-001',
            'ts' => 1757308920,
            'fw' => '1.4.2',
            'battery_v' => 3.90,
            'rssi' => -70,
            'uptime_s' => 864321,
        ], $this->headers());

        $response->assertStatus(200)->assertJsonPath('data.received', true);
        $this->assertSame(1, $this->device->fresh()->heartbeats()->count());
    }

    public function test_unknown_device_id_returns_401(): void
    {
        $response = $this->postJson('/api/v1/ingest/telemetry', $this->payload());

        $response->assertStatus(401);
    }
}
