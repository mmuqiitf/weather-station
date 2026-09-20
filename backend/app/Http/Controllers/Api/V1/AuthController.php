<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\AuthUserResource;
use App\Http\Resources\LogoutResource;
use App\Http\Resources\TokenResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Dashboard login — exchange email + password for a Sanctum bearer token.
     *
     * Device ingestion uses a separate mechanism (Bearer api_key + device.auth);
     * this endpoint is for human dashboard users only.
     */
    public function login(LoginRequest $request): TokenResource
    {
        $validated = $request->validated();

        $user = User::query()->where('email', $validated['email'])->first();

        if ($user === null || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Credentials are not valid.'],
            ]);
        }

        return new TokenResource(
            $user->createToken('dashboard')->plainTextToken,
            ['id' => $user->id, 'name' => $user->name, 'email' => $user->email],
        );
    }

    public function me(Request $request): AuthUserResource
    {
        return new AuthUserResource($request->user());
    }

    public function logout(Request $request): LogoutResource
    {
        $request->user()->currentAccessToken()?->delete();

        return new LogoutResource;
    }
}
