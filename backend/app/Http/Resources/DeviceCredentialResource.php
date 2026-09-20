<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DeviceCredentialResource extends JsonResource
{
    public function __construct(private string $deviceId, private string $plainKey)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'device_id' => $this->deviceId,
            'api_key_plain' => $this->plainKey,
        ];
    }
}
