<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('load_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('load_id')->constrained('loads')->cascadeOnDelete();
            $table->date('expense_date');
            $table->string('expense_type', 50);
            $table->decimal('amount', 15, 2);
            $table->string('reference', 100)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('delivery_cash_transaction_id')->nullable()->constrained('delivery_cash_transactions')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('load_expenses');
    }
};
