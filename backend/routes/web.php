<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use App\Models\Candidate;

Route::get('/', function () {
    return view('welcome');
});

// Public media route for candidate photos, avoids symlink issues on some Windows setups
Route::get('/media/candidates/{candidate}/photo', function (Candidate $candidate) {
    if (!$candidate->photo_path) {
        abort(404);
    }
    if (!Storage::disk('public')->exists($candidate->photo_path)) {
        abort(404);
    }
    return Storage::disk('public')->response($candidate->photo_path);
})->name('candidate.photo');
