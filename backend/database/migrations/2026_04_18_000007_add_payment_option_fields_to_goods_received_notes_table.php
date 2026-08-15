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
            $table->enum('payment_timing', ['post_payment', 'on_time'])->default('post_payment')->after('payment_status');
            $table->string('payment_type')->nullable()->after('payment_timing');
            $table->string('payment_reference')->nullable()->after('payment_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->dropColumn(['payment_timing', 'payment_type', 'payment_reference']);
        });
    }
};
