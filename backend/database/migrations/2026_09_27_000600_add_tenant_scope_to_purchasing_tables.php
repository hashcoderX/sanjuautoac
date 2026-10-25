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
        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if (!Schema::hasColumn('purchase_orders', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('purchase_orders', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            DB::statement(
                "UPDATE purchase_orders po
                LEFT JOIN suppliers s ON s.id = po.supplier_id
                SET po.tenant_id = COALESCE(po.tenant_id, s.tenant_id),
                    po.branch_id = COALESCE(po.branch_id, s.branch_id)
                WHERE po.tenant_id IS NULL OR po.branch_id IS NULL"
            );

            Schema::table('purchase_orders', function (Blueprint $table) {
                if (!$this->hasIndex('purchase_orders', 'purchase_orders_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('purchase_orders', 'purchase_orders_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('purchase_orders', 'purchase_orders_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }

        if (Schema::hasTable('goods_received_notes')) {
            Schema::table('goods_received_notes', function (Blueprint $table) {
                if (!Schema::hasColumn('goods_received_notes', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('goods_received_notes', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            DB::statement(
                "UPDATE goods_received_notes grn
                LEFT JOIN purchase_orders po ON po.id = grn.purchase_order_id
                SET grn.tenant_id = COALESCE(grn.tenant_id, po.tenant_id),
                    grn.branch_id = COALESCE(grn.branch_id, po.branch_id)
                WHERE grn.tenant_id IS NULL OR grn.branch_id IS NULL"
            );

            Schema::table('goods_received_notes', function (Blueprint $table) {
                if (!$this->hasIndex('goods_received_notes', 'goods_received_notes_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('goods_received_notes', 'goods_received_notes_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('goods_received_notes', 'goods_received_notes_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('goods_received_notes')) {
            Schema::table('goods_received_notes', function (Blueprint $table) {
                if ($this->hasConstraint('goods_received_notes', 'goods_received_notes_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('goods_received_notes', 'goods_received_notes_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('goods_received_notes', 'tenant_id') && Schema::hasColumn('goods_received_notes', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }

        if (Schema::hasTable('purchase_orders')) {
            Schema::table('purchase_orders', function (Blueprint $table) {
                if ($this->hasConstraint('purchase_orders', 'purchase_orders_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('purchase_orders', 'purchase_orders_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('purchase_orders', 'tenant_id') && Schema::hasColumn('purchase_orders', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }
    }
};
