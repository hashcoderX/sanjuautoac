<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('distribution_invoices') && !Schema::hasColumn('distribution_invoices', 'load_id')) {
            Schema::table('distribution_invoices', function (Blueprint $table) {
                $table->foreignId('load_id')->nullable()->after('customer_id')->constrained('loads')->nullOnDelete();
            });
        }

        if (Schema::hasTable('distribution_invoice_items') && !Schema::hasColumn('distribution_invoice_items', 'load_id')) {
            Schema::table('distribution_invoice_items', function (Blueprint $table) {
                $table->foreignId('load_id')->nullable()->after('distribution_invoice_id')->constrained('loads')->nullOnDelete();
            });
        }

        if (Schema::hasTable('distribution_returns') && !Schema::hasColumn('distribution_returns', 'load_id')) {
            Schema::table('distribution_returns', function (Blueprint $table) {
                $table->foreignId('load_id')->nullable()->after('distribution_invoice_id')->constrained('loads')->nullOnDelete();
            });
        }

        if (Schema::hasTable('distribution_payments') && !Schema::hasColumn('distribution_payments', 'load_id')) {
            Schema::table('distribution_payments', function (Blueprint $table) {
                $table->foreignId('load_id')->nullable()->after('distribution_invoice_id')->constrained('loads')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('distribution_payments') && Schema::hasColumn('distribution_payments', 'load_id')) {
            Schema::table('distribution_payments', function (Blueprint $table) {
                try {
                    $table->dropForeign(['load_id']);
                } catch (\Throwable $e) {
                    // Ignore missing FK index errors during rollback.
                }
                $table->dropColumn('load_id');
            });
        }

        if (Schema::hasTable('distribution_returns') && Schema::hasColumn('distribution_returns', 'load_id')) {
            Schema::table('distribution_returns', function (Blueprint $table) {
                try {
                    $table->dropForeign(['load_id']);
                } catch (\Throwable $e) {
                    // Ignore missing FK index errors during rollback.
                }
                $table->dropColumn('load_id');
            });
        }

        if (Schema::hasTable('distribution_invoice_items') && Schema::hasColumn('distribution_invoice_items', 'load_id')) {
            Schema::table('distribution_invoice_items', function (Blueprint $table) {
                try {
                    $table->dropForeign(['load_id']);
                } catch (\Throwable $e) {
                    // Ignore missing FK index errors during rollback.
                }
                $table->dropColumn('load_id');
            });
        }

        if (Schema::hasTable('distribution_invoices') && Schema::hasColumn('distribution_invoices', 'load_id')) {
            Schema::table('distribution_invoices', function (Blueprint $table) {
                try {
                    $table->dropForeign(['load_id']);
                } catch (\Throwable $e) {
                    // Ignore missing FK index errors during rollback.
                }
                $table->dropColumn('load_id');
            });
        }
    }
};
