<?php

namespace App\Http\Resources;

use App\Models\Device;
use App\Models\SensorReading;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/** @mixin Device */
class ReadingLatestResource extends JsonResource
{
    /**
     * @param  Collection<int, SensorReading>  $sensors  Readings with sensorType loaded.
     */
    public function __construct(Device $device, private Collection $sensors)
    {
        parent::__construct($device);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'device_id' => $this->device_id,
            'is_online' => $this->resource->isOnline(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'sensors' => $this->sensors->map(fn (SensorReading $r) => [
                'sensor_type' => $r->sensorType->code,
                'unit' => $r->sensorType->unit,
                'raw_value' => (float) $r->raw_value,
                'value' => (float) $r->value,
                'quality' => $r->quality,
                'device_time' => $r->device_time->toIso8601String(),
            ])->values(),
        ];
    }
}
