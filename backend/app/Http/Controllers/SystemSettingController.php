<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
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

    public function show(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $setting = SystemSetting::firstOrCreate(
            ['key' => 'system_enabled'],
            ['value' => '1']
        );

        $enabled = filter_var($setting->value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $enabled = $enabled ?? ($setting->value === '1');

        return response()->json([
            'system_enabled' => (bool) $enabled,
        ]);
    }

    public function update(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'system_enabled' => 'required|boolean',
        ]);

        $setting = SystemSetting::updateOrCreate(
            ['key' => 'system_enabled'],
            ['value' => $data['system_enabled'] ? '1' : '0']
        );

        return response()->json([
            'message' => 'System setting updated successfully.',
            'system_enabled' => $setting->value === '1',
        ]);
    }
}
