<?php

namespace App\Http\Resources;

use App\Models\Sensor;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Sensor */
class SensorResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'serial' => $this->serial,
            'sensor_type_id' => $this->sensor_type_id,
            'sensor_type' => $this->whenLoaded('type', fn () => $this->type?->code),
            'current_device_id' => $this->whenLoaded('installations',
                fn () => $this->installations->firstWhere('removed_at', null)?->device_id),
        ];
    }
}
