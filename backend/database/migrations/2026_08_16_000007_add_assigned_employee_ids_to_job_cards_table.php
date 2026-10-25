<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_cards', function (Blueprint $table) {
            $table->json('assigned_employee_ids')->nullable()->after('assigned_employee_id');
        });

        DB::table('job_cards')
            ->whereNotNull('assigned_employee_id')
            ->update([
                'assigned_employee_ids' => DB::raw('JSON_ARRAY(assigned_employee_id)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('job_cards', function (Blueprint $table) {
            $table->dropColumn('assigned_employee_ids');
        });
    }
};
