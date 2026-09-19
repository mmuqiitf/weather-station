<?php

namespace App\Services;

use App\Models\Device;
use App\Models\SensorCalibration;
use App\Models\SensorInstallation;
use App\Models\SensorReading;
use App\Models\SensorType;
use Carbon\CarbonImmutable;

class IngestService
{
    public const MM_PER_TIP = 0.2;

    public const MAX_BATCH = 500;

    /**
     * @param  array{ts: int, battery_v?: float, rssi?: int, readings: array<int, array{s: string, v: float}>}  $payload
     * @return array{accepted: int, duplicates: int, rejected: array<int, array<string, string>>}
     */
    public function ingestTelemetry(Device $device, array $payload): array
    {
        return $this->ingestBatch($device, [$payload]);
    }

    /**
     * @param  array<int, array{ts: int, battery_v?: float, rssi?: int, readings: array<int, array{s: string, v: float}>}>  $items
     * @return array{accepted: int, duplicates: int, rejected: array<int, array<string, string>>}
     */
    public function ingestBatch(Device $device, array $items): array
    {
        $accepted = 0;
        $duplicates = 0;
        $rejected = [];
        $receivedAt = now();

        $types = SensorType::all()->keyBy('code');

        foreach ($items as $index => $item) {
            $deviceTime = CarbonImmutable::createFromTimestampUTC($item['ts'])->toDateTimeString();
            $rows = [];

            foreach ($item['readings'] as $reading) {
                $type = $types->get($reading['s']);
                if ($type === null) {
                    $rejected[] = ['index' => (string) $index, 'code' => 'unknown_sensor_type'];

                    continue 2;
                }

                $quality = $this->qualityFor($type, (float) $reading['v']);
                if ($quality === 'rejected') {
                    $rejected[] = ['index' => (string) $index, 'code' => 'invalid_value'];

                    continue 2;
                }

                $calibrated = $this->calibratedValue($device, $type->id, (float) $reading['v'], $deviceTime);
                $mmDelta = $type->code === 'rain_counter'
                    ? $this->rainDeltaMm($device->id, (float) $reading['v'], $deviceTime)
                    : null;

                $rows[] = [
                    'device_id' => $device->id,
                    'sensor_type_id' => $type->id,
                    'sensor_id' => $this->sensorIdAt($device->id, $type->id, $deviceTime),
                    'device_time' => $deviceTime,
                    'received_at' => $receivedAt,
                    'raw_value' => $reading['v'],
                    'value' => $calibrated,
                    'mm_delta' => $mmDelta,
                    'quality' => $quality,
                    'created_at' => $receivedAt,
                    'updated_at' => $receivedAt,
                ];
            }

            if ($rows === []) {
                $accepted++;

                continue;
            }

            $inserted = SensorReading::insertOrIgnore($rows);

            if ($inserted === 0) {
                $duplicates++;
            } else {
                $accepted++;
            }
        }

        $device->forceFill([
            'last_seen_at' => $receivedAt,
            'status' => $device->status === Device::STATUS_PROVISIONED ? Device::STATUS_ACTIVE : $device->status,
        ])->save();

        return ['accepted' => $accepted, 'duplicates' => $duplicates, 'rejected' => $rejected];
    }

    private function qualityFor(SensorType $type, float $value): string
    {
        if ($value === -999.0) {
            return SensorReading::QUALITY_SUSPECT;
        }

        if (($type->min_value !== null && $value < (float) $type->min_value)
            || ($type->max_value !== null && $value > (float) $type->max_value)) {
            return SensorReading::QUALITY_OUT_OF_RANGE;
        }

        return SensorReading::QUALITY_OK;
    }

    private function calibratedValue(Device $device, int $sensorTypeId, float $raw, string $deviceTime): float
    {
        $installation = SensorInstallation::query()
            ->where('device_id', $device->id)
            ->whereNull('removed_at')
            ->whereHas('sensor', fn ($q) => $q->where('sensor_type_id', $sensorTypeId))
            ->with(['sensor.calibrations' => fn ($q) => $q->where('effective_at', '<=', $deviceTime)->latest('effective_at')])
            ->first();

        $calibration = $installation?->sensor?->calibrations->first();

        if ($calibration instanceof SensorCalibration) {
            return ((float) $calibration->offset) + ((float) $calibration->scale) * $raw;
        }

        return $raw;
    }

    private function sensorIdAt(int $deviceId, int $sensorTypeId, string $deviceTime): ?int
    {
        return SensorInstallation::query()
            ->where('device_id', $deviceId)
            ->where('installed_at', '<=', $deviceTime)
            ->where(fn ($q) => $q->whereNull('removed_at')->orWhere('removed_at', '>', $deviceTime))
            ->whereHas('sensor', fn ($q) => $q->where('sensor_type_id', $sensorTypeId))
            ->value('sensor_id');
    }

    private function rainDeltaMm(int $deviceId, float $counter, string $deviceTime): float
    {
        $rainTypeId = SensorType::where('code', 'rain_counter')->value('id');

        $previous = SensorReading::query()
            ->where('device_id', $deviceId)
            ->where('sensor_type_id', $rainTypeId)
            ->where('device_time', '<', $deviceTime)
            ->latest('device_time')
            ->value('raw_value');

        if ($previous === null) {
            return 0.0;
        }

        $delta = ((float) $counter) >= ((float) $previous)
            ? ((float) $counter) - ((float) $previous)
            : (float) $counter;

        return round($delta * self::MM_PER_TIP, 4);
    }
}
