<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Support\Facades\Hash;

$name = 'Super Admin';
$email = 'superadmin@softcodelk.com';
$plainPassword = 'password';

$user = User::firstOrNew(['email' => $email]);
$user->name = $name;
$user->password = Hash::make($plainPassword);
$user->role = 'super admin';
$user->save();

$superAdminRole = Role::firstOrCreate(
    ['name' => 'Super Admin'],
    [
        'description' => 'Full system access',
        'is_active' => true,
    ]
);

// Keep role permissions fully open for super admin.
$permissionIds = Permission::query()->pluck('id')->all();
if (!empty($permissionIds)) {
    $superAdminRole->permissions()->sync($permissionIds);
}

$pivot = UserRole::firstOrNew([
    'user_id' => $user->id,
    'role_id' => $superAdminRole->id,
]);
$pivot->assigned_at = now();
$pivot->assigned_by = $user->id;
$pivot->save();

echo "Super Admin ready: {$email}" . PHP_EOL;