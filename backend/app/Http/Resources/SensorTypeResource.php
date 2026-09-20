<?php

namespace App\Http\Resources;

use App\Models\SensorType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SensorType */
class SensorTypeResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'unit' => $this->unit,
            'min_value' => $this->min_value !== null ? (float) $this->min_value : null,
            'max_value' => $this->max_value !== null ? (float) $this->max_value : null,
            'precision' => $this->precision,
            'sensors_count' => $this->whenCounted('sensors_count'),
        ];
    }
}
