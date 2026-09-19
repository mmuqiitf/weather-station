<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

abstract class ApiController extends Controller
{
    protected function envelope(Request $request, mixed $data, int $status = 200, array $meta = []): JsonResponse
    {
        return response()->json([
            'data' => $data,
            'error' => null,
            'meta' => array_merge(['request_id' => $request->attributes->get('request_id')], $meta),
        ], $status);
    }

    protected function paginated(Request $request, mixed $paginator, array $meta = []): JsonResponse
    {
        return response()->json([
            'data' => $paginator->items(),
            'error' => null,
            'meta' => array_merge([
                'request_id' => $request->attributes->get('request_id'),
                'pagination' => [
                    'current_page' => $paginator->currentPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                    'last_page' => $paginator->lastPage(),
                ],
            ], $meta),
        ]);
    }

    protected function error(Request $request, string $code, string $message, int $status, mixed $details = null): JsonResponse
    {
        return response()->json([
            'data' => null,
            'error' => ['code' => $code, 'message' => $message, 'details' => $details],
            'meta' => ['request_id' => $request->attributes->get('request_id')],
        ], $status);
    }

    protected function findDevice(string $id): ?Device
    {
        $query = Device::query()->where('device_id', $id);

        // Postgres bigint rejects non-numeric bindings — only match PK when numeric.
        if (is_numeric($id)) {
            $query->orWhere('id', (int) $id);
        }

        return $query->first();
    }

    protected function resolveDevice(string $key): ?Device
    {
        return $this->findDevice($key);
    }
}
