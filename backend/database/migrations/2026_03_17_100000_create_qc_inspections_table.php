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
        Schema::create('qc_inspections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_order_id')->constrained('production_orders')->cascadeOnDelete();
            $table->date('inspection_date');
            $table->string('inspector_name', 120);
            $table->enum('quality_status', ['approved', 'rejected', 'hold'])->default('hold');
            $table->decimal('approved_quantity', 15, 3)->default(0);
            $table->decimal('rejected_quantity', 15, 3)->default(0);
            $table->json('food_safety_checklist')->nullable();
            $table->text('defects_notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('report_notes')->nullable();
            $table->timestamps();

            $table->index(['inspection_date', 'quality_status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('qc_inspections');
    }
};
