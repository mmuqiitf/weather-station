<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DashboardOverviewResource extends JsonResource
{
    /**
     * @param  array<int, array<string, mixed>>  $devices
     * @param  array{total: int, online: int, offline: int}  $counts
     */
    public function __construct(private array $devices, private array $counts)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'devices' => $this->devices,
            'counts' => $this->counts,
        ];
    }
}
