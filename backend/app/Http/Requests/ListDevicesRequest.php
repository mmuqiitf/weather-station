<?php

namespace App\Http\Requests;

use App\Models\Device;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListDevicesRequest extends FormRequest
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
            'status' => ['nullable', Rule::in([Device::STATUS_PROVISIONED, Device::STATUS_ACTIVE, Device::STATUS_DECOMMISSIONED])],
            'location_id' => ['nullable', 'integer'],
            'online' => ['nullable', 'boolean'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['id', 'device_id', 'name', 'status', 'last_seen_at', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ], $this->paginationRules());
    }
}
