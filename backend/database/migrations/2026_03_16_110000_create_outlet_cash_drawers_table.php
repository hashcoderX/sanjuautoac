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
        Schema::create('outlet_cash_drawers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->decimal('balance', 14, 2)->default(0);
            $table->foreignId('last_set_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('last_set_at')->nullable();
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique('outlet_id');
            $table->index('last_set_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('outlet_cash_drawers');
    }
};
