<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListDevicesRequest;
use App\Http\Requests\ListLocationsRequest;
use App\Http\Requests\StoreDeviceRequest;
use App\Http\Requests\UpdateDeviceRequest;
use App\Http\Resources\DeviceResource;
use App\Http\Resources\LocationResource;
use App\Models\Device;
use App\Models\Location;
use App\Support\DeviceLookup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class DeviceController extends Controller
{
    public function index(ListDevicesRequest $request): AnonymousResourceCollection
    {
        $validated = $request->validated();

        $query = Device::query()->with('location');

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['location_id'])) {
            $query->where('location_id', $validated['location_id']);
        }

        // Online mirrors Device::isOnline(): seen within the last 15 minutes.
        if (isset($validated['online'])) {
            $threshold = now()->subMinutes(15);
            if ($validated['online']) {
                $query->where('last_seen_at', '>=', $threshold);
            } else {
                $query->where(fn ($w) => $w->whereNull('last_seen_at')->orWhere('last_seen_at', '<', $threshold));
            }
        }

        if (! empty($validated['q'])) {
            $q = '%'.$validated['q'].'%';
            $query->where(fn ($w) => $w->where('device_id', 'ilike', $q)->orWhere('name', 'ilike', $q));
        }

        // Sort column is validated against an allow-list in ListDevicesRequest.
        $query->orderBy($validated['sort'] ?? 'id', $validated['direction'] ?? 'asc');

        return DeviceResource::collection($query->paginate($validated['per_page'] ?? 15));
    }

    public function store(StoreDeviceRequest $request): JsonResponse
    {
        $validated = $request->validated();

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

        return DeviceResource::make($device->load('location'))->withPlainKey($plainKey)
            ->response()->setStatusCode(201);
    }

    public function show(string $id): DeviceResource
    {
        return new DeviceResource(DeviceLookup::findOrFail($id)->load('location'));
    }

    public function update(UpdateDeviceRequest $request, string $id): DeviceResource
    {
        $device = DeviceLookup::findOrFail($id);
        $validated = $request->validated();

        // Controlled lifecycle: provisioned -> active -> decommissioned. No resurrection.
        if (isset($validated['status']) && ! self::allowedTransition($device->status, $validated['status'])) {
            abort(422, "Cannot transition {$device->status} -> {$validated['status']}.");
        }

        $device->fill($validated)->save();

        return new DeviceResource($device->fresh('location'));
    }

    public function destroy(string $id): Response
    {
        // Soft delete: historical readings/heartbeats retained (see JAWABAN.md A).
        DeviceLookup::findOrFail($id)->delete();

        return response()->noContent();
    }

    public function rotate(string $id): JsonResponse
    {
        $device = DeviceLookup::findOrFail($id);

        $plainKey = 'ws_'.Str::random(32);
        $device->forceFill(['api_key_hash' => hash('sha256', $plainKey)])->save();

        return response()->json(['device_id' => $device->device_id, 'api_key_plain' => $plainKey]);
    }

    public function indexLocations(ListLocationsRequest $request): AnonymousResourceCollection
    {
        return LocationResource::collection(
            Location::query()->orderBy('name')->paginate($request->validated()['per_page'] ?? 15)
        );
    }

    public function health(string $id): JsonResponse
    {
        $device = DeviceLookup::findOrFail($id);

        $latest = $device->heartbeats()->latest('device_time')->first();

        return response()->json([
            'device_id' => $device->device_id,
            'status' => $device->status,
            'is_online' => $device->isOnline(),
            'last_seen_at' => $device->last_seen_at?->toIso8601String(),
            'firmware_version' => $device->firmware_version,
            'battery_v' => $latest?->battery_v,
            'rssi' => $latest?->rssi,
        ]);
    }

    private static function allowedTransition(string $from, string $to): bool
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
}
