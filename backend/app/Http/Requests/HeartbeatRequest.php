<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class HeartbeatRequest extends FormRequest
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
            'ts' => ['required', 'integer', 'min:0'],
            'fw' => ['nullable', 'string'],
            'battery_v' => ['nullable', 'numeric'],
            'rssi' => ['nullable', 'integer'],
            'uptime_s' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
