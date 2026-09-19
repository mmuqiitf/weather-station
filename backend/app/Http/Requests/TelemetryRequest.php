<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TelemetryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'device_id' => ['required', 'string'],
            'fw' => ['nullable', 'string'],
            'ts' => ['required', 'integer', 'min:0'],
            'seq' => ['nullable', 'integer', 'min:0'],
            'battery_v' => ['nullable', 'numeric'],
            'rssi' => ['nullable', 'integer'],
            'readings' => ['required', 'array', 'min:1'],
            'readings.*.s' => ['required', 'string'],
            'readings.*.v' => ['required', 'numeric'],
        ];
    }
}
