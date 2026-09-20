<?php

namespace App\Support;

/**
 * Stable, machine-readable error codes (§E.1). Clients branch on `code`,
 * never on the human `message`, which may change or be translated.
 */
enum ApiErrorCode: string
{
    case BadRequest = 'bad_request';
    case Unauthenticated = 'unauthenticated';
    case Forbidden = 'forbidden';
    case NotFound = 'not_found';
    case MethodNotAllowed = 'method_not_allowed';
    case Conflict = 'conflict';
    case TokenMismatch = 'token_mismatch';
    case ValidationFailed = 'validation_failed';
    case UnprocessableEntity = 'unprocessable_entity';
    case RateLimited = 'rate_limited';
    case ServerError = 'server_error';
    case ServiceUnavailable = 'service_unavailable';
    case DeviceMismatch = 'device_mismatch';
    case IllegalLifecycleTransition = 'illegal_lifecycle_transition';
    case SensorTypeInUse = 'sensor_type_in_use';
    case SensorMounted = 'sensor_mounted';
    case SensorAttachedElsewhere = 'sensor_attached_elsewhere';
    case UnknownSensorType = 'unknown_sensor_type';
    case TooManyPoints = 'too_many_points';

    /**
     * @param  bool  $hasFieldErrors  true when the body carries a per-field `errors` object.
     */
    public static function forStatus(int $status, bool $hasFieldErrors = false): self
    {
        return match (true) {
            $status === 400 => self::BadRequest,
            $status === 401 => self::Unauthenticated,
            $status === 403 => self::Forbidden,
            $status === 404 => self::NotFound,
            $status === 405 => self::MethodNotAllowed,
            $status === 409 => self::Conflict,
            $status === 419 => self::TokenMismatch,
            $status === 422 => $hasFieldErrors ? self::ValidationFailed : self::UnprocessableEntity,
            $status === 429 => self::RateLimited,
            $status === 500 => self::ServerError,
            $status === 503 => self::ServiceUnavailable,
            $status >= 400 && $status < 500 => self::BadRequest,
            default => self::ServerError,
        };
    }
}
