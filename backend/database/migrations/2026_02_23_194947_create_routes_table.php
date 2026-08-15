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
        Schema::create('routes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('origin');
            $table->string('destination');
            $table->decimal('distance_km', 8, 2);
            $table->decimal('estimated_duration_hours', 4, 2);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->enum('route_type', ['local', 'inter_city', 'highway']);
            $table->decimal('toll_charges', 10, 2)->default(0);
            $table->decimal('fuel_estimate_liters', 8, 2)->default(0);
            $table->text('description')->nullable();
            $table->json('waypoints')->nullable(); // Store as JSON array
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('routes');
    }
};
