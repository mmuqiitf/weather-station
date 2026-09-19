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
            ->assertJsonPath('message', 'Unauthenticated.');
        $this->getJson('/api/v1/dashboard/overview')->assertStatus(401)
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_unauthenticated_without_accept_header_still_json(): void
    {
        // Plain clients (curl, firmware) send no Accept header — the API must
        // answer 401 JSON, never redirect to the missing `login` route (500).
        $this->get('/api/v1/devices/NOPE', ['Authorization' => 'Bearer bogus'])
            ->assertStatus(401)
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_login_issues_token_and_me_works(): void
    {
        $user = User::factory()->create(['email' => 'admin@weather.local']);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@weather.local', 'password' => 'password',
        ]);
        $login->assertOk()->assertJsonStructure(['token', 'token_type', 'user']);
        $token = $login->json('token');
        $this->assertNotEmpty($token);

        $this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$token}"])
            ->assertOk()->assertJsonPath('email', 'admin@weather.local');

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
