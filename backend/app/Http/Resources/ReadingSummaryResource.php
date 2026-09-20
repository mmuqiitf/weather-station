<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReadingSummaryResource extends JsonResource
{
    /** @param  array<string, mixed>  $summary */
    public function __construct(private array $summary)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return $this->summary;
    }
}
