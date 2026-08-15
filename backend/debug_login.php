<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

$email = 'superadmin@softcodelk.com';
$password = 'password';

$user = User::where('email', $email)->first();

if (!$user) {
    echo "User not found\n";
    exit(1);
}

echo "User ID: {$user->id}\n";
echo "Hash check: " . (Hash::check($password, $user->password) ? 'true' : 'false') . "\n";
echo "Auth::validate: " . (Auth::validate(['email' => $email, 'password' => $password]) ? 'true' : 'false') . "\n";
echo "Auth::attempt: " . (Auth::attempt(['email' => $email, 'password' => $password]) ? 'true' : 'false') . "\n";
