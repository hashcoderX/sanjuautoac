<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_card_documents', function (Blueprint $table) {
            $table->foreignId('service_customer_id')
                ->nullable()
                ->after('job_card_id')
                ->constrained('service_customers')
                ->nullOnDelete();
            $table->enum('payment_timing', ['credit', 'pay_now'])->nullable()->after('total_amount');
            $table->enum('payment_status', ['unpaid', 'partial', 'paid'])->nullable()->after('payment_timing');
            $table->string('payment_type')->nullable()->after('payment_status');
            $table->string('payment_reference')->nullable()->after('payment_type');
            $table->decimal('paid_amount', 12, 2)->default(0)->after('payment_reference');
            $table->decimal('balance_amount', 12, 2)->default(0)->after('paid_amount');
            $table->dateTime('paid_at')->nullable()->after('balance_amount');
        });
    }

    public function down(): void
    {
        Schema::table('job_card_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('service_customer_id');
            $table->dropColumn([
                'payment_timing',
                'payment_status',
                'payment_type',
                'payment_reference',
                'paid_amount',
                'balance_amount',
                'paid_at',
            ]);
        });
    }
};
