<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('distribution_returns', function (Blueprint $table) {
            $table->foreignId('returned_inventory_item_id')->nullable()->after('customer_id')->constrained('inventory_items')->nullOnDelete();
            $table->enum('settlement_type', ['bill_deduction', 'cash_refund', 'item_exchange'])->default('bill_deduction')->after('total_amount');
            $table->decimal('settlement_amount', 12, 2)->default(0)->after('settlement_type');
            $table->foreignId('exchange_inventory_item_id')->nullable()->after('settlement_amount')->constrained('inventory_items')->nullOnDelete();
            $table->decimal('exchange_quantity', 12, 2)->default(0)->after('exchange_inventory_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('distribution_returns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('returned_inventory_item_id');
            $table->dropConstrainedForeignId('exchange_inventory_item_id');
            $table->dropColumn(['settlement_type', 'settlement_amount', 'exchange_quantity']);
        });
    }
};
