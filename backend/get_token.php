<?php

$url = 'http://localhost:8000/api/login';
$data = json_encode([
    'email' => 'superadmin@softcodelk.com',
    'password' => 'password',
]);

$options = [
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
        'content' => $data,
        'ignore_errors' => true,
    ],
];

$context = stream_context_create($options);
$result = file_get_contents($url, false, $context);

if ($result === false) {
    echo "Error: Unable to connect to the server.\n";
    exit(1);
}

$response = json_decode($result, true);
if (isset($response['token'])) {
    echo $response['token'];
    exit(0);
}

echo "Login failed:\n";
echo $result . "\n";
exit(1);
