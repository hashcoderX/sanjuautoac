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
        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('branch_id');
            $table->string('candidate_code')->unique();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique();
            $table->string('phone');
            $table->text('address')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('position_applied');
            $table->text('cv_path')->nullable();
            $table->enum('status', ['applied', 'shortlisted', 'interviewed', 'selected', 'rejected', 'hired'])->default('applied');
            $table->date('interview_date')->nullable();
            $table->time('interview_time')->nullable();
            $table->text('interview_notes')->nullable();
            $table->text('appointment_letter_path')->nullable();
            $table->date('joining_date')->nullable();
            $table->decimal('expected_salary', 10, 2)->nullable();
            $table->decimal('offered_salary', 10, 2)->nullable();
            $table->text('notes')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('companies');
            $table->foreign('branch_id')->references('id')->on('companies');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('candidates');
    }
};
