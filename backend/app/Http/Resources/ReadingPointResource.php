<?php

namespace App\Http\Resources;

use App\Models\SensorReading;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SensorReading */
class ReadingPointResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            't' => $this->device_time->toIso8601String(),
            'sensor_type' => $this->sensorType->code,
            'v' => (float) $this->value,
            'q' => $this->quality,
        ];
    }
}
