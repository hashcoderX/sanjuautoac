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
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->decimal('total_amount', 15, 2)->default(0)->after('status');
            $table->decimal('discount_amount', 15, 2)->default(0)->after('total_amount');
            $table->decimal('net_amount', 15, 2)->default(0)->after('discount_amount');
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->default('unpaid')->after('net_amount');
            $table->decimal('paid_amount', 15, 2)->default(0)->after('payment_status');
            $table->dateTime('paid_at')->nullable()->after('paid_amount');
            $table->text('payment_note')->nullable()->after('paid_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->dropColumn([
                'total_amount',
                'discount_amount',
                'net_amount',
                'payment_status',
                'paid_amount',
                'paid_at',
                'payment_note',
            ]);
        });
    }
};
