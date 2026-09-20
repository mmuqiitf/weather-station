<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TokenResource extends JsonResource
{
    /**
     * @param  array{id: int, name: string, email: string}  $user
     */
    public function __construct(private string $token, private array $user)
    {
        parent::__construct(null);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'token' => $this->token,
            'token_type' => 'Bearer',
            'user' => $this->user,
        ];
    }
}
