<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SecuritySettingController extends Controller
{
    private function isAdminUser($user): bool
    {
        if (!$user || !$user->employee_id) {
            return true;
        }

        $user->loadMissing('roles');

        $roleNames = $user->roles
            ->pluck('name')
            ->push((string) ($user->role ?? ''))
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter();

        return $roleNames->contains(function ($roleName) {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin')
                || str_contains($roleName, 'administrator')
                || $roleName === 'admin';
        });
    }

    private function readBool(string $key, bool $default): bool
    {
        $setting = SystemSetting::firstOrCreate(
            ['key' => $key],
            ['value' => $default ? '1' : '0']
        );

        $parsed = filter_var($setting->value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return $parsed ?? ($setting->value === '1');
    }

    private function readInt(string $key, int $default): int
    {
        $setting = SystemSetting::firstOrCreate(
            ['key' => $key],
            ['value' => (string) $default]
        );

        return max(1, (int) $setting->value);
    }

    public function show(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json([
            'enforce_strong_passwords' => $this->readBool('security_enforce_strong_passwords', true),
            'require_two_factor' => $this->readBool('security_require_two_factor', false),
            'lockout_enabled' => $this->readBool('security_lockout_enabled', true),
            'max_failed_attempts' => $this->readInt('security_max_failed_attempts', 5),
            'session_timeout_minutes' => $this->readInt('security_session_timeout_minutes', 120),
            'password_expiry_days' => $this->readInt('security_password_expiry_days', 90),
        ]);
    }

    public function update(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'enforce_strong_passwords' => 'required|boolean',
            'require_two_factor' => 'required|boolean',
            'lockout_enabled' => 'required|boolean',
            'max_failed_attempts' => 'required|integer|min:3|max:10',
            'session_timeout_minutes' => 'required|integer|min:15|max:1440',
            'password_expiry_days' => 'required|integer|min:30|max:365',
        ]);

        $map = [
            'security_enforce_strong_passwords' => $data['enforce_strong_passwords'] ? '1' : '0',
            'security_require_two_factor' => $data['require_two_factor'] ? '1' : '0',
            'security_lockout_enabled' => $data['lockout_enabled'] ? '1' : '0',
            'security_max_failed_attempts' => (string) $data['max_failed_attempts'],
            'security_session_timeout_minutes' => (string) $data['session_timeout_minutes'],
            'security_password_expiry_days' => (string) $data['password_expiry_days'],
        ];

        foreach ($map as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json([
            'message' => 'Security settings updated successfully.',
            'data' => $data,
        ]);
    }
}
