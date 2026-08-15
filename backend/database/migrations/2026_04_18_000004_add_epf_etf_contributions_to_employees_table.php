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
            $table->decimal('epf_employee_contribution', 5, 2)->nullable()->after('deduction_late_hour');
            $table->decimal('epf_employer_contribution', 5, 2)->nullable()->after('epf_employee_contribution');
            $table->decimal('etf_employee_contribution', 5, 2)->nullable()->after('epf_employer_contribution');
            $table->decimal('etf_employer_contribution', 5, 2)->nullable()->after('etf_employee_contribution');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'epf_employee_contribution',
                'epf_employer_contribution',
                'etf_employee_contribution',
                'etf_employer_contribution',
            ]);
        });
    }
};
