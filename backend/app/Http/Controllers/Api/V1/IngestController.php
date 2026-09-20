<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\BatchTelemetryRequest;
use App\Http\Requests\HeartbeatRequest;
use App\Http\Requests\TelemetryRequest;
use App\Http\Resources\HeartbeatResource;
use App\Http\Resources\IngestResultResource;
use App\Models\Device;
use App\Services\IngestService;
use App\Support\ApiErrorCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class IngestController extends Controller
{
    public function telemetry(TelemetryRequest $request, IngestService $ingest): JsonResponse
    {
        $validated = $request->validated();

        $device = self::device($request);
        self::assertOwnership($device, $validated['device_id']);

        $result = $ingest->ingestTelemetry($device, [
            'ts' => $validated['ts'],
            'battery_v' => $validated['battery_v'] ?? null,
            'rssi' => $validated['rssi'] ?? null,
            'readings' => $validated['readings'],
        ]);

        if ($result['rejected'] !== []) {
            throw ValidationException::withMessages(
                collect($result['rejected'])->mapWithKeys(fn ($item) => [
                    "payload.{$item['index']}" => self::rejectionMessage($item['code'] ?? ''),
                ])->all()
            );
        }

        return (new IngestResultResource($result))->response()
            ->setStatusCode($result['duplicates'] > 0 ? 200 : 201);
    }

    public function batch(BatchTelemetryRequest $request, IngestService $ingest): JsonResponse
    {
        $validated = $request->validated();

        $device = self::device($request);
        self::assertOwnership($device, $validated['device_id']);

        $result = $ingest->ingestBatch($device, $validated['batch']);

        $status = $result['rejected'] !== [] || $result['duplicates'] > 0 ? 207 : 201;

        return (new IngestResultResource($result))->response()->setStatusCode($status);
    }

    public function heartbeat(HeartbeatRequest $request): HeartbeatResource
    {
        $validated = $request->validated();

        $device = self::device($request);
        self::assertOwnership($device, $validated['device_id']);

        $receivedAt = now();

        $device->heartbeats()->create([
            'device_time' => gmdate('Y-m-d H:i:s', $validated['ts']),
            'received_at' => $receivedAt,
            'firmware_version' => $validated['fw'] ?? null,
            'battery_v' => $validated['battery_v'] ?? null,
            'rssi' => $validated['rssi'] ?? null,
            'uptime_s' => $validated['uptime_s'] ?? null,
        ]);

        $device->forceFill([
            'last_seen_at' => $receivedAt,
            'firmware_version' => $validated['fw'] ?? $device->firmware_version,
            'status' => $device->status === Device::STATUS_PROVISIONED ? Device::STATUS_ACTIVE : $device->status,
        ])->save();

        return new HeartbeatResource;
    }

    private static function device(Request $request): Device
    {
        /** @var Device $device */
        $device = $request->attributes->get('device');

        return $device;
    }

    private static function assertOwnership(Device $device, string $payloadDeviceId): void
    {
        if ($payloadDeviceId !== $device->device_id) {
            throw new ApiException(ApiErrorCode::DeviceMismatch, 'Payload device_id does not match authenticated device.');
        }
    }

    private static function rejectionMessage(string $code): string
    {
        return match ($code) {
            'unknown_sensor_type' => 'Unknown sensor type.',
            'invalid_value' => 'Invalid reading value.',
            default => 'Payload rejected.',
        };
    }
}
