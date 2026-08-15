<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('registration_number')->unique();
            $table->enum('type', ['truck', 'van', 'pickup', 'lorry']);
            $table->decimal('capacity_kg', 10, 2);
            $table->enum('status', ['active', 'maintenance', 'inactive'])->default('active');
            $table->enum('fuel_type', ['diesel', 'petrol', 'electric']);
            $table->string('model');
            $table->year('year');
            $table->date('insurance_expiry');
            $table->date('license_expiry');
            $table->string('current_location');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
