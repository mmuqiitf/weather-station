<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListDevicesRequest;
use App\Http\Requests\ListLocationsRequest;
use App\Http\Requests\StoreDeviceRequest;
use App\Http\Requests\UpdateDeviceRequest;
use App\Http\Resources\DeviceCredentialResource;
use App\Http\Resources\DeviceHealthResource;
use App\Http\Resources\DeviceResource;
use App\Http\Resources\LocationResource;
use App\Models\Device;
use App\Models\Location;
use App\Support\ApiErrorCode;
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
        // A unique id tie-breaker keeps page boundaries stable when sort values tie.
        $direction = $validated['direction'] ?? 'asc';
        $query->orderBy($validated['sort'] ?? 'id', $direction)->orderBy('id', $direction);

        return DeviceResource::collection($query->paginate($request->perPage()));
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
            throw new ApiException(
                ApiErrorCode::IllegalLifecycleTransition,
                "Cannot transition {$device->status} -> {$validated['status']}.",
            );
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

    public function rotate(string $id): DeviceCredentialResource
    {
        $device = DeviceLookup::findOrFail($id);

        $plainKey = 'ws_'.Str::random(32);
        $device->forceFill(['api_key_hash' => hash('sha256', $plainKey)])->save();

        return new DeviceCredentialResource($device->device_id, $plainKey);
    }

    public function indexLocations(ListLocationsRequest $request): AnonymousResourceCollection
    {
        return LocationResource::collection(
            Location::query()->orderBy('name')->orderBy('id')->paginate($request->perPage())
        );
    }

    public function health(string $id): DeviceHealthResource
    {
        $device = DeviceLookup::findOrFail($id);

        return new DeviceHealthResource(
            $device,
            $device->heartbeats()->latest('device_time')->first(),
        );
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
