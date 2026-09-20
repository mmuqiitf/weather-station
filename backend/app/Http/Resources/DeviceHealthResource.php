<?php

namespace App\Http\Resources;

use App\Models\Device;
use App\Models\DeviceHeartbeat;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Device */
class DeviceHealthResource extends JsonResource
{
    public function __construct(Device $device, private ?DeviceHeartbeat $latest)
    {
        parent::__construct($device);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'device_id' => $this->device_id,
            'status' => $this->status,
            'is_online' => $this->resource->isOnline(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'firmware_version' => $this->firmware_version,
            'battery_v' => $this->latest?->battery_v,
            'rssi' => $this->latest?->rssi,
        ];
    }
}
