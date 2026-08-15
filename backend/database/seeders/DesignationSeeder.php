<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Designation;

class DesignationSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Designation::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'name' => 'Driver',
            'description' => 'Vehicle Driver',
            'salary_range_min' => 30000.00,
            'salary_range_max' => 50000.00,
            'is_active' => true,
        ]);

        Designation::create([
            'tenant_id' => 1,
            'branch_id' => 1,
            'name' => 'Operations Manager',
            'description' => 'Operations Manager',
            'salary_range_min' => 60000.00,
            'salary_range_max' => 80000.00,
            'is_active' => true,
        ]);
    }
}
