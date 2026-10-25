'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

interface StockItem {
  id: number;
  name: string;
  code: string;
  type: 'raw_material' | 'finished_good';
  unit: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  status: 'active' | 'inactive';
}

export default function StockLevels() {
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;
  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  const isSuperAdminUser = (userData: any): boolean => {
    const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
    const roleNames = [
      String(userData?.role || ''),
      ...(Array.isArray(userData?.roles)
        ? userData.roles.map((role: any) => String(role?.name || role || ''))
        : []),
    ]
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);

    const roleBlob = roleNames.join(' ');
    return !employeeId || roleBlob.includes('super admin') || roleBlob.includes('superadmin');
  };

  const fetchAccessProfile = async (authToken: string) => {
    try {
      const [userRes, visibilityRes] = await Promise.all([
        axios.get(`${API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        axios.get(`${API_URL}/api/feature-visibility`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      const superAdmin = isSuperAdminUser(userRes.data || {});
      const hiddenModuleList = Array.isArray(visibilityRes.data?.hidden_modules)
        ? visibilityRes.data.hidden_modules
            .map((moduleId: unknown) => String(moduleId || '').trim())
            .filter(Boolean)
        : [];

      setCanManageFeatureVisibility(superAdmin && Boolean(visibilityRes.data?.can_manage));
      setHiddenModules(Array.from(new Set(hiddenModuleList)));
    } catch (error) {
      console.error('Error fetching stock levels visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleStockLevelsVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
    if (!token || !canManageFeatureVisibility) {
      return;
    }

    try {
      const response = await axios.put(
        `${API_URL}/api/feature-visibility`,
        {
          module_key: moduleKey,
          hidden,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const nextHiddenModules = Array.isArray(response.data?.hidden_modules)
        ? response.data.hidden_modules
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean)
        : [];

      setHiddenModules(Array.from(new Set(nextHiddenModules)));
    } catch (error) {
      console.error('Error updating stock levels widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
      fetchAccessProfile(storedToken);
    }
  }, [router]);

  useEffect(() => {
    const stored = localStorage.getItem(GLOBAL_WIDGET_FIX_KEY);
    setWidgetsFixed(stored === '1');

    const handleStorage = (event: StorageEvent) => {
      if (event.key === GLOBAL_WIDGET_FIX_KEY) {
        setWidgetsFixed(event.newValue === '1');
      }
    };

    const handleWidgetFixChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ fixed?: boolean }>;
      setWidgetsFixed(Boolean(customEvent.detail?.fixed));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('widgets-fixed-changed', handleWidgetFixChanged as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('widgets-fixed-changed', handleWidgetFixChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchStockItems();
    }
  }, [token]);

  const fetchStockItems = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/stock/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 2000 },
      });

      if (response.data.success) {
        const rows = response.data.data?.data || response.data.data || [];
        const normalized = rows.map((item: any) => ({
          ...item,
          current_stock: Number(item.current_stock) || 0,
          minimum_stock: Number(item.minimum_stock) || 0,
          maximum_stock: item.maximum_stock !== null ? Number(item.maximum_stock) || 0 : null,
        }));
        setItems(normalized);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error('Error fetching stock levels:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (item: StockItem) => {
    if (item.current_stock <= 0) {
      return { key: 'out', label: 'Out of Stock', color: 'border-red-200 bg-red-100 text-red-700' };
    }
    if (item.current_stock <= item.minimum_stock) {
      return { key: 'low', label: 'Low Stock', color: 'border-amber-200 bg-amber-100 text-amber-700' };
    }
    if (item.maximum_stock && item.current_stock > item.maximum_stock) {
      return { key: 'over', label: 'Overstock', color: 'border-blue-200 bg-blue-100 text-blue-700' };
    }
    return { key: 'healthy', label: 'Healthy', color: 'border-emerald-200 bg-emerald-100 text-emerald-700' };
  };

  const totalTracked = items.length;
  const lowStockCount = items.filter((item) => getStockStatus(item).key === 'low').length;
  const healthyCount = items.filter((item) => getStockStatus(item).key === 'healthy').length;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);
  const paginatedItems = items.slice(startIndex, endIndex);
  const visibleLevelsColumns = Math.max(
    [
      'stock-levels-col-item',
      'stock-levels-col-store',
      'stock-levels-col-current',
      'stock-levels-col-minimum',
      'stock-levels-col-status',
    ].filter((key) => isColumnVisible(key)).length,
    1
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff3e4_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
      {isElementVisible('stock-levels-el-header') && (
        <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-header', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide header"
            aria-label="Hide header"
          >
            x
          </button>
        )}
        <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              Real-time stock monitoring
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Stock Levels</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Monitor current stock levels, identify shortages early, and prepare restocking decisions with confidence.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {isElementVisible('stock-levels-el-stat-total-tracked') && (
              <div className="relative rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-stat-total-tracked', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-white/20 text-xs font-bold text-white hover:bg-white/30"
                  title="Hide total tracked stat"
                  aria-label="Hide total tracked stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Total Tracked</p>
              <p className="mt-2 text-3xl font-bold">{totalTracked}</p>
              <p className="mt-2 text-sm text-white/85">Connected from live inventory records</p>
            </div>
            )}
            {isElementVisible('stock-levels-el-stat-low-stock') && (
              <div className="relative rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-stat-low-stock', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide low stock stat"
                  aria-label="Hide low stock stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Low Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{lowStockCount}</p>
              <p className="mt-2 text-sm text-slate-500">Below reorder threshold</p>
            </div>
            )}
            {isElementVisible('stock-levels-el-stat-healthy') && (
              <div className="relative rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-stat-healthy', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  title="Hide healthy stat"
                  aria-label="Hide healthy stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Healthy</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{healthyCount}</p>
              <p className="mt-2 text-sm text-slate-500">Within target range</p>
            </div>
            )}
          </div>
        </div>
      </div>
      )}

      {isElementVisible('stock-levels-sec-grid') && (
        <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-sec-grid', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide stock grid section"
            aria-label="Hide stock grid section"
          >
            x
          </button>
        )}
        <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">Stock Monitoring Grid</h4>
        </div>

        <div className="p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {isElementVisible('stock-levels-el-card-filter') && (
              <div className="relative rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-card-filter', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide filter card"
                  aria-label="Hide filter card"
                >
                  x
                </button>
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Filter</p>
              <p className="mt-2 text-sm text-slate-600">Store Type: All</p>
            </div>
            )}
            {isElementVisible('stock-levels-el-card-threshold') && (
              <div className="relative rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-card-threshold', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide threshold card"
                  aria-label="Hide threshold card"
                >
                  x
                </button>
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Threshold</p>
              <p className="mt-2 text-sm text-slate-600">Reorder Alert: Enabled</p>
            </div>
            )}
            {isElementVisible('stock-levels-el-card-refresh') && (
              <div className="relative rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-el-card-refresh', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide refresh card"
                  aria-label="Hide refresh card"
                >
                  x
                </button>
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Refresh</p>
              <button
                onClick={fetchStockItems}
                className="mt-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
              >
                Refresh Data
              </button>
            </div>
            )}
          </div>

          {isElementVisible('stock-levels-sec-table') && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-orange-600"></div>
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-base font-semibold text-slate-700">No stock level records yet</p>
                <p className="mt-2 text-sm text-slate-500">Inventory items will appear here automatically.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100/80">
                      <tr>
                        {isColumnVisible('stock-levels-col-item') && (
                          <th className="relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Item
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-col-item', true); }}
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                                title="Hide item column"
                                aria-label="Hide item column"
                              >
                                x
                              </button>
                            )}
                          </th>
                        )}
                        {isColumnVisible('stock-levels-col-store') && (
                          <th className="relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Store
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-col-store', true); }}
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                                title="Hide store column"
                                aria-label="Hide store column"
                              >
                                x
                              </button>
                            )}
                          </th>
                        )}
                        {isColumnVisible('stock-levels-col-current') && (
                          <th className="relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Current
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-col-current', true); }}
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                                title="Hide current column"
                                aria-label="Hide current column"
                              >
                                x
                              </button>
                            )}
                          </th>
                        )}
                        {isColumnVisible('stock-levels-col-minimum') && (
                          <th className="relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Minimum
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-col-minimum', true); }}
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                                title="Hide minimum column"
                                aria-label="Hide minimum column"
                              >
                                x
                              </button>
                            )}
                          </th>
                        )}
                        {isColumnVisible('stock-levels-col-status') && (
                          <th className="relative px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Status
                            {showWidgetCloseButtons && (
                              <button
                                type="button"
                                onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-col-status', true); }}
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                                title="Hide status column"
                                aria-label="Hide status column"
                              >
                                x
                              </button>
                            )}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {paginatedItems.map((item) => {
                        const stockMeta = getStockStatus(item);
                        return (
                          <tr key={item.id} className="transition hover:bg-orange-50/40">
                            {isColumnVisible('stock-levels-col-item') && (
                              <td className="px-4 py-3.5 text-sm text-slate-700">
                                <p className="font-semibold text-slate-900">{item.name}</p>
                                <p className="text-xs text-slate-500">{item.code}</p>
                              </td>
                            )}
                            {isColumnVisible('stock-levels-col-store') && (
                              <td className="px-4 py-3.5 text-sm text-slate-700">
                                {item.type === 'raw_material' ? 'Raw Material' : 'Finished Good'}
                              </td>
                            )}
                            {isColumnVisible('stock-levels-col-current') && (
                              <td className="px-4 py-3.5 text-sm text-slate-700">
                                {item.current_stock.toFixed(2)} {item.unit}
                              </td>
                            )}
                            {isColumnVisible('stock-levels-col-minimum') && (
                              <td className="px-4 py-3.5 text-sm text-slate-700">
                                {item.minimum_stock.toFixed(2)} {item.unit}
                              </td>
                            )}
                            {isColumnVisible('stock-levels-col-status') && (
                              <td className="px-4 py-3.5 text-sm">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stockMeta.color}`}>
                                  {stockMeta.label}
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {isElementVisible('stock-levels-sec-pagination') && (
                  <div className="relative flex flex-col gap-3 border-t border-orange-100 bg-orange-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleStockLevelsVisibilityToggle('stock-levels-sec-pagination', true); }}
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                      title="Hide pagination"
                      aria-label="Hide pagination"
                    >
                      x
                    </button>
                  )}
                  <p className="text-sm text-slate-600">
                    Showing {items.length === 0 ? 0 : startIndex + 1} to {endIndex} of {items.length} records
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rows</label>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-sm font-semibold text-slate-700">Page {safeCurrentPage} of {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}