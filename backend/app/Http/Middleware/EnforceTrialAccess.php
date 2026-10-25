<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\TenantTrial;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceTrialAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user instanceof User) {
            return $next($request);
        }

        $trial = TenantTrial::resolveForUser($user);
        $request->attributes->set('trial', $trial);

        if (($trial['status'] ?? null) === 'blocked') {
            return response()->json([
                'code' => 'trial_expired',
                'message' => $trial['message'] ?? 'Trial period has ended. Please upgrade to Pro.',
                'trial' => $trial,
            ], 403);
        }

        return $next($request);
    }
}
