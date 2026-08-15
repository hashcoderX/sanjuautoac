<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use Illuminate\Http\Request;

class BackupRestoreSettingController extends Controller
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

    private function readString(string $key, string $default): string
    {
        $setting = SystemSetting::firstOrCreate(
            ['key' => $key],
            ['value' => $default]
        );

        return (string) ($setting->value ?: $default);
    }

    public function show(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return response()->json([
            'auto_backup_enabled' => $this->readBool('backup_auto_enabled', true),
            'backup_frequency' => $this->readString('backup_frequency', 'daily'),
            'retention_days' => $this->readInt('backup_retention_days', 30),
            'include_uploaded_files' => $this->readBool('backup_include_uploaded_files', true),
            'encryption_enabled' => $this->readBool('backup_encryption_enabled', true),
            'cloud_sync_enabled' => $this->readBool('backup_cloud_sync_enabled', false),
        ]);
    }

    public function update(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'auto_backup_enabled' => 'required|boolean',
            'backup_frequency' => 'required|in:daily,weekly,monthly',
            'retention_days' => 'required|integer|min:7|max:365',
            'include_uploaded_files' => 'required|boolean',
            'encryption_enabled' => 'required|boolean',
            'cloud_sync_enabled' => 'required|boolean',
        ]);

        $map = [
            'backup_auto_enabled' => $data['auto_backup_enabled'] ? '1' : '0',
            'backup_frequency' => $data['backup_frequency'],
            'backup_retention_days' => (string) $data['retention_days'],
            'backup_include_uploaded_files' => $data['include_uploaded_files'] ? '1' : '0',
            'backup_encryption_enabled' => $data['encryption_enabled'] ? '1' : '0',
            'backup_cloud_sync_enabled' => $data['cloud_sync_enabled'] ? '1' : '0',
        ];

        foreach ($map as $key => $value) {
            SystemSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return response()->json([
            'message' => 'Backup settings updated successfully.',
            'data' => $data,
        ]);
    }
}
