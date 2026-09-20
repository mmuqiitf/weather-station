<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ListLocationsRequest extends FormRequest
{
    use Concerns\HasPagination;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return $this->paginationRules();
    }
}
