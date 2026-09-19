# syntax=docker/dockerfile:1

FROM dunglas/frankenphp:1-php8.4 AS base

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_HOME=/tmp/composer \
    PHP_EXTENSIONS="pdo_pgsql pgsql pcntl opcache"

WORKDIR /app

RUN install-php-extensions pdo_pgsql pgsql pcntl opcache \
    && apt-get update && apt-get install -y --no-install-recommends unzip git libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --prefer-dist

COPY . .

RUN composer dump-autoload --optimize \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && php artisan octane:install --server=frankenphp --no-interaction || true

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    OCTANE_SERVER=frankenphp \
    SERVER_NAME=":8000"

EXPOSE 8000

CMD ["php", "artisan", "octane:start", "--server=frankenphp", "--host=0.0.0.0", "--port=8000", "--max-requests=500"]
