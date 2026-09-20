<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListSensorTypesRequest extends FormRequest
{
    use Concerns\HasPagination;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return array_merge([
            'q' => ['nullable', 'string', 'max:100'],
            'unit' => ['nullable', 'string', 'max:50'],
            'in_use' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['id', 'code', 'unit'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ], $this->paginationRules());
    }
}
