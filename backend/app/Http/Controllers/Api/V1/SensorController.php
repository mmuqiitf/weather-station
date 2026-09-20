<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\AttachSensorRequest;
use App\Http\Requests\ListCalibrationsRequest;
use App\Http\Requests\ListSensorsRequest;
use App\Http\Requests\ListSensorTypesRequest;
use App\Http\Requests\StoreCalibrationRequest;
use App\Http\Requests\StoreSensorRequest;
use App\Http\Requests\StoreSensorTypeRequest;
use App\Http\Requests\UpdateSensorRequest;
use App\Http\Requests\UpdateSensorTypeRequest;
use App\Http\Resources\SensorCalibrationResource;
use App\Http\Resources\SensorInstallationResource;
use App\Http\Resources\SensorResource;
use App\Http\Resources\SensorTypeResource;
use App\Models\Sensor;
use App\Models\SensorCalibration;
use App\Models\SensorInstallation;
use App\Models\SensorType;
use App\Support\ApiErrorCode;
use App\Support\DeviceLookup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class SensorController extends Controller
{
    public function indexTypes(ListSensorTypesRequest $request): AnonymousResourceCollection
    {
        $validated = $request->validated();

        $query = SensorType::query()->withCount('sensors');

        if (! empty($validated['q'])) {
            $query->where('code', 'ilike', '%'.$validated['q'].'%');
        }

        if (! empty($validated['unit'])) {
            $query->where('unit', $validated['unit']);
        }

        if (isset($validated['in_use'])) {
            if ($validated['in_use']) {
                $query->whereHas('sensors');
            } else {
                $query->whereDoesntHave('sensors');
            }
        }

        // Sort column is validated against an allow-list in ListSensorTypesRequest.
        $direction = $validated['direction'] ?? 'asc';
        $query->orderBy($validated['sort'] ?? 'code', $direction)->orderBy('id', $direction);

        return SensorTypeResource::collection($query->paginate($request->perPage()));
    }

    public function storeType(StoreSensorTypeRequest $request): JsonResponse
    {
        return (new SensorTypeResource(SensorType::query()->create($request->validated())))
            ->response()->setStatusCode(201);
    }

    public function showType(int $id): SensorTypeResource
    {
        $type = SensorType::query()->find($id) ?? abort(404, 'Sensor type not found.');

        return new SensorTypeResource($type);
    }

    public function updateType(UpdateSensorTypeRequest $request, int $id): SensorTypeResource
    {
        $type = SensorType::query()->find($id) ?? abort(404, 'Sensor type not found.');

        $type->fill($request->validated())->save();

        return new SensorTypeResource($type->fresh());
    }

    public function destroyType(int $id): Response
    {
        $type = SensorType::query()->find($id) ?? abort(404, 'Sensor type not found.');

        if (Sensor::query()->where('sensor_type_id', $type->id)->exists()) {
            throw new ApiException(ApiErrorCode::SensorTypeInUse, 'Sensor type is in use.');
        }

        $type->delete();

        return response()->noContent();
    }

    public function index(ListSensorsRequest $request): AnonymousResourceCollection
    {
        $validated = $request->validated();

        $query = Sensor::query()->with(['type', 'installations']);

        if (! empty($validated['q'])) {
            $query->where('serial', 'ilike', '%'.$validated['q'].'%');
        }

        if (! empty($validated['sensor_type_id'])) {
            $query->where('sensor_type_id', $validated['sensor_type_id']);
        }

        if (isset($validated['mounted'])) {
            $open = fn ($w) => $w->whereNull('removed_at');
            if ($validated['mounted']) {
                $query->whereHas('installations', $open);
            } else {
                $query->whereDoesntHave('installations', $open);
            }
        }

        // Sort column is validated against an allow-list in ListSensorsRequest.
        $direction = $validated['direction'] ?? 'asc';
        $query->orderBy($validated['sort'] ?? 'id', $direction)->orderBy('id', $direction);

        return SensorResource::collection(
            $query->paginate($request->perPage())
        );
    }

    public function store(StoreSensorRequest $request): JsonResponse
    {
        return (new SensorResource(Sensor::query()->create($request->validated())))
            ->response()->setStatusCode(201);
    }

    public function update(UpdateSensorRequest $request, int $id): SensorResource
    {
        $sensor = Sensor::query()->find($id) ?? abort(404, 'Sensor not found.');

        $sensor->fill($request->validated())->save();

        return new SensorResource($sensor->fresh());
    }

    public function destroy(int $id): Response
    {
        $sensor = Sensor::query()->find($id) ?? abort(404, 'Sensor not found.');

        if ($sensor->installations()->whereNull('removed_at')->exists()) {
            throw new ApiException(ApiErrorCode::SensorMounted, 'Detach sensor before deleting.');
        }

        $sensor->delete();

        return response()->noContent();
    }

    public function attach(AttachSensorRequest $request, string $id): JsonResponse
    {
        $device = DeviceLookup::findOrFail($id);
        $validated = $request->validated();

        if (SensorInstallation::query()->where('sensor_id', $validated['sensor_id'])->whereNull('removed_at')->exists()) {
            throw new ApiException(ApiErrorCode::SensorAttachedElsewhere, 'Sensor is attached elsewhere.');
        }

        // Close any open installation of the same sensor type on this device (one slot per type).
        $sensor = Sensor::query()->find($validated['sensor_id']);
        $open = SensorInstallation::query()->where('device_id', $device->id)->whereNull('removed_at')
            ->whereHas('sensor', fn ($q) => $q->where('sensor_type_id', $sensor->sensor_type_id))->first();
        if ($open !== null) {
            $open->forceFill(['removed_at' => $validated['installed_at'] ?? now()])->save();
        }

        $installation = SensorInstallation::query()->create([
            'sensor_id' => $validated['sensor_id'],
            'device_id' => $device->id,
            'installed_at' => $validated['installed_at'] ?? now(),
        ]);

        return (new SensorInstallationResource($installation))->response()->setStatusCode(201);
    }

    public function detach(string $id, int $sensorId): SensorInstallationResource
    {
        $device = DeviceLookup::findOrFail($id);

        $installation = SensorInstallation::query()
            ->where('device_id', $device->id)->where('sensor_id', $sensorId)->whereNull('removed_at')->first()
            ?? abort(404, 'Active installation not found.');

        $installation->forceFill(['removed_at' => now()])->save();

        return new SensorInstallationResource($installation);
    }

    public function indexCalibrations(ListCalibrationsRequest $request, int $id): AnonymousResourceCollection
    {
        $sensor = Sensor::query()->find($id) ?? abort(404, 'Sensor not found.');

        return SensorCalibrationResource::collection(
            $sensor->calibrations()
                ->orderByDesc('effective_at')->orderByDesc('id')
                ->paginate($request->perPage())
        );
    }

    public function storeCalibration(StoreCalibrationRequest $request, int $id): JsonResponse
    {
        Sensor::query()->find($id) ?? abort(404, 'Sensor not found.');
        $validated = $request->validated();

        $calibration = SensorCalibration::query()->create([
            'sensor_id' => $id,
            'offset' => $validated['offset'] ?? 0,
            'scale' => $validated['scale'] ?? 1,
            'effective_at' => $validated['effective_at'],
        ]);

        return (new SensorCalibrationResource($calibration))->response()->setStatusCode(201);
    }
}
