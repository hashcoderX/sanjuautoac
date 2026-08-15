<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (!Schema::hasColumn('outlet_sales', 'discount_amount')) {
                $table->decimal('discount_amount', 14, 2)
                    ->default(0)
                    ->after('total_amount');
            }

            if (!Schema::hasColumn('outlet_sales', 'paid_amount')) {
                $table->decimal('paid_amount', 14, 2)
                    ->default(0)
                    ->after('discount_amount');
            }

            if (!Schema::hasColumn('outlet_sales', 'payment_type')) {
                $table->string('payment_type', 20)
                    ->default('cash')
                    ->after('paid_amount');
            }

            if (!Schema::hasColumn('outlet_sales', 'balance_amount')) {
                $table->decimal('balance_amount', 14, 2)
                    ->default(0)
                    ->after('payment_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (Schema::hasColumn('outlet_sales', 'balance_amount')) {
                $table->dropColumn('balance_amount');
            }

            if (Schema::hasColumn('outlet_sales', 'payment_type')) {
                $table->dropColumn('payment_type');
            }

            if (Schema::hasColumn('outlet_sales', 'paid_amount')) {
                $table->dropColumn('paid_amount');
            }

            if (Schema::hasColumn('outlet_sales', 'discount_amount')) {
                $table->dropColumn('discount_amount');
            }
        });
    }
};
