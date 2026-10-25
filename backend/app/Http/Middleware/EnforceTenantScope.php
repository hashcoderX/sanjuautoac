<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceTenantScope
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user instanceof User) {
            return $next($request);
        }

        if ($this->isPrivilegedAdmin($user)) {
            return $next($request);
        }

        $tenantId = (int) ($user->employee?->tenant_id ?? $user->branch_id ?? 0);
        $branchId = (int) ($user->employee?->branch_id ?? $user->branch_id ?? 0);

        if ($tenantId <= 0 || $branchId <= 0) {
            return response()->json([
                'message' => 'Tenant access is not configured for this user.',
            ], 403);
        }

        $request->merge([
            'tenant_id' => $tenantId,
            'branch_id' => $branchId,
        ]);

        $request->attributes->set('tenant_id', $tenantId);
        $request->attributes->set('branch_id', $branchId);

        return $next($request);
    }

    private function isPrivilegedAdmin(User $user): bool
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

        return $roleNames->contains(function (string $roleName): bool {
            return str_contains($roleName, 'super admin')
                || str_contains($roleName, 'superadmin')
                || str_contains($roleName, 'administrator')
                || $roleName === 'admin';
        });
    }
}
