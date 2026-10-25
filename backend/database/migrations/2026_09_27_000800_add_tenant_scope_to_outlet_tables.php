<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function hasConstraint(string $table, string $constraint): bool
    {
        $database = DB::getDatabaseName();

        return DB::table('information_schema.TABLE_CONSTRAINTS')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->where('CONSTRAINT_NAME', $constraint)
            ->exists();
    }

    private function hasIndex(string $table, string $indexName): bool
    {
        $database = DB::getDatabaseName();

        return DB::table('information_schema.STATISTICS')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->where('INDEX_NAME', $indexName)
            ->exists();
    }

    public function up(): void
    {
        if (Schema::hasTable('outlets')) {
            Schema::table('outlets', function (Blueprint $table) {
                if (!Schema::hasColumn('outlets', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('outlets', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            DB::statement(
                "UPDATE outlets o
                LEFT JOIN users u ON o.user_id = u.id
                LEFT JOIN employees e ON u.employee_id = e.id
                SET o.tenant_id = COALESCE(o.tenant_id, e.tenant_id, u.branch_id),
                    o.branch_id = COALESCE(o.branch_id, e.branch_id, u.branch_id)
                WHERE o.tenant_id IS NULL OR o.branch_id IS NULL"
            );

            Schema::table('outlets', function (Blueprint $table) {
                if (!$this->hasIndex('outlets', 'outlets_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('outlets', 'outlets_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('outlets', 'outlets_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }

        if (Schema::hasTable('outlet_sales')) {
            Schema::table('outlet_sales', function (Blueprint $table) {
                if (!Schema::hasColumn('outlet_sales', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('outlet_sales', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            DB::statement(
                "UPDATE outlet_sales os
                LEFT JOIN outlets o ON o.id = os.outlet_id
                SET os.tenant_id = COALESCE(os.tenant_id, o.tenant_id),
                    os.branch_id = COALESCE(os.branch_id, o.branch_id)
                WHERE os.tenant_id IS NULL OR os.branch_id IS NULL"
            );

            Schema::table('outlet_sales', function (Blueprint $table) {
                if (!$this->hasIndex('outlet_sales', 'outlet_sales_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('outlet_sales', 'outlet_sales_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('outlet_sales', 'outlet_sales_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('outlet_sales')) {
            Schema::table('outlet_sales', function (Blueprint $table) {
                if ($this->hasConstraint('outlet_sales', 'outlet_sales_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('outlet_sales', 'outlet_sales_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('outlet_sales', 'tenant_id') && Schema::hasColumn('outlet_sales', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }

        if (Schema::hasTable('outlets')) {
            Schema::table('outlets', function (Blueprint $table) {
                if ($this->hasConstraint('outlets', 'outlets_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('outlets', 'outlets_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('outlets', 'tenant_id') && Schema::hasColumn('outlets', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }
    }
};
