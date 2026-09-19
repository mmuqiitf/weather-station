<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Device;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DeviceController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in([Device::STATUS_PROVISIONED, Device::STATUS_ACTIVE, Device::STATUS_DECOMMISSIONED])],
            'location_id' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Device::query()->with('location')->orderBy('id');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['location_id'])) {
            $query->where('location_id', $validated['location_id']);
        }

        if (! empty($validated['q'])) {
            $q = '%'.$validated['q'].'%';
            $query->where(fn ($w) => $w->where('device_id', 'like', $q)->orWhere('name', 'like', $q));
        }

        $paginator = $query->paginate($validated['per_page'] ?? 15);

        $paginator->getCollection()->transform(fn (Device $d) => $this->shape($d));

        return $this->paginated($request, $paginator);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'device_id' => ['required', 'string', 'max:64', 'unique:devices,device_id'],
            'name' => ['required', 'string', 'max:255'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'location' => ['nullable', 'array'],
            'location.name' => ['required_with:location', 'string', 'max:255'],
            'location.latitude' => ['required_with:location', 'numeric', 'between:-90,90'],
            'location.longitude' => ['required_with:location', 'numeric', 'between:-180,180'],
            'location.altitude_m' => ['nullable', 'numeric'],
        ]);

        if (empty($validated['location_id']) && ! empty($validated['location'])) {
            $validated['location_id'] = Location::query()->create($validated['location'])->id;
        }

        $plainKey = 'ws_'.Str::random(32);

        $device = Device::query()->create([
            'device_id' => $validated['device_id'],
            'name' => $validated['name'],
            'location_id' => $validated['location_id'] ?? null,
            'status' => Device::STATUS_PROVISIONED,
            'api_key_hash' => hash('sha256', $plainKey),
        ]);

        $data = $this->shape($device->load('location'));
        $data['api_key_plain'] = $plainKey;

        return $this->envelope($request, $data, 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        return $this->envelope($request, $this->shape($device->load('location')));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'location_id' => ['sometimes', 'nullable', 'integer', 'exists:locations,id'],
            'status' => ['sometimes', Rule::in([Device::STATUS_PROVISIONED, Device::STATUS_ACTIVE, Device::STATUS_DECOMMISSIONED])],
        ]);

        // Controlled lifecycle: provisioned -> active -> decommissioned. No resurrection.
        if (isset($validated['status']) && ! $this->allowedTransition($device->status, $validated['status'])) {
            return $this->error($request, 'invalid_status_transition',
                "Cannot transition {$device->status} -> {$validated['status']}.", 422);
        }

        $device->fill($validated)->save();

        return $this->envelope($request, $this->shape($device->fresh('location')));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        // Soft delete: historical readings/heartbeats retained (see JAWABAN.md A).
        $device->delete();

        return response()->json(null, 204);
    }

    public function rotate(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        $plainKey = 'ws_'.Str::random(32);
        $device->forceFill(['api_key_hash' => hash('sha256', $plainKey)])->save();

        return $this->envelope($request, ['device_id' => $device->device_id, 'api_key_plain' => $plainKey]);
    }

    public function health(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        $latest = $device->heartbeats()->latest('device_time')->first();

        return $this->envelope($request, [
            'device_id' => $device->device_id,
            'status' => $device->status,
            'is_online' => $device->isOnline(),
            'last_seen_at' => $device->last_seen_at?->toIso8601String(),
            'firmware_version' => $device->firmware_version,
            'battery_v' => $latest?->battery_v,
            'rssi' => $latest?->rssi,
        ]);
    }

    private function allowedTransition(string $from, string $to): bool
    {
        if ($from === $to) {
            return true;
        }

        return match ($from) {
            Device::STATUS_PROVISIONED => $to === Device::STATUS_ACTIVE,
            Device::STATUS_ACTIVE => $to === Device::STATUS_DECOMMISSIONED,
            default => false,
        };
    }

    private function shape(Device $device): array
    {
        return [
            'id' => $device->id,
            'device_id' => $device->device_id,
            'name' => $device->name,
            'status' => $device->status,
            'is_online' => $device->isOnline(),
            'last_seen_at' => $device->last_seen_at?->toIso8601String(),
            'firmware_version' => $device->firmware_version,
            'location' => $device->location ? [
                'id' => $device->location->id,
                'name' => $device->location->name,
                'latitude' => (float) $device->location->latitude,
                'longitude' => (float) $device->location->longitude,
                'altitude_m' => $device->location->altitude_m !== null ? (float) $device->location->altitude_m : null,
            ] : null,
        ];
    }
}
