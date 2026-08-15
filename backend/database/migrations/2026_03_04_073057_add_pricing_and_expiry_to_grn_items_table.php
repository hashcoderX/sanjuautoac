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
        Schema::table('grn_items', function (Blueprint $table) {
            $table->decimal('purchase_price', 10, 2)->nullable()->after('rejected_quantity');
            $table->decimal('sell_price', 10, 2)->nullable()->after('purchase_price');
            $table->date('expiry_date')->nullable()->after('sell_price');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('grn_items', function (Blueprint $table) {
            $table->dropColumn(['purchase_price', 'sell_price', 'expiry_date']);
        });
    }
};
