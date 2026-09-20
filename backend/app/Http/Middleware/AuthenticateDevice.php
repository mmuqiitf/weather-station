<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Models\Device;
use App\Support\ApiErrorCode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->bearerToken();

        if ($key === null || $key === '') {
            throw new ApiException(ApiErrorCode::Unauthenticated, 'Invalid or missing device credentials.');
        }

        $device = Device::query()
            ->where('api_key_hash', hash('sha256', $key))
            ->where('status', '!=', Device::STATUS_DECOMMISSIONED)
            ->first();

        if ($device === null) {
            throw new ApiException(ApiErrorCode::Unauthenticated, 'Invalid or missing device credentials.');
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
