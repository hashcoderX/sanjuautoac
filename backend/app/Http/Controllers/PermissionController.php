<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class PermissionController extends Controller
{
    public function index(): JsonResponse
    {
        $permissions = Permission::all();
        return response()->json($permissions);
    }

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:permissions',
            'description' => 'nullable|string|max:500',
            'module' => 'nullable|string|max:255'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $permission = Permission::create($request->all());
        return response()->json($permission, 201);
    }

    public function show(Permission $permission): JsonResponse
    {
        return response()->json($permission);
    }

    public function update(Request $request, Permission $permission): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255|unique:permissions,name,' . $permission->id,
            'description' => 'nullable|string|max:500',
            'module' => 'nullable|string|max:255'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $permission->update($request->all());
        return response()->json($permission);
    }

    public function destroy(Permission $permission): JsonResponse
    {
        // Check if permission is assigned to any roles
        if ($permission->roles()->exists()) {
            return response()->json(['message' => 'Cannot delete permission that is assigned to roles'], 409);
        }

        $permission->delete();
        return response()->json(['message' => 'Permission deleted successfully']);
    }

    public function modules(): JsonResponse
    {
        $modules = Permission::query()
            ->whereNotNull('module')
            ->where('module', '!=', '')
            ->select('module')
            ->distinct()
            ->orderBy('module')
            ->pluck('module');

        return response()->json($modules);
    }

    public function byModule(string $module): JsonResponse
    {
        $decodedModule = urldecode($module);

        $permissions = Permission::query()
            ->whereRaw('LOWER(module) = ?', [strtolower($decodedModule)])
            ->orderBy('name')
            ->get();

        return response()->json($permissions);
    }

    public function bulkUpsert(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'permissions' => 'required|array|min:1',
            'permissions.*.name' => 'required|string|max:255',
            'permissions.*.description' => 'nullable|string|max:500',
            'permissions.*.module' => 'nullable|string|max:255',
            'permissions.*.is_active' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $rows = collect($request->input('permissions', []));

        $createdOrUpdated = $rows->map(function ($row) {
            $permission = Permission::firstOrCreate(
                ['name' => $row['name']],
                [
                    'description' => $row['description'] ?? null,
                    'module' => $row['module'] ?? null,
                    'is_active' => array_key_exists('is_active', $row) ? (bool) $row['is_active'] : true,
                ]
            );

            return $permission;
        })->values();

        return response()->json([
            'message' => 'Permissions processed successfully',
            'data' => $createdOrUpdated,
        ]);
    }

    public function assignToRole(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'role_id' => 'required|exists:roles,id',
            'permission_id' => 'required|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role = Role::findOrFail((int) $request->input('role_id'));
        $permissionId = (int) $request->input('permission_id');

        $role->permissions()->syncWithoutDetaching([$permissionId]);

        return response()->json(['message' => 'Permission assigned to role successfully']);
    }

    public function removeFromRole(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'role_id' => 'required|exists:roles,id',
            'permission_id' => 'required|exists:permissions,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $role = Role::findOrFail((int) $request->input('role_id'));
        $permissionId = (int) $request->input('permission_id');

        $role->permissions()->detach([$permissionId]);

        return response()->json(['message' => 'Permission removed from role successfully']);
    }
}