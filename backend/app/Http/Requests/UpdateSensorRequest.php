<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSensorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'serial' => ['sometimes', 'string', 'max:64', Rule::unique('sensors', 'serial')->ignore($this->route('id'))],
        ];
    }
}
