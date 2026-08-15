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
        Schema::create('packaging_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('qc_inspection_id')->constrained('qc_inspections')->cascadeOnDelete();
            $table->foreignId('production_order_id')->constrained('production_orders')->restrictOnDelete();
            $table->string('packaging_material_name', 150);
            $table->decimal('packaging_material_quantity', 15, 3)->default(0);
            $table->string('packaging_material_unit', 30)->default('pcs');
            $table->decimal('packed_quantity', 15, 3)->default(0);
            $table->enum('status', ['planned', 'packed', 'dispatched'])->default('planned');
            $table->string('label_code', 120)->unique();
            $table->string('barcode_value', 200)->nullable();
            $table->string('qr_value', 255)->nullable();
            $table->timestamp('packed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'packed_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packaging_batches');
    }
};
