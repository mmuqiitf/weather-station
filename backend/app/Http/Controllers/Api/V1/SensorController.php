<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Sensor;
use App\Models\SensorCalibration;
use App\Models\SensorInstallation;
use App\Models\SensorType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SensorController extends ApiController
{
    public function indexTypes(Request $request): JsonResponse
    {
        $types = SensorType::query()->orderBy('code')->get()->map(fn (SensorType $t) => [
            'id' => $t->id, 'code' => $t->code, 'unit' => $t->unit,
            'min_value' => $t->min_value !== null ? (float) $t->min_value : null,
            'max_value' => $t->max_value !== null ? (float) $t->max_value : null,
            'precision' => $t->precision,
        ]);

        return $this->envelope($request, $types);
    }

    public function storeType(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:64', 'unique:sensor_types,code'],
            'unit' => ['required', 'string', 'max:32'],
            'min_value' => ['nullable', 'numeric'],
            'max_value' => ['nullable', 'numeric'],
            'precision' => ['nullable', 'integer', 'min:0', 'max:6'],
        ]);

        $type = SensorType::query()->create($validated);

        return $this->envelope($request, $type, 201);
    }

    public function index(Request $request): JsonResponse
    {
        $paginator = Sensor::query()->with(['type', 'installations'])
            ->orderBy('id')->paginate($request->integer('per_page', 15));

        $paginator->getCollection()->transform(fn (Sensor $s) => [
            'id' => $s->id, 'serial' => $s->serial,
            'sensor_type' => $s->type?->code,
            'current_device_id' => $s->installations->firstWhere('removed_at', null)?->device_id,
        ]);

        return $this->paginated($request, $paginator);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'serial' => ['required', 'string', 'max:64', 'unique:sensors,serial'],
            'sensor_type_id' => ['required', 'integer', 'exists:sensor_types,id'],
        ]);

        return $this->envelope($request, Sensor::query()->create($validated), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $sensor = Sensor::query()->find($id);

        if ($sensor === null) {
            return $this->error($request, 'sensor_not_found', 'Sensor not found.', 404);
        }

        $validated = $request->validate(['serial' => ['sometimes', 'string', 'max:64', "unique:sensors,serial,{$id}"]]);
        $sensor->fill($validated)->save();

        return $this->envelope($request, $sensor->fresh());
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $sensor = Sensor::query()->find($id);

        if ($sensor === null) {
            return $this->error($request, 'sensor_not_found', 'Sensor not found.', 404);
        }

        if ($sensor->installations()->whereNull('removed_at')->exists()) {
            return $this->error($request, 'sensor_attached', 'Detach sensor before deleting.', 409);
        }

        $sensor->delete();

        return response()->json(null, 204);
    }

    public function attach(Request $request, string $id): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        $validated = $request->validate([
            'sensor_id' => ['required', 'integer', 'exists:sensors,id'],
            'installed_at' => ['nullable', 'date'],
        ]);

        if (SensorInstallation::query()->where('sensor_id', $validated['sensor_id'])->whereNull('removed_at')->exists()) {
            return $this->error($request, 'sensor_already_attached', 'Sensor is attached elsewhere.', 409);
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

        return $this->envelope($request, $installation, 201);
    }

    public function detach(Request $request, string $id, int $sensorId): JsonResponse
    {
        $device = $this->findDevice($id);

        if ($device === null) {
            return $this->error($request, 'device_not_found', 'Device not found.', 404);
        }

        $installation = SensorInstallation::query()
            ->where('device_id', $device->id)->where('sensor_id', $sensorId)->whereNull('removed_at')->first();

        if ($installation === null) {
            return $this->error($request, 'installation_not_found', 'Active installation not found.', 404);
        }

        $installation->forceFill(['removed_at' => now()])->save();

        return $this->envelope($request, $installation);
    }

    public function indexCalibrations(Request $request, int $id): JsonResponse
    {
        $sensor = Sensor::query()->find($id);

        if ($sensor === null) {
            return $this->error($request, 'sensor_not_found', 'Sensor not found.', 404);
        }

        return $this->envelope($request,
            $sensor->calibrations()->orderByDesc('effective_at')->get());
    }

    public function storeCalibration(Request $request, int $id): JsonResponse
    {
        $sensor = Sensor::query()->find($id);

        if ($sensor === null) {
            return $this->error($request, 'sensor_not_found', 'Sensor not found.', 404);
        }

        $validated = $request->validate([
            'offset' => ['nullable', 'numeric'],
            'scale' => ['nullable', 'numeric'],
            'effective_at' => ['required', 'date'],
        ]);

        $calibration = SensorCalibration::query()->create([
            'sensor_id' => $id,
            'offset' => $validated['offset'] ?? 0,
            'scale' => $validated['scale'] ?? 1,
            'effective_at' => $validated['effective_at'],
        ]);

        return $this->envelope($request, $calibration, 201);
    }
}
