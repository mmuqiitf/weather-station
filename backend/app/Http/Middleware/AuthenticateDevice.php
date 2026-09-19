<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->bearerToken();

        if ($key === null || $key === '') {
            return $this->unauthenticated($request);
        }

        $device = Device::query()
            ->where('api_key_hash', hash('sha256', $key))
            ->where('status', '!=', Device::STATUS_DECOMMISSIONED)
            ->first();

        if ($device === null) {
            return $this->unauthenticated($request);
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }

    private function unauthenticated(Request $request): JsonResponse
    {
        return response()->json([
            'data' => null,
            'error' => ['code' => 'device_unauthenticated', 'message' => 'Invalid or missing device credentials.'],
            'meta' => ['request_id' => $request->attributes->get('request_id')],
        ], 401);
    }
}
