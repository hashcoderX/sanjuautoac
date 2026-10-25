<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['petty_cash_transactions', 'delivery_cash_transactions', 'main_cash_transactions'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                if (!Schema::hasColumn($tableName, 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn($tableName, 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            DB::statement(
                "UPDATE {$tableName} t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN employees e ON u.employee_id = e.id
                SET t.tenant_id = COALESCE(t.tenant_id, e.tenant_id, u.branch_id),
                    t.branch_id = COALESCE(t.branch_id, e.branch_id, u.branch_id)
                WHERE t.tenant_id IS NULL OR t.branch_id IS NULL"
            );

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $table->index(['tenant_id', 'branch_id'], $tableName . '_tenant_branch_idx');
                $table->foreign('tenant_id', $tableName . '_tenant_fk')->references('id')->on('companies')->nullOnDelete();
                $table->foreign('branch_id', $tableName . '_branch_fk')->references('id')->on('companies')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['petty_cash_transactions', 'delivery_cash_transactions', 'main_cash_transactions'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                if (Schema::hasColumn($tableName, 'tenant_id')) {
                    $table->dropForeign($tableName . '_tenant_fk');
                }
                if (Schema::hasColumn($tableName, 'branch_id')) {
                    $table->dropForeign($tableName . '_branch_fk');
                }
                if (Schema::hasColumn($tableName, 'tenant_id') && Schema::hasColumn($tableName, 'branch_id')) {
                    $table->dropIndex($tableName . '_tenant_branch_idx');
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }
    }
};
