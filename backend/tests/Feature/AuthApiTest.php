<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_protected_routes_require_dashboard_login(): void
    {
        $this->getJson('/api/v1/devices')->assertStatus(401)
            ->assertJsonPath('error.code', 'user_unauthenticated');
        $this->getJson('/api/v1/dashboard/overview')->assertStatus(401)
            ->assertJsonPath('error.code', 'user_unauthenticated');
    }

    public function test_login_issues_token_and_me_works(): void
    {
        $user = User::factory()->create(['email' => 'admin@weather.local']);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@weather.local', 'password' => 'password',
        ]);
        $login->assertOk()->assertJsonStructure(['data' => ['token', 'token_type', 'user']]);
        $token = $login->json('data.token');
        $this->assertNotEmpty($token);

        $this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$token}"])
            ->assertOk()->assertJsonPath('data.email', 'admin@weather.local');

        $this->getJson('/api/v1/devices', ['Authorization' => "Bearer {$token}"])->assertOk();

        $this->postJson('/api/v1/auth/logout', [], ['Authorization' => "Bearer {$token}"])->assertOk();

        // Fresh app instance: the auth guard caches the user within one process,
        // but real HTTP requests boot fresh — refresh to simulate that.
        $this->refreshApplication();
        $this->getJson('/api/v1/devices', ['Authorization' => "Bearer {$token}"])->assertStatus(401);

        // Wrong password is a validation failure, not a token.
        $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@weather.local', 'password' => 'wrong',
        ])->assertStatus(422);
    }
}
