<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\IngestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IngestController extends Controller
{
    public function telemetry(Request $request, IngestService $ingest): JsonResponse
    {
        $validated = $request->validate([
            'device_id' => ['required', 'string'],
            'fw' => ['nullable', 'string'],
            'ts' => ['required', 'integer', 'min:0'],
            'seq' => ['nullable', 'integer', 'min:0'],
            'battery_v' => ['nullable', 'numeric'],
            'rssi' => ['nullable', 'integer'],
            'readings' => ['required', 'array', 'min:1'],
            'readings.*.s' => ['required', 'string'],
            'readings.*.v' => ['required', 'numeric'],
        ]);

        /** @var Device $device */
        $device = $request->attributes->get('device');

        if ($validated['device_id'] !== $device->device_id) {
            return $this->error($request, 'device_mismatch', 'Payload device_id does not match authenticated device.', 403);
        }

        $result = $ingest->ingestTelemetry($device, [
            'ts' => $validated['ts'],
            'battery_v' => isset($validated['battery_v']) ? $validated['battery_v'] : null,
            'rssi' => isset($validated['rssi']) ? $validated['rssi'] : null,
            'readings' => $validated['readings'],
        ]);

        if ($result['rejected'] !== []) {
            return $this->error($request, $result['rejected'][0]['code'], 'Payload rejected.', 422, $result['rejected']);
        }

        if ($result['duplicates'] > 0) {
            return $this->envelope($request, $result, 200);
        }

        return $this->envelope($request, $result, 201);
    }

    public function batch(Request $request, IngestService $ingest): JsonResponse
    {
        $validated = $request->validate([
            'device_id' => ['required', 'string'],
            'fw' => ['nullable', 'string'],
            'batch' => ['required', 'array', 'min:1', 'max:'.IngestService::MAX_BATCH],
            'batch.*.ts' => ['required', 'integer', 'min:0'],
            'batch.*.seq' => ['nullable', 'integer', 'min:0'],
            'batch.*.battery_v' => ['nullable', 'numeric'],
            'batch.*.rssi' => ['nullable', 'integer'],
            'batch.*.readings' => ['required', 'array', 'min:1'],
            'batch.*.readings.*.s' => ['required', 'string'],
            'batch.*.readings.*.v' => ['required', 'numeric'],
        ]);

        /** @var Device $device */
        $device = $request->attributes->get('device');

        if ($validated['device_id'] !== $device->device_id) {
            return $this->error($request, 'device_mismatch', 'Payload device_id does not match authenticated device.', 403);
        }

        $result = $ingest->ingestBatch($device, $validated['batch']);

        $status = $result['rejected'] !== [] || $result['duplicates'] > 0 ? 207 : 201;

        return $this->envelope($request, $result, $status);
    }

    public function heartbeat(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'device_id' => ['required', 'string'],
            'ts' => ['required', 'integer', 'min:0'],
            'fw' => ['nullable', 'string'],
            'battery_v' => ['nullable', 'numeric'],
            'rssi' => ['nullable', 'integer'],
            'uptime_s' => ['nullable', 'integer', 'min:0'],
        ]);

        /** @var Device $device */
        $device = $request->attributes->get('device');

        if ($validated['device_id'] !== $device->device_id) {
            return $this->error($request, 'device_mismatch', 'Payload device_id does not match authenticated device.', 403);
        }

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

        return $this->envelope($request, ['received' => true], 200);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function envelope(Request $request, array $data, int $status): JsonResponse
    {
        return response()->json([
            'data' => $data,
            'error' => null,
            'meta' => ['request_id' => $request->attributes->get('request_id')],
        ], $status);
    }

    /**
     * @param  array<int, array<string, string>>|null  $details
     */
    private function error(Request $request, string $code, string $message, int $status, ?array $details = null): JsonResponse
    {
        return response()->json([
            'data' => null,
            'error' => ['code' => $code, 'message' => $message, 'details' => $details],
            'meta' => ['request_id' => $request->attributes->get('request_id')],
        ], $status);
    }
}
