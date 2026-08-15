<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outlet_sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('outlet_sale_id')->constrained('outlet_sales')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->string('item_code', 80);
            $table->string('item_name', 255);
            $table->string('unit', 30)->nullable();
            $table->decimal('quantity', 12, 2);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('line_total', 14, 2);
            $table->timestamps();

            $table->index(['outlet_sale_id', 'inventory_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outlet_sale_items');
    }
};
