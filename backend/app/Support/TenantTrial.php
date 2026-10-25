<?php

namespace App\Support;

use App\Models\Company;
use App\Models\User;
use Carbon\Carbon;

class TenantTrial
{
    public static function resolveForUser(User $user): array
    {
        $tenantId = (int) ($user->employee?->tenant_id ?? $user->branch_id ?? 0);
        $isPrivileged = self::isPrivilegedAdmin($user);

        if ($tenantId <= 0) {
            return self::exempt('No tenant context.');
        }

        $company = Company::query()->find($tenantId);
        if (!$company || !$company->created_at) {
            return self::exempt('Tenant profile not found.');
        }

        // Platform-level privileged users can bypass trial limits.
        if ($isPrivileged && !$user->employee_id) {
            return self::exempt('Privileged platform account.');
        }

        $start = Carbon::parse($company->created_at)->startOfDay();
        $trialEnd = $start->copy()->addDays(7);
        $lockAt = $start->copy()->addDays(14);
        $today = now()->startOfDay();

        $daysSinceStart = max(0, (int) $start->diffInDays($today, false));
        $daysUntilLock = max(0, (int) $today->diffInDays($lockAt, false));

        if ($today->lt($trialEnd)) {
            return [
                'status' => 'active',
                'is_exempt' => false,
                'days_since_start' => $daysSinceStart,
                'days_until_lock' => $daysUntilLock,
                'trial_end_at' => $trialEnd->toDateString(),
                'lock_at' => $lockAt->toDateString(),
                'message' => null,
            ];
        }

        if ($today->lt($lockAt)) {
            return [
                'status' => 'upgrade_required',
                'is_exempt' => false,
                'days_since_start' => $daysSinceStart,
                'days_until_lock' => $daysUntilLock,
                'trial_end_at' => $trialEnd->toDateString(),
                'lock_at' => $lockAt->toDateString(),
                'message' => 'Your free trial has ended. Please buy Pro to avoid automatic access blocking.',
            ];
        }

        return [
            'status' => 'blocked',
            'is_exempt' => false,
            'days_since_start' => $daysSinceStart,
            'days_until_lock' => 0,
            'trial_end_at' => $trialEnd->toDateString(),
            'lock_at' => $lockAt->toDateString(),
            'message' => 'Your trial window has ended. Access is blocked until you upgrade to Pro.',
        ];
    }

    private static function exempt(string $reason): array
    {
        return [
            'status' => 'exempt',
            'is_exempt' => true,
            'days_since_start' => null,
            'days_until_lock' => null,
            'trial_end_at' => null,
            'lock_at' => null,
            'message' => $reason,
        ];
    }

    private static function isPrivilegedAdmin(User $user): bool
    {
        if (!$user->employee_id) {
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
}
