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
        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('earned_basic_salary', 10, 2)->default(0)->after('basic_salary');
            $table->decimal('commission_amount', 10, 2)->default(0)->after('deductions');
            $table->decimal('attendance_deduction_amount', 10, 2)->default(0)->after('commission_amount');
            $table->decimal('late_hours', 8, 2)->default(0)->after('attendance_deduction_amount');
            $table->decimal('late_deduction_amount', 10, 2)->default(0)->after('late_hours');
            $table->decimal('epf_employee_amount', 10, 2)->default(0)->after('late_deduction_amount');
            $table->decimal('epf_employer_amount', 10, 2)->default(0)->after('epf_employee_amount');
            $table->decimal('etf_employee_amount', 10, 2)->default(0)->after('epf_employer_amount');
            $table->decimal('etf_employer_amount', 10, 2)->default(0)->after('etf_employee_amount');
            $table->decimal('gross_salary', 10, 2)->default(0)->after('etf_employer_amount');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn([
                'earned_basic_salary',
                'commission_amount',
                'attendance_deduction_amount',
                'late_hours',
                'late_deduction_amount',
                'epf_employee_amount',
                'epf_employer_amount',
                'etf_employee_amount',
                'etf_employer_amount',
                'gross_salary',
            ]);
        });
    }
};
