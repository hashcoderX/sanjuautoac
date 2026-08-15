<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

class SystemResetController extends Controller
{
    private function isAdminUser(?User $user): bool
    {
        if (!$user) {
            return false;
        }

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

    private function getSuperAdminRoleIds(User $user): Collection
    {
        $user->loadMissing('roles');

        return $user->roles
            ->filter(function ($role): bool {
                $name = strtolower(trim((string) ($role->name ?? '')));
                return str_contains($name, 'super admin') || str_contains($name, 'superadmin');
            })
            ->pluck('id')
            ->values();
    }

    public function reset(Request $request)
    {
        $superAdmin = $request->user();

        if (!$superAdmin instanceof User || !$this->isAdminUser($superAdmin)) {
            return response()->json(['message' => 'Only Super Admin can reset the system.'], 403);
        }

        $superAdminRoleIds = $this->getSuperAdminRoleIds($superAdmin)->all();
        $snapshot = [
            'name' => (string) $superAdmin->name,
            'email' => (string) $superAdmin->email,
            'password' => (string) $superAdmin->password,
            'role' => 'Super Admin',
            'employee_id' => null,
            'branch_id' => null,
            'remember_token' => $superAdmin->remember_token,
        ];

        try {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');

            $tables = Schema::getTableListing();
            foreach ($tables as $table) {
                if ($table === 'migrations') {
                    continue;
                }

                DB::table($table)->truncate();
            }

            DB::statement('SET FOREIGN_KEY_CHECKS=1');

            $newSuperAdmin = User::create($snapshot);

            if (!empty($superAdminRoleIds) && Schema::hasTable('user_roles')) {
                foreach ($superAdminRoleIds as $roleId) {
                    DB::table('user_roles')->insert([
                        'user_id' => $newSuperAdmin->id,
                        'role_id' => $roleId,
                    ]);
                }
            }

            $token = $newSuperAdmin->createToken('API Token')->plainTextToken;

            return response()->json([
                'message' => 'System reset completed. Database cleared and Super Admin account preserved.',
                'token' => $token,
                'user' => $newSuperAdmin->fresh()->loadMissing(['employee', 'roles.permissions']),
            ]);
        } catch (Throwable $exception) {
            try {
                DB::statement('SET FOREIGN_KEY_CHECKS=1');
            } catch (Throwable $toggleException) {
                Log::warning('Failed to re-enable foreign key checks after reset error.', [
                    'error' => $toggleException->getMessage(),
                ]);
            }

            Log::error('System reset failed.', [
                'user_id' => $superAdmin?->id,
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to reset system.',
                'error' => $exception->getMessage(),
            ], 500);
        }
    }
}
