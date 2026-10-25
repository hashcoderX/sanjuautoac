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
        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', function (Blueprint $table) {
                if (!Schema::hasColumn('suppliers', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('suppliers', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            Schema::table('suppliers', function (Blueprint $table) {
                if (!$this->hasIndex('suppliers', 'suppliers_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('suppliers', 'suppliers_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('suppliers', 'suppliers_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }

        if (Schema::hasTable('inventory_items')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                if (!Schema::hasColumn('inventory_items', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('inventory_items', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            Schema::table('inventory_items', function (Blueprint $table) {
                if (!$this->hasIndex('inventory_items', 'inventory_items_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('inventory_items', 'inventory_items_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('inventory_items', 'inventory_items_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });

            Schema::table('inventory_items', function (Blueprint $table) {
                if ($this->hasIndex('inventory_items', 'inventory_items_code_unique')) {
                    $table->dropUnique('inventory_items_code_unique');
                }
                if (!$this->hasIndex('inventory_items', 'inventory_items_tenant_id_code_unique')) {
                    $table->unique(['tenant_id', 'code']);
                }
            });
        }

        if (Schema::hasTable('stock_transfers')) {
            Schema::table('stock_transfers', function (Blueprint $table) {
                if (!Schema::hasColumn('stock_transfers', 'tenant_id')) {
                    $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('stock_transfers', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
                }
            });

            Schema::table('stock_transfers', function (Blueprint $table) {
                if (!$this->hasIndex('stock_transfers', 'stock_transfers_tenant_id_branch_id_index')) {
                    $table->index(['tenant_id', 'branch_id']);
                }
                if (!$this->hasConstraint('stock_transfers', 'stock_transfers_tenant_id_foreign')) {
                    $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
                }
                if (!$this->hasConstraint('stock_transfers', 'stock_transfers_branch_id_foreign')) {
                    $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('inventory_items')) {
            Schema::table('inventory_items', function (Blueprint $table) {
                if ($this->hasIndex('inventory_items', 'inventory_items_tenant_id_code_unique')) {
                    $table->dropUnique(['tenant_id', 'code']);
                }
                if (!$this->hasIndex('inventory_items', 'inventory_items_code_unique')) {
                    $table->unique('code');
                }
                if ($this->hasConstraint('inventory_items', 'inventory_items_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('inventory_items', 'inventory_items_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('inventory_items', 'tenant_id') && Schema::hasColumn('inventory_items', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }

        if (Schema::hasTable('stock_transfers')) {
            Schema::table('stock_transfers', function (Blueprint $table) {
                if ($this->hasConstraint('stock_transfers', 'stock_transfers_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('stock_transfers', 'stock_transfers_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('stock_transfers', 'tenant_id') && Schema::hasColumn('stock_transfers', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }

        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', function (Blueprint $table) {
                if ($this->hasConstraint('suppliers', 'suppliers_tenant_id_foreign')) {
                    $table->dropForeign(['tenant_id']);
                }
                if ($this->hasConstraint('suppliers', 'suppliers_branch_id_foreign')) {
                    $table->dropForeign(['branch_id']);
                }
                if (Schema::hasColumn('suppliers', 'tenant_id') && Schema::hasColumn('suppliers', 'branch_id')) {
                    $table->dropColumn(['tenant_id', 'branch_id']);
                }
            });
        }
    }
};
