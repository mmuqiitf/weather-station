<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSensorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'serial' => ['required', 'string', 'max:64', 'unique:sensors,serial'],
            'sensor_type_id' => ['required', 'integer', 'exists:sensor_types,id'],
        ];
    }
}
