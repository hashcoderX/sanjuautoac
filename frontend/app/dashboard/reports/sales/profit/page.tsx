'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

type SaleItem = {
  id: number;
  inventory_item_id: number;
  item_code?: string;
  item_name?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
  items?: SaleItem[];
};

type InventoryRow = {
  id: number;
  code?: string;
  name?: string;
  unit_price?: number;
};

type Paginated<T> = {
  data?: T[];
  next_page_url?: string | null;
  current_page?: number;
  last_page?: number;
};

type SalesFilters = {
  fromDate: string;
  toDate: string;
  search: string;
};

type ProfitRow = {
  id: number;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  qty: number;
  revenue: number;
  estimatedCost: number;
  grossProfit: number;
  margin: number;
};

type OutletSummaryRow = {
  outlet_id: number;
  outlet_name?: string;
  outlet_code?: string;
};

const initialFilters: SalesFilters = {
  fromDate: '',
  toDate: '',
  search: '',
};

export default function SalesProfitReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const inputClass =
    'w-full rounded-xl border border-emerald-100 bg-white/95 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 focus:outline-none';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const verifyAccessAndLoad = async () => {
      try {
        const userRes = await axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles) ? userData.roles.map((role: any) => String(role?.name || role || '')) : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) => String(permission?.name || '').trim().toLowerCase())
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');
        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await loadData(token);
      } catch (error) {
        console.error('Error checking sales report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccessAndLoad();
  }, [token, router, API_URL]);

  const loadData = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const [salesResult, inventoryResult] = await Promise.allSettled([
        fetchAllSales(tokenToUse),
        fetchAllInventory(tokenToUse),
      ]);

      const nextSales = salesResult.status === 'fulfilled' ? salesResult.value : [];
      const nextInventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : [];

      setSales(nextSales);
      setInventoryRows(nextInventory);

      if (salesResult.status === 'rejected' && inventoryResult.status === 'rejected') {
        throw new Error('Failed to load both sales and inventory data.');
      }

      if (salesResult.status === 'rejected') {
        console.error('Sales loading failed:', salesResult.reason);
        setErrorMessage('Sales endpoint is unstable right now. Showing available data only.');
      } else if (inventoryResult.status === 'rejected') {
        console.error('Inventory loading failed:', inventoryResult.reason);
        setErrorMessage('Inventory cost data failed to load. Profit may be understated.');
      }
    } catch (error) {
      console.error('Error loading sales profit report:', error);
      setSales([]);
      setInventoryRows([]);
      setErrorMessage('Failed to load sales and inventory data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSales = async (authToken: string) => {
    try {
      const salesFromOutletReports = await fetchSalesFromOutletReports(authToken);
      if (salesFromOutletReports.length > 0) {
        return salesFromOutletReports;
      }
    } catch (error) {
      console.warn('Outlet-wise sales report fetch failed, falling back to paginated sales API:', error);
    }

    try {
      return await fetchSalesFromPaginatedEndpoint(authToken);
    } catch (error) {
      console.warn('Paginated sales API failed, returning empty sales dataset:', error);
      return [];
    }
  };

  const fetchSalesFromOutletReports = async (authToken: string) => {
    const summaryRes = await axios.get(`${API_URL}/api/outlet-pos/sales-summary`, {
      headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
    });

    const summaryRows = Array.isArray(summaryRes.data?.data)
      ? (summaryRes.data.data as OutletSummaryRow[])
      : [];

    const outletIds = summaryRows
      .map((row) => Number(row.outlet_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const uniqueOutletIds = [...new Set(outletIds)];

    const perOutletResults = await Promise.all(
      uniqueOutletIds.map(async (outletId) => {
        try {
          const reportRes = await axios.get(
            `${API_URL}/api/outlet-pos/outlets/${outletId}/sales-report`,
            {
              headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
              params: { limit: 5000 },
            }
          );

          return Array.isArray(reportRes.data?.data?.sales)
            ? (reportRes.data.data.sales as SaleRow[])
            : [];
        } catch (error) {
          console.warn(`Sales report failed for outlet ${outletId}:`, error);
          return [];
        }
      })
    );

    return perOutletResults.flat();
  };

  const fetchSalesFromPaginatedEndpoint = async (authToken: string) => {
    const allRows: SaleRow[] = [];
    const perPage = 50;
    let page = 1;
    let lastPage = 1;
    let guard = 0;
    let serverFailureCount = 0;

    while (page <= lastPage && guard < 200) {
      const response: { status: number; data?: { data?: Paginated<SaleRow>; message?: string } } =
        await axios.get(`${API_URL}/api/outlet-pos/sales`, {
          headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
          params: { per_page: perPage, page },
          validateStatus: () => true,
        });

      if (response.status === 401) {
        throw new Error('Unauthorized');
      }

      if (response.status >= 500) {
        serverFailureCount += 1;
        console.warn(`Sales page ${page} failed with ${response.status}.`);
        if (serverFailureCount >= 2 && allRows.length > 0) {
          break;
        }
        page += 1;
        guard += 1;
        continue;
      }

      if (response.status >= 400) {
        throw new Error(response.data?.message || 'Failed to load outlet sales.');
      }

      serverFailureCount = 0;
      const payload = response.data?.data;
      const pageRows = Array.isArray(payload?.data) ? payload.data : [];
      allRows.push(...pageRows);

      const currentPage = Number(payload?.current_page || page);
      const parsedLastPage = Number(payload?.last_page || currentPage);
      lastPage = Number.isFinite(parsedLastPage) && parsedLastPage > 0 ? parsedLastPage : currentPage;
      page = currentPage + 1;
      guard += 1;

      if (currentPage >= lastPage) {
        break;
      }
    }

    return allRows;
  };

  const fetchAllInventory = async (authToken: string) => {
    const allRows: InventoryRow[] = [];
    let nextUrl: string | null = `${API_URL}/api/stock/inventory?per_page=200`;
    let pageCount = 0;

    while (nextUrl && pageCount < 50) {
      const response: { data: { data?: Paginated<InventoryRow> } } = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: 'application/json' },
      });
      const payload = response.data?.data;
      const pageRows = Array.isArray(payload?.data) ? payload.data : [];
      allRows.push(...pageRows);
      nextUrl = payload?.next_page_url || null;
      pageCount += 1;
    }

    return allRows;
  };

  const costByInventoryId = useMemo(() => {
    const map = new Map<number, number>();
    inventoryRows.forEach((item) => {
      map.set(Number(item.id), Number(item.unit_price || 0));
    });
    return map;
  }, [inventoryRows]);

  const profitRows = useMemo<ProfitRow[]>(() => {
    return sales.map((sale) => {
      const lines = Array.isArray(sale.items) ? sale.items : [];
      const estimatedCost = lines.reduce((sum, line) => {
        const unitCost = Number(costByInventoryId.get(Number(line.inventory_item_id)) || 0);
        return sum + Number(line.quantity || 0) * unitCost;
      }, 0);
      const revenue = Number(sale.total_amount || 0);
      const grossProfit = revenue - estimatedCost;
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        id: sale.id,
        saleNumber: sale.sale_number,
        saleDate: sale.sale_date,
        customerName: sale.customer_name || '-',
        qty: Number(sale.total_quantity || 0),
        revenue,
        estimatedCost,
        grossProfit,
        margin,
      };
    });
  }, [sales, costByInventoryId]);

  const filteredRows = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const fromAt = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`).getTime() : null;
    const toAt = filters.toDate ? new Date(`${filters.toDate}T23:59:59`).getTime() : null;

    return profitRows.filter((row) => {
      const time = new Date(row.saleDate).getTime();
      if (fromAt !== null && time < fromAt) return false;
      if (toAt !== null && time > toAt) return false;

      if (!term) return true;

      const text = [row.saleNumber, row.customerName].join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [profitRows, filters]);

  const summary = useMemo(() => {
    const totalSales = filteredRows.length;
    const totalQty = filteredRows.reduce((sum, row) => sum + row.qty, 0);
    const totalRevenue = filteredRows.reduce((sum, row) => sum + row.revenue, 0);
    const totalEstimatedCost = filteredRows.reduce((sum, row) => sum + row.estimatedCost, 0);
    const totalProfit = totalRevenue - totalEstimatedCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { totalSales, totalQty, totalRevenue, totalEstimatedCost, totalProfit, margin };
  }, [filteredRows]);

  const fmt = (value: number) =>
    Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Sales & Profit Report
              </h1>
              <p className="text-sm text-gray-600">Revenue, estimated cost, and gross profit insights</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/reports"
                className="px-3 py-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                Reports Center
              </Link>
              <button
                type="button"
                onClick={() => loadData()}
                disabled={loading}
                className="px-3 py-1.5 text-sm rounded-md border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-60"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {errorMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{errorMessage}</div>
        ) : null}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Sale number or customer"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 p-4 shadow-sm">
            <div className="text-xs text-gray-500">Sales</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalSales}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-4 shadow-sm">
            <div className="text-xs text-gray-500">Qty</div>
            <div className="text-2xl font-bold text-gray-900">{fmt(summary.totalQty)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-4 shadow-sm">
            <div className="text-xs text-gray-500">Revenue</div>
            <div className="text-2xl font-bold text-emerald-700">{fmt(summary.totalRevenue)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-4 shadow-sm">
            <div className="text-xs text-gray-500">Estimated Cost</div>
            <div className="text-2xl font-bold text-amber-700">{fmt(summary.totalEstimatedCost)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 p-4 shadow-sm">
            <div className="text-xs text-gray-500">Gross Profit</div>
            <div className={`text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
              {fmt(summary.totalProfit)} ({fmt(summary.margin)}%)
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="overflow-x-auto rounded-xl border border-emerald-100">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-emerald-50 to-teal-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Est. Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Gross Profit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Margin %</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                      Loading sales and inventory data...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                      No sales found for selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-gray-800">{row.saleNumber}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(row.saleDate).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.customerName}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{fmt(row.qty)}</td>
                      <td className="px-4 py-2 text-sm text-right text-emerald-700 font-semibold">{fmt(row.revenue)}</td>
                      <td className="px-4 py-2 text-sm text-right text-amber-700 font-semibold">{fmt(row.estimatedCost)}</td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${row.grossProfit >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                        {fmt(row.grossProfit)}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${row.margin >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                        {fmt(row.margin)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

