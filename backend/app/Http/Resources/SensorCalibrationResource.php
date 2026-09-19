<?php

namespace App\Http\Resources;

use App\Models\SensorCalibration;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SensorCalibration */
class SensorCalibrationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sensor_id' => $this->sensor_id,
            'offset' => $this->offset !== null ? (float) $this->offset : null,
            'scale' => $this->scale !== null ? (float) $this->scale : null,
            'effective_at' => $this->effective_at?->toIso8601String(),
        ];
    }
}
