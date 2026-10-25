<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saas_join_requests', function (Blueprint $table) {
            $table->string('country', 120)->after('business_address');
            $table->string('currency', 10)->after('country');
        });
    }

    public function down(): void
    {
        Schema::table('saas_join_requests', function (Blueprint $table) {
            $table->dropColumn(['country', 'currency']);
        });
    }
};
