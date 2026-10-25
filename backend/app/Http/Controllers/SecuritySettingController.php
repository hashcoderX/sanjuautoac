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

    private function resolveTenantId(Request $request): int
    {
        $user = $request->user();

        return (int) ($request->input('tenant_id')
            ?? $request->attributes->get('tenant_id')
            ?? $user?->employee?->tenant_id
            ?? $user?->branch_id
            ?? 0);
    }

    private function scopedKey(string $baseKey, int $tenantId): string
    {
        if ($tenantId <= 0) {
            return $baseKey;
        }

        return $baseKey . '.tenant.' . $tenantId;
    }

    private function readBool(string $baseKey, bool $default, int $tenantId): bool
    {
        $key = $this->scopedKey($baseKey, $tenantId);
        $setting = SystemSetting::where('key', $key)->first();

        if (!$setting && $tenantId > 0) {
            // Backward-compatibility: read old global key as seed value.
            $setting = SystemSetting::where('key', $baseKey)->first();
        }

        if (!$setting) {
            $setting = SystemSetting::create([
                'key' => $key,
                'value' => $default ? '1' : '0',
            ]);
        }

        $parsed = filter_var($setting->value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return $parsed ?? ($setting->value === '1');
    }

    private function readInt(string $baseKey, int $default, int $tenantId): int
    {
        $key = $this->scopedKey($baseKey, $tenantId);
        $setting = SystemSetting::where('key', $key)->first();

        if (!$setting && $tenantId > 0) {
            // Backward-compatibility: read old global key as seed value.
            $setting = SystemSetting::where('key', $baseKey)->first();
        }

        if (!$setting) {
            $setting = SystemSetting::create([
                'key' => $key,
                'value' => (string) $default,
            ]);
        }

        return max(1, (int) $setting->value);
    }

    public function show(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $tenantId = $this->resolveTenantId($request);

        if ($tenantId <= 0 && ($request->user()?->employee_id ?? null)) {
            return response()->json(['message' => 'Tenant context is missing.'], 422);
        }

        return response()->json([
            'enforce_strong_passwords' => $this->readBool('security_enforce_strong_passwords', true, $tenantId),
            'require_two_factor' => $this->readBool('security_require_two_factor', false, $tenantId),
            'lockout_enabled' => $this->readBool('security_lockout_enabled', true, $tenantId),
            'max_failed_attempts' => $this->readInt('security_max_failed_attempts', 5, $tenantId),
            'session_timeout_minutes' => $this->readInt('security_session_timeout_minutes', 120, $tenantId),
            'password_expiry_days' => $this->readInt('security_password_expiry_days', 90, $tenantId),
        ]);
    }

    public function update(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $tenantId = $this->resolveTenantId($request);
        if ($tenantId <= 0 && ($request->user()?->employee_id ?? null)) {
            return response()->json(['message' => 'Tenant context is missing.'], 422);
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
            $this->scopedKey('security_enforce_strong_passwords', $tenantId) => $data['enforce_strong_passwords'] ? '1' : '0',
            $this->scopedKey('security_require_two_factor', $tenantId) => $data['require_two_factor'] ? '1' : '0',
            $this->scopedKey('security_lockout_enabled', $tenantId) => $data['lockout_enabled'] ? '1' : '0',
            $this->scopedKey('security_max_failed_attempts', $tenantId) => (string) $data['max_failed_attempts'],
            $this->scopedKey('security_session_timeout_minutes', $tenantId) => (string) $data['session_timeout_minutes'],
            $this->scopedKey('security_password_expiry_days', $tenantId) => (string) $data['password_expiry_days'],
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
