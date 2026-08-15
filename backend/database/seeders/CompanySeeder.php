<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Company;

class CompanySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Company::create([
            'name' => 'Sample Company Ltd',
            'email' => 'info@samplecompany.com',
            'phone' => '+94123456789',
            'address' => '123 Business Street, Colombo',
            'country' => 'Sri Lanka',
            'currency' => 'LKR',
        ]);
    }
}
