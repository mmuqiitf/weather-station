<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\SensorReading;
use App\Models\SensorType;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function overview(): JsonResponse
    {
        $devices = Device::query()->with('location')->orderBy('id')->get();

        $tempId = SensorType::where('code', 'temp_air')->value('id');
        $humId = SensorType::where('code', 'humidity')->value('id');

        $cards = $devices->map(function (Device $d) use ($tempId, $humId) {
            $latest = SensorReading::query()->where('device_id', $d->id)
                ->whereIn('sensor_type_id', array_filter([$tempId, $humId]))
                ->whereIn('id', fn ($q) => $q->selectRaw('MAX(id)')
                    ->from('sensor_readings')->where('device_id', $d->id)->groupBy('sensor_type_id'))
                ->with('sensorType')->get()->keyBy(fn ($r) => $r->sensorType->code);

            return [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'name' => $d->name,
                'status' => $d->status,
                'is_online' => $d->isOnline(),
                'location' => $d->location?->name,
                'temp_air' => isset($latest['temp_air']) ? (float) $latest['temp_air']->value : null,
                'humidity' => isset($latest['humidity']) ? (float) $latest['humidity']->value : null,
                'last_seen_at' => $d->last_seen_at?->toIso8601String(),
            ];
        });

        return response()->json([
            'devices' => $cards,
            'counts' => [
                'total' => $devices->count(),
                'online' => $cards->where('is_online', true)->count(),
                'offline' => $cards->where('is_online', false)->count(),
            ],
        ]);
    }
}
