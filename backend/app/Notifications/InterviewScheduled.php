<?php

namespace App\Notifications;

use App\Models\CandidateInterview;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InterviewScheduled extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public CandidateInterview $interview) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $candidate = $this->interview->candidate;
        return (new MailMessage)
            ->subject('Interview Scheduled: ' . $candidate->full_name)
            ->greeting('Hello ' . ($notifiable->first_name ?? ''))
            ->line('An interview has been scheduled for candidate: ' . $candidate->full_name)
            ->line('Position: ' . $candidate->position_applied)
            ->line('Date: ' . ($this->interview->interview_date ? $this->interview->interview_date->format('Y-m-d') : ''))
            ->line('Time: ' . ($this->interview->interview_time ?? ''))
            ->line('Notes: ' . ($this->interview->interview_notes ?? ''))
            ->action('Open HRM', url('/dashboard/hrm/candidates'))
            ->line('Thank you.');
    }
}
