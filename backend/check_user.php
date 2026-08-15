<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;

$users = User::all();

if ($users->isEmpty()) {
    echo "No users found in the database.\n";
} else {
    echo "Users in the database:\n";
    foreach ($users as $user) {
        echo "- ID: {$user->id}, Name: {$user->name}, Email: {$user->email}\n";
    }
}

$superadmin = User::where('email', 'superadmin@softcodelk.com')->first();
if ($superadmin) {
    echo "\nSuperadmin user exists:\n";
    echo "- ID: {$superadmin->id}, Name: {$superadmin->name}, Email: {$superadmin->email}\n";
    echo "- Password hash: {$superadmin->password}\n";
} else {
    echo "\nSuperadmin user does not exist.\n";
}