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
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (!Schema::hasColumn('outlet_sales', 'loyalty_customer_id')) {
                $table->foreignId('loyalty_customer_id')
                    ->nullable()
                    ->after('customer_name')
                    ->constrained('outlet_loyalty_customers')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('outlet_sales', 'loyalty_points_awarded')) {
                $table->decimal('loyalty_points_awarded', 14, 2)
                    ->default(0)
                    ->after('total_amount');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('outlet_sales', function (Blueprint $table) {
            if (Schema::hasColumn('outlet_sales', 'loyalty_customer_id')) {
                $table->dropConstrainedForeignId('loyalty_customer_id');
            }

            if (Schema::hasColumn('outlet_sales', 'loyalty_points_awarded')) {
                $table->dropColumn('loyalty_points_awarded');
            }
        });
    }
};
