<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListReadingsRequest extends FormRequest
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
            'device_id' => ['required', 'string'],
            'sensor_type' => ['nullable', 'string'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'interval' => ['nullable', Rule::in(['raw', '1m', '1h', '1d'])],
            'agg' => ['nullable', Rule::in(['avg', 'min', 'max', 'sum'])],
        ], $this->paginationRules((int) config('api.readings.max_points', 5000)));
    }
}
