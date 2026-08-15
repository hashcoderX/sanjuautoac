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
        Schema::table('packaging_batches', function (Blueprint $table) {
            $table->string('batch_no', 80)->nullable()->after('production_order_id');
            $table->decimal('unit_price', 15, 2)->default(0)->after('packed_quantity');
            $table->date('expiry_date')->nullable()->after('packed_at');
            $table->index('batch_no');
            $table->index('expiry_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('packaging_batches', function (Blueprint $table) {
            $table->dropIndex(['batch_no']);
            $table->dropIndex(['expiry_date']);
            $table->dropColumn(['batch_no', 'unit_price', 'expiry_date']);
        });
    }
};
