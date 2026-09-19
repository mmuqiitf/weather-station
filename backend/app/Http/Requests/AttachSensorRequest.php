<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AttachSensorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'sensor_id' => ['required', 'integer', 'exists:sensors,id'],
            'installed_at' => ['nullable', 'date'],
        ];
    }
}
