<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('candidate_interviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('candidate_id');
            $table->date('interview_date');
            $table->time('interview_time');
            $table->text('interview_notes')->nullable();
            $table->decimal('score', 5, 2)->nullable();
            $table->enum('result', ['pending', 'pass', 'fail'])->default('pending');
            $table->timestamps();

            $table->foreign('candidate_id')->references('id')->on('candidates')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_interviews');
    }
};
