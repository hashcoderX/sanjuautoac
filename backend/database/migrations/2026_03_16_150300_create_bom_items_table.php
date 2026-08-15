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
        Schema::create('bom_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bom_id')->constrained('bom_headers')->cascadeOnDelete();
            $table->foreignId('material_id')->constrained('raw_materials')->restrictOnDelete();
            $table->decimal('quantity', 15, 4);
            $table->string('unit', 30);
            $table->timestamps();

            $table->unique(['bom_id', 'material_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bom_items');
    }
};
