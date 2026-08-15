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
        Schema::table('employees', function (Blueprint $table) {
            $table->decimal('overtime_payment_per_hour', 8, 2)->nullable()->after('commission_base');
            $table->decimal('deduction_late_hour', 8, 2)->nullable()->after('overtime_payment_per_hour');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['overtime_payment_per_hour', 'deduction_late_hour']);
        });
    }
};
