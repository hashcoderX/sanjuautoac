<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceTenantRouteBindings
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user instanceof User || $this->isPrivilegedAdmin($user)) {
            return $next($request);
        }

        $tenantId = (int) ($request->input('tenant_id') ?? $request->attributes->get('tenant_id') ?? 0);
        $branchId = (int) ($request->input('branch_id') ?? $request->attributes->get('branch_id') ?? 0);

        foreach ($request->route()?->parameters() ?? [] as $parameter) {
            if (!$parameter instanceof Model) {
                continue;
            }

            $attributes = $parameter->getAttributes();

            if (array_key_exists('tenant_id', $attributes) && $tenantId > 0 && (int) $attributes['tenant_id'] !== $tenantId) {
                return response()->json(['message' => 'Tenant mismatch for requested resource.'], 403);
            }

            if (array_key_exists('branch_id', $attributes) && $branchId > 0 && (int) $attributes['branch_id'] !== $branchId) {
                return response()->json(['message' => 'Branch mismatch for requested resource.'], 403);
            }
        }

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
