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
            $table->string('vehicle_no')->nullable()->after('customer_email');
            $table->string('chassis_no')->nullable()->after('vehicle_no');
        });

        if (Schema::hasColumn('job_cards', 'serial_no')) {
            DB::table('job_cards')
                ->whereNotNull('serial_no')
                ->where(function ($query) {
                    $query->whereNull('chassis_no')->orWhere('chassis_no', '');
                })
                ->update(['chassis_no' => DB::raw('serial_no')]);
        }

        Schema::table('job_cards', function (Blueprint $table) {
            if (Schema::hasColumn('job_cards', 'device_type')) {
                $table->dropColumn('device_type');
            }
            if (Schema::hasColumn('job_cards', 'serial_no')) {
                $table->dropColumn('serial_no');
            }
        });

        Schema::table('job_cards', function (Blueprint $table) {
            $table->index('vehicle_no');
        });
    }

    public function down(): void
    {
        Schema::table('job_cards', function (Blueprint $table) {
            $table->string('device_type')->nullable()->after('customer_email');
            $table->string('serial_no')->nullable()->after('model');
        });

        DB::table('job_cards')
            ->whereNotNull('chassis_no')
            ->update(['serial_no' => DB::raw('chassis_no')]);

        Schema::table('job_cards', function (Blueprint $table) {
            $table->dropIndex(['vehicle_no']);
            $table->dropColumn(['vehicle_no', 'chassis_no']);
        });
    }
};
