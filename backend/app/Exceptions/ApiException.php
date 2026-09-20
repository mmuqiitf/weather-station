<?php

namespace App\Exceptions;

use App\Support\ApiErrorCode;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * Single domain exception for API errors that need a stable machine-readable code.
 *
 * It extends HttpException so Laravel does not report expected 4xx failures and
 * so the centralized JSON renderer in bootstrap/app.php can use one policy.
 */
final class ApiException extends HttpException
{
    /**
     * @param  array<string, array<int, string>>|null  $errors
     * @param  array<string, mixed>  $headers
     */
    public function __construct(
        private ApiErrorCode $errorCode,
        string $message = '',
        private ?array $errors = null,
        array $headers = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct(self::statusFor($errorCode), $message, $previous, $headers);
    }

    public function errorCode(): ApiErrorCode
    {
        return $this->errorCode;
    }

    /** @return array<string, array<int, string>>|null */
    public function errors(): ?array
    {
        return $this->errors;
    }

    /** @return array<string, string> */
    public function context(): array
    {
        return ['code' => $this->errorCode->value];
    }

    private static function statusFor(ApiErrorCode $errorCode): int
    {
        return match ($errorCode) {
            ApiErrorCode::BadRequest => 400,
            ApiErrorCode::Unauthenticated => 401,
            ApiErrorCode::Forbidden, ApiErrorCode::DeviceMismatch => 403,
            ApiErrorCode::NotFound => 404,
            ApiErrorCode::MethodNotAllowed => 405,
            ApiErrorCode::Conflict,
            ApiErrorCode::SensorTypeInUse,
            ApiErrorCode::SensorMounted,
            ApiErrorCode::SensorAttachedElsewhere => 409,
            ApiErrorCode::TokenMismatch => 419,
            ApiErrorCode::ValidationFailed,
            ApiErrorCode::UnprocessableEntity,
            ApiErrorCode::IllegalLifecycleTransition,
            ApiErrorCode::UnknownSensorType,
            ApiErrorCode::TooManyPoints => 422,
            ApiErrorCode::RateLimited => 429,
            ApiErrorCode::ServerError => 500,
            ApiErrorCode::ServiceUnavailable => 503,
        };
    }
}
