<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saas_join_requests', function (Blueprint $table) {
            $table->string('database_user', 64)->nullable()->unique()->after('database_name');
            $table->text('database_password_encrypted')->nullable()->after('database_user');
            $table->string('database_host', 255)->nullable()->after('database_password_encrypted');
            $table->unsignedInteger('database_port')->nullable()->after('database_host');
        });
    }

    public function down(): void
    {
        Schema::table('saas_join_requests', function (Blueprint $table) {
            $table->dropColumn([
                'database_user',
                'database_password_encrypted',
                'database_host',
                'database_port',
            ]);
        });
    }
};
