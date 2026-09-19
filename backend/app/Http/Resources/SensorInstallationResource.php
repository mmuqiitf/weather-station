<?php

namespace App\Http\Resources;

use App\Models\SensorInstallation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin SensorInstallation */
class SensorInstallationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sensor_id' => $this->sensor_id,
            'device_id' => $this->device_id,
            'installed_at' => $this->installed_at?->toIso8601String(),
            'removed_at' => $this->removed_at?->toIso8601String(),
        ];
    }
}
