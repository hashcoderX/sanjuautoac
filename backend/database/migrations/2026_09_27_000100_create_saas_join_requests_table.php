<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saas_join_requests', function (Blueprint $table) {
            $table->id();
            $table->string('business_name');
            $table->text('business_address');
            $table->string('contact_number', 40);
            $table->string('admin_name');
            $table->string('admin_email')->unique();
            $table->string('admin_password');
            $table->string('provision_status')->default('pending');
            $table->string('database_name')->nullable()->unique();
            $table->string('backup_namespace')->nullable()->unique();
            $table->boolean('dedicated_database')->default(true);
            $table->boolean('separate_backup')->default(true);
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saas_join_requests');
    }
};
