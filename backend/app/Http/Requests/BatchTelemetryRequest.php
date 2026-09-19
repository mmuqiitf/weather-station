<?php

namespace App\Http\Requests;

use App\Services\IngestService;
use Illuminate\Foundation\Http\FormRequest;

class BatchTelemetryRequest extends FormRequest
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
            'batch' => ['required', 'array', 'min:1', 'max:'.IngestService::MAX_BATCH],
            'batch.*.ts' => ['required', 'integer', 'min:0'],
            'batch.*.seq' => ['nullable', 'integer', 'min:0'],
            'batch.*.battery_v' => ['nullable', 'numeric'],
            'batch.*.rssi' => ['nullable', 'integer'],
            'batch.*.readings' => ['required', 'array', 'min:1'],
            'batch.*.readings.*.s' => ['required', 'string'],
            'batch.*.readings.*.v' => ['required', 'numeric'],
        ];
    }
}
