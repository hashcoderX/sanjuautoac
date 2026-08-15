<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('load_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('load_id')->constrained('loads')->onDelete('cascade');
            $table->string('product_code')->index();
            $table->string('name');
            $table->enum('type', ['finished_product', 'raw_material']);
            $table->decimal('out_price', 10, 2); // Cost price
            $table->decimal('sell_price', 10, 2); // Selling price
            $table->decimal('qty', 10, 2); // Quantity
            $table->timestamps();

            $table->index(['load_id', 'type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('load_items');
    }
};
