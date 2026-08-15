<?php

namespace Database\Seeders;

use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveTypeSeeder extends Seeder
{
    public function run(): void
    {
        $leaveTypes = [
            [
                'name' => 'Annual Leave',
                'code' => 'annual',
                'description' => 'Regular annual leave entitlement',
                'max_days_per_year' => 21,
                'requires_documentation' => false,
                'is_active' => true,
            ],
            [
                'name' => 'Casual Leave',
                'code' => 'casual',
                'description' => 'Short-term casual leave',
                'max_days_per_year' => 7,
                'requires_documentation' => false,
                'is_active' => true,
            ],
            [
                'name' => 'Medical Leave',
                'code' => 'medical',
                'description' => 'Medical or sick leave',
                'max_days_per_year' => 14,
                'requires_documentation' => true,
                'is_active' => true,
            ],
            [
                'name' => 'Maternity Leave',
                'code' => 'maternity',
                'description' => 'Maternity leave for new mothers',
                'max_days_per_year' => 84,
                'requires_documentation' => true,
                'is_active' => true,
            ],
            [
                'name' => 'Other Leave',
                'code' => 'other',
                'description' => 'Other types of leave',
                'max_days_per_year' => 10,
                'requires_documentation' => true,
                'is_active' => true,
            ],
        ];

        foreach ($leaveTypes as $leaveType) {
            LeaveType::firstOrCreate(
                ['code' => $leaveType['code']],
                $leaveType
            );
        }
    }
}