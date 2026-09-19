<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Reviewer demo login (documented in README): admin@weather.local / admin123.
        User::query()->firstOrCreate(['email' => 'admin@weather.local'], [
            'name' => 'Reviewer Admin',
            'password' => Hash::make('admin123'),
        ]);

        User::query()->firstOrCreate(['email' => 'test@example.com'], [
            'name' => 'Test User',
            'password' => Hash::make('password'),
        ]);

        $this->call(WeatherSeeder::class);
    }
}
