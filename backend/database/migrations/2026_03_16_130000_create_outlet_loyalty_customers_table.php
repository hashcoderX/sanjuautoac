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
        Schema::create('outlet_loyalty_customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->string('customer_code', 50);
            $table->string('name');
            $table->string('phone', 50);
            $table->string('email')->nullable();
            $table->date('birthday')->nullable();
            $table->decimal('points_balance', 14, 2)->default(0);
            $table->unsignedInteger('total_visits')->default(0);
            $table->decimal('total_spent', 14, 2)->default(0);
            $table->string('status', 20)->default('active');
            $table->string('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['outlet_id', 'customer_code']);
            $table->unique(['outlet_id', 'phone']);
            $table->index(['outlet_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('outlet_loyalty_customers');
    }
};
