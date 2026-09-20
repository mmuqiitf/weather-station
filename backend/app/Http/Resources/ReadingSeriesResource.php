<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReadingSeriesResource extends JsonResource
{
    /**
     * @param  array<int, array<string, mixed>>  $points
     */
    public function __construct(private array $points, private string $requested, private string $applied, private string $agg)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'points' => array_values($this->points),
            'interval_requested' => $this->requested,
            'interval_applied' => $this->applied,
            'agg' => $this->agg,
        ];
    }
}
