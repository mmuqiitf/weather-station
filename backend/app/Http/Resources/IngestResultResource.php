<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IngestResultResource extends JsonResource
{
    /**
     * @param  array{accepted: int, duplicates: int, rejected: array<int, array<string, string>>}  $result
     */
    public function __construct(private array $result)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return $this->result;
    }
}
