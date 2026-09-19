<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AssignRequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->attributes->set('request_id', (string) Str::uuid());

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-Request-Id', $request->attributes->get('request_id'));

        return $response;
    }
}
