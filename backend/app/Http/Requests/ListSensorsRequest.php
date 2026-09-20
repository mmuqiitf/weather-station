<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListSensorsRequest extends FormRequest
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
            'sensor_type_id' => ['nullable', 'integer', 'exists:sensor_types,id'],
            'mounted' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['id', 'serial', 'sensor_type_id', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ], $this->paginationRules());
    }
}
