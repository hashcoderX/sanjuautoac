<?php

require_once 'vendor/autoload.php';

$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\PurchaseOrderItem;

try {
    $items = PurchaseOrderItem::with('inventoryItem')->get();
    $orphaned = $items->filter(function($item) {
        return $item->inventoryItem === null;
    });

    echo "Total items: " . $items->count() . "\n";
    echo "Orphaned items: " . $orphaned->count() . "\n";

    if ($orphaned->count() > 0) {
        echo "Orphaned item IDs: ";
        foreach ($orphaned as $item) {
            echo $item->id . " (inventory_item_id: " . $item->inventory_item_id . "), ";
        }
        echo "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}