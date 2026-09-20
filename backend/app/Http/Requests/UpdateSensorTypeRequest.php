<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSensorTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:64', Rule::unique('sensor_types', 'code')->ignore($this->route('id'))],
            'unit' => ['sometimes', 'string', 'max:32'],
            'min_value' => ['sometimes', 'nullable', 'numeric'],
            'max_value' => ['sometimes', 'nullable', 'numeric'],
            'precision' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:6'],
        ];
    }
}
