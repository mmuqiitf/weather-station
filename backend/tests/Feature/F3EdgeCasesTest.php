<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Location;
use App\Models\SensorReading;
use App\Models\SensorType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The eight edge cases the spec requires us to handle and prove (§F.3).
 */
class F3EdgeCasesTest extends TestCase
{
    use RefreshDatabase;

    private const API_KEY = 'device-secret-key';

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            ['code' => 'temp_air', 'unit' => '°C', 'min_value' => -40, 'max_value' => 60],
            ['code' => 'humidity', 'unit' => '%RH', 'min_value' => 0, 'max_value' => 100],
            ['code' => 'pressure', 'unit' => 'hPa', 'min_value' => 300, 'max_value' => 1100],
            ['code' => 'rain_counter', 'unit' => 'tips', 'min_value' => 0, 'max_value' => 99999999],
            ['code' => 'wind_speed', 'unit' => 'm/s', 'min_value' => 0, 'max_value' => 75],
            ['code' => 'wind_dir', 'unit' => '°', 'min_value' => 0, 'max_value' => 359],
            ['code' => 'solar_rad', 'unit' => 'W/m²', 'min_value' => 0, 'max_value' => 2000],
        ] as $type) {
            SensorType::query()->create($type + ['precision' => 1]);
        }

        $this->device = Device::query()->create([
            'device_id' => 'WS-GRT-001',
            'name' => 'Garut 1',
            'location_id' => Location::query()->create([
                'name' => 'Garut', 'latitude' => -7.2, 'longitude' => 107.9,
            ])->id,
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', self::API_KEY),
        ]);
    }

    /** @return array<string, string> */
    private function headers(): array
    {
        return ['Authorization' => 'Bearer '.self::API_KEY];
    }

    /**
     * @param  array<int, array{s: string, v: float|int}>  $readings
     * @return array<string, mixed>
     */
    private function payload(array $readings, ?int $ts = null, int $seq = 1): array
    {
        return [
            'device_id' => 'WS-GRT-001',
            'fw' => '1.4.2',
            'ts' => $ts ?? 1757308800,
            'seq' => $seq,
            'battery_v' => 3.92,
            'rssi' => -71,
            'readings' => $readings,
        ];
    }

    private function readingFor(string $sensorCode): SensorReading
    {
        $typeId = SensorType::query()->where('code', $sensorCode)->value('id');

        return SensorReading::query()
            ->where('device_id', $this->device->id)
            ->where('sensor_type_id', $typeId)
            ->firstOrFail();
    }

    public function test_case_1_future_timestamp_is_accepted_and_recorded_as_device_time(): void
    {
        $future = time() + 7200;

        $response = $this->postJson(
            '/api/v1/ingest/telemetry',
            $this->payload([['s' => 'temp_air', 'v' => 27.4]], $future),
            $this->headers()
        );

        $response->assertStatus(201)->assertJsonPath('accepted', 1);

        $reading = $this->readingFor('temp_air');
        $this->assertSame(gmdate('Y-m-d H:i:s', $future), $reading->device_time->utc()->toDateTimeString());
        $this->assertNotNull($reading->received_at);
    }

    public function test_case_2_sensor_error_code_is_flagged_suspect_not_dropped(): void
    {
        $this->postJson(
            '/api/v1/ingest/telemetry',
            $this->payload([['s' => 'temp_air', 'v' => -999]]),
            $this->headers()
        )->assertStatus(201);

        $reading = $this->readingFor('temp_air');
        $this->assertSame(SensorReading::QUALITY_SUSPECT, $reading->quality);
        $this->assertSame(-999.0, (float) $reading->raw_value);
    }

    public function test_case_3_out_of_range_humidity_is_flagged_out_of_range(): void
    {
        $this->postJson(
            '/api/v1/ingest/telemetry',
            $this->payload([['s' => 'humidity', 'v' => 150]]),
            $this->headers()
        )->assertStatus(201);

        $this->assertSame(
            SensorReading::QUALITY_OUT_OF_RANGE,
            $this->readingFor('humidity')->quality
        );
    }

    public function test_case_4_rain_counter_reset_never_yields_negative_rainfall(): void
    {
        // Two restarts inside one hour: 1043 -> 5 -> 3 -> 1.
        foreach ([1043, 5, 3, 1] as $i => $counter) {
            $this->postJson(
                '/api/v1/ingest/telemetry',
                $this->payload([['s' => 'rain_counter', 'v' => $counter]], 1757308800 + $i * 60),
                $this->headers()
            )->assertStatus(201);
        }

        $deltas = SensorReading::query()
            ->where('device_id', $this->device->id)
            ->orderBy('device_time')
            ->pluck('mm_delta')
            ->map(fn ($v) => (float) $v)
            ->all();

        // 1043 first (0), then resets of 5, 3, 1 tips -> 1.0, 0.6, 0.2 mm; never negative.
        $this->assertSame([0.0, 1.0, 0.6, 0.2], $deltas);
        $this->assertSame(1.8, round(array_sum($deltas), 2));
    }

    public function test_case_5_identical_payload_sent_three_times_is_idempotent(): void
    {
        $payload = $this->payload([['s' => 'temp_air', 'v' => 27.4]]);

        $first = $this->postJson('/api/v1/ingest/telemetry', $payload, $this->headers());
        $second = $this->postJson('/api/v1/ingest/telemetry', $payload, $this->headers());
        $third = $this->postJson('/api/v1/ingest/telemetry', $payload, $this->headers());

        $first->assertStatus(201)->assertJsonPath('accepted', 1);
        $second->assertStatus(200)->assertJsonPath('duplicates', 1);
        $third->assertStatus(200)->assertJsonPath('duplicates', 1);
        $this->assertSame(1, SensorReading::query()->count());
    }

    public function test_case_6_unknown_device_id_returns_401_with_code(): void
    {
        $payload = $this->payload([['s' => 'temp_air', 'v' => 27.4]]);
        $payload['device_id'] = 'WS-UNKNOWN-999';

        // No registered device matches, so credentials are rejected (401), not 403.
        $this->postJson('/api/v1/ingest/telemetry', $payload)
            ->assertStatus(401)
            ->assertJsonPath('code', 'unauthenticated');
    }

    public function test_case_7_missing_sensor_creates_no_row(): void
    {
        $this->postJson(
            '/api/v1/ingest/telemetry',
            $this->payload([['s' => 'temp_air', 'v' => 27.4]]),
            $this->headers()
        )->assertStatus(201);

        $solarId = SensorType::query()->where('code', 'solar_rad')->value('id');
        $this->assertSame(0, SensorReading::query()->where('sensor_type_id', $solarId)->count());
    }

    public function test_case_8_batch_of_500_is_accepted_and_501_is_rejected(): void
    {
        $batch = [];
        for ($i = 0; $i < 500; $i++) {
            $batch[] = [
                'ts' => 1757308800 + $i * 60,
                'seq' => 1000 + $i,
                'readings' => [['s' => 'temp_air', 'v' => 20 + ($i % 10)]],
            ];
        }

        $this->postJson('/api/v1/ingest/telemetry/batch', [
            'device_id' => 'WS-GRT-001', 'fw' => '1.4.2', 'batch' => $batch,
        ], $this->headers())
            ->assertStatus(201)
            ->assertJsonPath('accepted', 500)
            ->assertJsonPath('duplicates', 0);

        $this->assertSame(500, SensorReading::query()->count());

        $over = array_fill(0, 501, [
            'ts' => 1757400000, 'readings' => [['s' => 'temp_air', 'v' => 1]],
        ]);

        $this->postJson('/api/v1/ingest/telemetry/batch', [
            'device_id' => 'WS-GRT-001', 'batch' => $over,
        ], $this->headers())
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed');
    }
}
