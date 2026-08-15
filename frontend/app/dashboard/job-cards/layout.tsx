'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function JobCardsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPrintRoute = pathname?.includes('/documents/') && pathname?.endsWith('/print');

  if (isPrintRoute) {
    return <>{children}</>;
  }

  const navigation = [
    { name: 'Job Cards', href: '/dashboard/job-cards', icon: '🔧' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-6">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Job Cards
              </h1>
              <nav className="flex flex-wrap gap-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition ${
                      pathname === item.href
                        ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 transition hover:text-indigo-600"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
