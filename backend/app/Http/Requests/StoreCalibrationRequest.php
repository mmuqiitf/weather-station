<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCalibrationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'offset' => ['nullable', 'numeric'],
            'scale' => ['nullable', 'numeric'],
            'effective_at' => ['required', 'date'],
        ];
    }
}
