<?php

namespace App\Http\Requests\Concerns;

/**
 * Shared page/per_page validation and defaults for list endpoints.
 */
trait HasPagination
{
    /** @return array<string, array<int, mixed>> */
    public function paginationRules(?int $max = null): array
    {
        $max ??= (int) config('api.per_page.max', 100);

        return [
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:'.$max],
        ];
    }

    public function perPage(?int $default = null): int
    {
        $default ??= (int) config('api.per_page.default', 15);

        return (int) ($this->validated()['per_page'] ?? $default);
    }
}
