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
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
            $table->index(['tenant_id', 'branch_id']);
        });

        Schema::table('service_invoices', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
            $table->index(['tenant_id', 'branch_id']);
        });

        Schema::table('service_customers', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            $table->unsignedBigInteger('branch_id')->nullable()->after('tenant_id');
            $table->index(['tenant_id', 'branch_id']);
        });

        DB::statement(
            "UPDATE job_cards jc
            LEFT JOIN users u ON jc.created_by = u.id
            LEFT JOIN employees e ON u.employee_id = e.id
            SET jc.tenant_id = COALESCE(e.tenant_id, u.branch_id),
                jc.branch_id = COALESCE(e.branch_id, u.branch_id)
            WHERE jc.tenant_id IS NULL OR jc.branch_id IS NULL"
        );

        DB::statement(
            "UPDATE service_invoices si
            LEFT JOIN users u ON si.created_by = u.id
            LEFT JOIN employees e ON u.employee_id = e.id
            SET si.tenant_id = COALESCE(e.tenant_id, u.branch_id),
                si.branch_id = COALESCE(e.branch_id, u.branch_id)
            WHERE si.tenant_id IS NULL OR si.branch_id IS NULL"
        );

        DB::statement(
            "UPDATE service_customers sc
            LEFT JOIN service_invoices si ON si.service_customer_id = sc.id
            SET sc.tenant_id = si.tenant_id,
                sc.branch_id = si.branch_id
            WHERE (sc.tenant_id IS NULL OR sc.branch_id IS NULL)
              AND si.id IS NOT NULL"
        );

        DB::statement(
            "UPDATE service_customers sc
            SET sc.tenant_id = 1,
                sc.branch_id = 1
            WHERE sc.tenant_id IS NULL OR sc.branch_id IS NULL"
        );

        Schema::table('job_cards', function (Blueprint $table) {
            $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
        });

        Schema::table('service_invoices', function (Blueprint $table) {
            $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
        });

        Schema::table('service_customers', function (Blueprint $table) {
            $table->foreign('tenant_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('branch_id')->references('id')->on('companies')->nullOnDelete();
        });

        Schema::table('service_customers', function (Blueprint $table) {
            $table->dropUnique('service_customers_phone_unique');
            $table->unique(['tenant_id', 'phone']);
        });
    }

    public function down(): void
    {
        Schema::table('service_customers', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'phone']);
            $table->unique('phone');
            $table->dropForeign(['tenant_id']);
            $table->dropForeign(['branch_id']);
            $table->dropColumn(['tenant_id', 'branch_id']);
        });

        Schema::table('service_invoices', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropForeign(['branch_id']);
            $table->dropColumn(['tenant_id', 'branch_id']);
        });

        Schema::table('job_cards', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropForeign(['branch_id']);
            $table->dropColumn(['tenant_id', 'branch_id']);
        });
    }
};
