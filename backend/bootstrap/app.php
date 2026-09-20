<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\AuthenticateDevice;
use App\Http\Middleware\ForceJsonResponse;
use App\Support\ApiErrorCode;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(ForceJsonResponse::class);
        $middleware->append(AssignRequestId::class);
        $middleware->alias(['device.auth' => AuthenticateDevice::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $isApi = fn (Request $request): bool => $request->is('api/*') || $request->expectsJson();

        // Single API error envelope (§E.1): {message, code, errors?, request_id}.
        $error = function (
            int $status,
            string $message,
            ApiErrorCode $code,
            Request $request,
            ?array $errors = null,
            array $headers = [],
        ): JsonResponse {
            $body = ['message' => $message, 'code' => $code->value];

            if ($errors !== null) {
                $body['errors'] = $errors;
            }

            $requestId = Context::get('request_id') ?? $request->attributes->get('request_id');

            if (is_string($requestId) && $requestId !== '') {
                $body['request_id'] = $requestId;
            }

            return response()->json($body, $status, $headers);
        };

        $exceptions->render(function (ApiException $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            return $error($e->getStatusCode(), $e->getMessage(), $e->errorCode(), $request, $e->errors(), $e->getHeaders());
        });

        $exceptions->render(function (ValidationException $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            return $error(
                422,
                $e->getMessage() !== '' ? $e->getMessage() : 'The given data was invalid.',
                ApiErrorCode::ValidationFailed,
                $request,
                $e->errors(),
            );
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            return $error(
                401,
                $e->getMessage() !== '' ? $e->getMessage() : 'Unauthenticated.',
                ApiErrorCode::Unauthenticated,
                $request,
            );
        });

        $exceptions->render(function (ThrottleRequestsException $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            return $error(
                429,
                $e->getMessage() !== '' ? $e->getMessage() : 'Too Many Attempts.',
                ApiErrorCode::RateLimited,
                $request,
                null,
                $e->getHeaders(),
            );
        });

        $exceptions->render(function (HttpResponseException $e, Request $request): ?SymfonyResponse {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }

            $response = $e->getResponse();
            $status = $response->getStatusCode();

            if ($status < 400 || ! str_contains((string) $response->headers->get('Content-Type'), 'json')) {
                return $response;
            }

            $body = json_decode((string) $response->getContent(), true);

            if (! is_array($body)) {
                return $response;
            }

            if (! array_key_exists('code', $body)) {
                $body['code'] = ApiErrorCode::forStatus($status, ! empty($body['errors']))->value;
            }

            if (! array_key_exists('request_id', $body)) {
                $requestId = Context::get('request_id') ?? $request->attributes->get('request_id');

                if (is_string($requestId) && $requestId !== '') {
                    $body['request_id'] = $requestId;
                }
            }

            if ($response instanceof JsonResponse) {
                $response->setData($body);
            } else {
                $response->setContent(json_encode($body));
                $response->headers->set('Content-Type', 'application/json');
            }

            return $response;
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            $status = $e->getStatusCode();
            $message = $e->getMessage() !== ''
                ? $e->getMessage()
                : (SymfonyResponse::$statusTexts[$status] ?? 'Error');

            return $error($status, $message, ApiErrorCode::forStatus($status), $request, null, $e->getHeaders());
        });

        $exceptions->render(function (Throwable $e, Request $request) use ($isApi, $error): ?JsonResponse {
            if (! $isApi($request)) {
                return null;
            }

            return $error(
                500,
                config('app.debug') ? $e->getMessage() : 'Server Error',
                ApiErrorCode::ServerError,
                $request,
            );
        });
    })->create();
