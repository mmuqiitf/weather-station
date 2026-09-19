<?php

namespace Tests\Unit;

use App\Models\Device;
use App\Models\Location;
use App\Models\Sensor;
use App\Models\SensorCalibration;
use App\Models\SensorInstallation;
use App\Models\SensorReading;
use App\Models\SensorType;
use App\Services\IngestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class IngestServiceTest extends TestCase
{
    use RefreshDatabase;

    private function device(): Device
    {
        SensorType::query()->create(['code' => 'temp_air', 'unit' => '°C', 'min_value' => -50, 'max_value' => 60, 'precision' => 1]);
        SensorType::query()->create(['code' => 'humidity', 'unit' => '%', 'min_value' => 0, 'max_value' => 100, 'precision' => 1]);
        SensorType::query()->create(['code' => 'rain_counter', 'unit' => 'tips', 'min_value' => 0, 'max_value' => null, 'precision' => 0]);

        return Device::query()->create([
            'device_id' => 'WS-GRT-001',
            'name' => 'Garut 1',
            'location_id' => Location::query()->create(['name' => 'Garut', 'latitude' => -7.2, 'longitude' => 107.9])->id,
            'status' => Device::STATUS_ACTIVE,
            'api_key_hash' => Hash::make('secret'),
        ]);
    }

    public function test_rain_counter_delta_and_reset(): void
    {
        $service = new IngestService;
        $device = $this->device();

        $service->ingestTelemetry($device, ['ts' => 1757308800, 'readings' => [['s' => 'rain_counter', 'v' => 1043]]]);
        $service->ingestTelemetry($device, ['ts' => 1757308860, 'readings' => [['s' => 'rain_counter', 'v' => 1045]]]);
        $service->ingestTelemetry($device, ['ts' => 1757308920, 'readings' => [['s' => 'rain_counter', 'v' => 5]]]);

        $deltas = SensorReading::query()
            ->where('device_id', $device->id)
            ->whereHas('sensorType', fn ($q) => $q->where('code', 'rain_counter'))
            ->orderBy('device_time')
            ->pluck('mm_delta')
            ->map(fn ($v) => (float) $v)
            ->all();

        $this->assertSame([0.0, 0.4, 1.0], $deltas);
    }

    public function test_range_violation_is_flagged_not_dropped(): void
    {
        $service = new IngestService;
        $device = $this->device();

        $result = $service->ingestTelemetry($device, ['ts' => 1757308800, 'readings' => [['s' => 'humidity', 'v' => 150]]]);

        $this->assertSame(1, $result['accepted']);
        $this->assertSame(SensorReading::QUALITY_OUT_OF_RANGE, SensorReading::query()->value('quality'));
    }

    public function test_duplicate_payload_is_idempotent(): void
    {
        $service = new IngestService;
        $device = $this->device();
        $payload = ['ts' => 1757308800, 'readings' => [['s' => 'temp_air', 'v' => 27.4]]];

        $first = $service->ingestTelemetry($device, $payload);
        $second = $service->ingestTelemetry($device, $payload);

        $this->assertSame(1, $first['accepted']);
        $this->assertSame(1, $second['duplicates']);
        $this->assertSame(1, SensorReading::query()->count());
    }

    public function test_calibration_applies_offset_and_scale(): void
    {
        $service = new IngestService;
        $device = $this->device();
        $type = SensorType::where('code', 'temp_air')->firstOrFail();
        $sensor = Sensor::query()->create(['serial' => 'T-1', 'sensor_type_id' => $type->id]);
        SensorInstallation::query()->create([
            'sensor_id' => $sensor->id, 'device_id' => $device->id,
            'installed_at' => '2025-01-01 00:00:00',
        ]);
        SensorCalibration::query()->create([
            'sensor_id' => $sensor->id, 'offset' => 1.0, 'scale' => 2.0,
            'effective_at' => '2025-01-01 00:00:00',
        ]);
        $service->ingestTelemetry($device, ['ts' => 1757308800, 'readings' => [['s' => 'temp_air', 'v' => 10.0]]]);

        $reading = SensorReading::query()->firstOrFail();
        $this->assertSame(10.0, (float) $reading->raw_value);
        $this->assertSame(21.0, (float) $reading->value);
    }
}
