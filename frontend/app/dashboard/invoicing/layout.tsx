'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function InvoicingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPrintRoute = pathname?.includes('/documents/') && pathname?.endsWith('/print');

  if (isPrintRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-6">
              <h1 className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-2xl font-bold text-transparent">
                Invoicing
              </h1>
              <nav className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard/invoicing"
                  className={`flex items-center rounded-xl px-3 py-2 text-sm font-medium transition ${
                    pathname === '/dashboard/invoicing'
                      ? 'bg-teal-100 text-teal-800 ring-1 ring-teal-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="mr-2">🧾</span>
                  Quotations &amp; Invoices
                </Link>
              </nav>
            </div>
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-teal-600">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
