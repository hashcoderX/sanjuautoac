<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Appointment Letter</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 40px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .company-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .letter-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .date {
            text-align: right;
            margin-bottom: 20px;
        }
        .recipient {
            margin-bottom: 20px;
        }
        .content {
            margin-bottom: 20px;
        }
        .signature {
            margin-top: 40px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">{{ $company->name ?? 'Company Name' }}</div>
        <div>Company Address</div>
        <div>Phone: Company Phone | Email: Company Email</div>
    </div>

    <div class="date">
        Date: {{ date('F d, Y') }}
    </div>

    <div class="recipient">
        <strong>{{ $candidate->full_name }}</strong><br>
        {{ $candidate->address }}<br>
        {{ $candidate->email }}<br>
        {{ $candidate->phone }}
    </div>

    <div class="letter-title">
        APPOINTMENT LETTER
    </div>

    <div class="content">
        <p>Dear {{ $candidate->first_name }},</p>

        <p>We are pleased to offer you the position of <strong>{{ $candidate->position_applied }}</strong> at {{ $company->name ?? 'our company' }}.</p>

        <p><strong>Terms of Employment:</strong></p>
        <ul>
            <li><strong>Position:</strong> {{ $candidate->position_applied }}</li>
            <li><strong>Start Date:</strong> {{ $candidate->joining_date ? $candidate->joining_date->format('F d, Y') : 'To be determined' }}</li>
            <li><strong>Salary:</strong> ${{ number_format($candidate->offered_salary ?? 0, 2) }} per annum</li>
            @if($candidate->commission)
                <li><strong>Commission:</strong> {{ $candidate->commission }}% based on {{ ucfirst(str_replace('_', ' ', $candidate->commission_base ?? 'company profit')) }}</li>
            @endif
        </ul>

        <p>This appointment is subject to the following conditions:</p>
        <ol>
            <li>Successful completion of probationary period</li>
            <li>Satisfactory background verification</li>
            <li>Medical fitness certificate</li>
        </ol>

        <p>Please confirm your acceptance of this offer by signing and returning this letter by {{ date('F d, Y', strtotime('+7 days')) }}.</p>

        <p>We look forward to welcoming you to our team.</p>

        <p>Best regards,</p>
    </div>

    <div class="signature">
        <p>{{ $company->name ?? 'Company Name' }}</p>
        <p>Authorized Signatory</p>
    </div>
</body>
</html>