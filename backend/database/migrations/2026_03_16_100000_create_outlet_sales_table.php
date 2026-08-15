<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outlet_sales', function (Blueprint $table) {
            $table->id();
            $table->string('sale_number', 60)->unique();
            $table->foreignId('outlet_id')->constrained('outlets')->cascadeOnDelete();
            $table->foreignId('sold_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('sale_date');
            $table->string('customer_name')->nullable();
            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['outlet_id', 'sale_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outlet_sales');
    }
};
