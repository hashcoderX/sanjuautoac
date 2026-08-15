<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\PurchaseOrder;

try {
    $orders = PurchaseOrder::with(['supplier', 'items.inventoryItem'])->get();
    echo "Success: " . $orders->count() . " orders loaded\n";

    foreach ($orders as $order) {
        echo "Order: " . $order->order_number . "\n";
        echo "Supplier: " . ($order->supplier ? $order->supplier->name : 'NULL') . "\n";
        echo "Items: " . $order->items->count() . "\n";
        foreach ($order->items as $item) {
            echo "  - Item: " . ($item->inventoryItem ? $item->inventoryItem->name : 'NULL') . "\n";
        }
        echo "---\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n";
}