<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_cards', function (Blueprint $table) {
            $table->text('inspection_review')->nullable()->after('accessories_received');
            $table->timestamp('inspection_reviewed_at')->nullable()->after('inspection_review');
            $table->foreignId('inspected_by_employee_id')
                ->nullable()
                ->after('inspection_reviewed_at')
                ->constrained('employees')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('job_cards', function (Blueprint $table) {
            $table->dropForeign(['inspected_by_employee_id']);
            $table->dropColumn(['inspection_review', 'inspection_reviewed_at', 'inspected_by_employee_id']);
        });
    }
};
