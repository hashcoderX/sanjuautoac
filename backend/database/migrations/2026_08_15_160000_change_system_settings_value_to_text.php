<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE system_settings MODIFY value TEXT NULL');
            return;
        }

        if ($driver === 'sqlite') {
            // SQLite uses dynamic typing; existing string columns already accept long text values.
            return;
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE system_settings MODIFY value VARCHAR(255) NULL');
            return;
        }
    }
};
