<?php

namespace App\Http\Resources;

use App\Models\Device;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Device */
class DeviceResource extends JsonResource
{
    private ?string $plainKey = null;

    /** Attach the one-time plaintext API key (create / rotate responses only). */
    public function withPlainKey(string $key): static
    {
        $this->plainKey = $key;

        return $this;
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'device_id' => $this->device_id,
            'name' => $this->name,
            'status' => $this->status,
            'is_online' => $this->isOnline(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'firmware_version' => $this->firmware_version,
            'location' => $this->whenLoaded('location', fn () => $this->location ? new LocationResource($this->location) : null),
            'api_key_plain' => $this->when($this->plainKey !== null, $this->plainKey),
        ];
    }
}
