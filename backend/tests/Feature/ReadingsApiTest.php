<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\SensorReading;
use App\Models\SensorType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReadingsApiTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    /** @var array<string, int> */
    private array $typeIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());

        foreach (['temp_air', 'rain_counter', 'wind_dir'] as $code) {
            $this->typeIds[$code] = SensorType::query()->create([
                'code' => $code, 'unit' => 'x', 'precision' => 1,
            ])->id;
        }

        $this->device = Device::query()->create([
            'device_id' => 'WS-R-001', 'name' => 'Readings', 'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => hash('sha256', 'k'),
        ]);
    }

    private function reading(string $code, string $deviceTime, float $value, ?float $mmDelta = null): void
    {
        SensorReading::query()->create([
            'device_id' => $this->device->id,
            'sensor_type_id' => $this->typeIds[$code],
            'device_time' => $deviceTime,
            'received_at' => now(),
            'raw_value' => $value,
            'value' => $value,
            'mm_delta' => $mmDelta,
            'quality' => SensorReading::QUALITY_OK,
        ]);
    }

    public function test_raw_series_is_returned_with_paginator_and_applied_interval(): void
    {
        $this->reading('temp_air', '2026-09-19 10:00:00', 25.0);
        $this->reading('temp_air', '2026-09-19 10:01:00', 26.0);

        $this->getJson('/api/v1/readings?device_id=WS-R-001&sensor_type=temp_air&interval=raw')
            ->assertOk()
            ->assertJsonPath('interval_applied', 'raw')
            ->assertJsonCount(2, 'data');
    }

    public function test_aggregated_daily_sum_does_not_error_and_sums_rain(): void
    {
        $this->reading('rain_counter', '2026-09-18 10:00:00', 20.0, 1.0);
        $this->reading('rain_counter', '2026-09-19 10:00:00', 22.0, 0.4);

        $response = $this->getJson(
            '/api/v1/readings?device_id=WS-R-001&sensor_type=rain_counter&interval=1d&agg=sum'
            .'&from=2026-09-18T00:00:00Z&to=2026-09-20T00:00:00Z'
        )->assertOk()->assertJsonPath('interval_applied', '1d');

        $points = $response->json('points');
        $this->assertCount(2, $points);
        $this->assertEqualsWithDelta(1.0, $points[0]['v'], 0.0001);
        $this->assertEqualsWithDelta(0.4, $points[1]['v'], 0.0001);
    }

    public function test_aggregated_hourly_average(): void
    {
        $this->reading('temp_air', '2026-09-19 10:05:00', 20.0);
        $this->reading('temp_air', '2026-09-19 10:35:00', 30.0);

        $response = $this->getJson(
            '/api/v1/readings?device_id=WS-R-001&sensor_type=temp_air&interval=1h&agg=avg'
            .'&from=2026-09-19T10:00:00Z&to=2026-09-19T11:00:00Z'
        )->assertOk();

        $points = $response->json('points');
        $this->assertCount(1, $points);
        $this->assertEqualsWithDelta(25.0, $points[0]['v'], 0.0001);
        $this->assertSame(2, $points[0]['n']);
    }

    public function test_wind_direction_average_uses_vector_mean(): void
    {
        // 350° and 10° must average to ~0°, not the arithmetic 180°.
        $this->reading('wind_dir', '2026-09-19 10:10:00', 350.0);
        $this->reading('wind_dir', '2026-09-19 10:40:00', 10.0);

        $response = $this->getJson(
            '/api/v1/readings?device_id=WS-R-001&sensor_type=wind_dir&interval=1h&agg=avg'
            .'&from=2026-09-19T10:00:00Z&to=2026-09-19T11:00:00Z'
        )->assertOk();

        $value = $response->json('points.0.v');
        $this->assertTrue(
            abs($value) < 0.001 || abs($value - 360) < 0.001,
            "Expected vector mean near 0°/360°, got {$value}."
        );
    }
}
