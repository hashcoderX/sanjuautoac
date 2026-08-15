<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\Hash;

$user = User::where('email', 'superadmin@softcodelk.com')->first();

if ($user) {
    $password = 'password'; // The password to check
    if (Hash::check($password, $user->password)) {
        echo "Password 'password' is correct for user {$user->email}\n";
    } else {
        echo "Password 'password' is incorrect for user {$user->email}\n";
        echo "Current hash: {$user->password}\n";
    }
} else {
    echo "User not found.\n";
}