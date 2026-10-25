'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  status: 'active' | 'inactive';
  outstanding_balance: number;
  created_at: string;
  updated_at: string;
}

interface SupplierPurchaseHistoryItem {
  id: number;
  order_number: string;
  order_date: string;
  expected_delivery_date?: string | null;
  status: string;
  total_amount: number;
  notes?: string | null;
  created_at: string;
}

interface SupplierPaymentHistoryItem {
  id: number;
  grn_number: string;
  order_number?: string | null;
  received_date?: string | null;
  payment_status: string;
  payment_timing?: string | null;
  payment_type?: string | null;
  payment_reference?: string | null;
  paid_amount: number;
  paid_at?: string | null;
  payment_note?: string | null;
  net_amount: number;
  balance_due: number;
}

interface SupplierDetail extends Supplier {
  purchase_summary?: {
    total_orders: number;
    total_order_amount: number;
  };
  payment_summary?: {
    total_payments: number;
    total_paid_amount: number;
  };
  purchase_history?: SupplierPurchaseHistoryItem[];
  payment_history?: SupplierPaymentHistoryItem[];
}

export default function Suppliers() {
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewSupplier, setViewSupplier] = useState<SupplierDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    status: 'active' as 'active' | 'inactive',
    outstanding_balance: 0,
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
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
      console.error('Error fetching stock suppliers visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleSuppliersVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating stock suppliers widget visibility:', error);
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
      fetchSuppliers();
    }
  }, [token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [suppliers.length]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/stock/suppliers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 } // Get all suppliers for now
      });

      if (response.data.success) {
        const suppliersData = response.data.data.data || response.data.data || [];
        // Ensure outstanding_balance is a number
        const formattedSuppliers = suppliersData.map((supplier: any) => ({
          ...supplier,
          outstanding_balance: Number(supplier.outstanding_balance) || 0
        }));
        setSuppliers(formattedSuppliers);
      } else {
        console.error('Failed to fetch suppliers:', response.data.message);
        setSuppliers([]);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      // Keep mock data as fallback for development
      const mockSuppliers: Supplier[] = [
        {
          id: 1,
          name: 'ABC Supplies Ltd',
          contact_person: 'John Smith',
          email: 'john@abc-supplies.com',
          phone: '+1-555-0123',
          address: '123 Business St, City, State 12345',
          company: 'ABC Supplies Ltd',
          status: 'active',
          outstanding_balance: 2500.00,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          name: 'Global Traders Inc',
          contact_person: 'Sarah Johnson',
          email: 'sarah@global-traders.com',
          phone: '+1-555-0456',
          address: '456 Commerce Ave, City, State 12346',
          company: 'Global Traders Inc',
          status: 'active',
          outstanding_balance: 1250.50,
          created_at: '2024-01-20T14:30:00Z',
          updated_at: '2024-01-20T14:30:00Z'
        }
      ];
      setSuppliers(mockSuppliers);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      if (editingSupplier) {
        // Update existing supplier
        const response = await axios.put(`${API_URL}/api/stock/suppliers/${editingSupplier.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setSuppliers(prev => prev.map(sup =>
            sup.id === editingSupplier.id
              ? { ...response.data.data, outstanding_balance: Number(response.data.data.outstanding_balance) || 0 }
              : sup
          ));
        } else {
          throw new Error(response.data.message || 'Failed to update supplier');
        }
      } else {
        // Create new supplier
        const response = await axios.post(`${API_URL}/api/stock/suppliers`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setSuppliers(prev => [...prev, { ...response.data.data, outstanding_balance: Number(response.data.data.outstanding_balance) || 0 }]);
        } else {
          throw new Error(response.data.message || 'Failed to create supplier');
        }
      }

      setShowModal(false);
      setEditingSupplier(null);
      resetForm();
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      alert(error.response?.data?.message || error.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      company: supplier.company,
      status: supplier.status,
      outstanding_balance: supplier.outstanding_balance,
    });
    setShowModal(true);
  };

  const handleView = async (supplier: Supplier) => {
    try {
      setShowViewModal(true);
      setViewLoading(true);
      setViewSupplier(null);

      const response = await axios.get(`${API_URL}/api/stock/suppliers/${supplier.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success && response.data?.data) {
        const payload = response.data.data as any;
        setViewSupplier({
          ...payload,
          outstanding_balance: Number(payload.outstanding_balance) || 0,
          purchase_summary: payload.purchase_summary || { total_orders: 0, total_order_amount: 0 },
          payment_summary: payload.payment_summary || { total_payments: 0, total_paid_amount: 0 },
          purchase_history: Array.isArray(payload.purchase_history)
            ? payload.purchase_history.map((item: any) => ({
                ...item,
                total_amount: Number(item.total_amount) || 0,
              }))
            : [],
          payment_history: Array.isArray(payload.payment_history)
            ? payload.payment_history.map((item: any) => ({
                ...item,
                paid_amount: Number(item.paid_amount) || 0,
                net_amount: Number(item.net_amount) || 0,
                balance_due: Number(item.balance_due) || 0,
              }))
            : [],
        });
      } else {
        throw new Error(response.data?.message || 'Failed to load supplier details');
      }
    } catch (error: any) {
      console.error('Error loading supplier details:', error);
      alert(error.response?.data?.message || error.message || 'Failed to load supplier details');
      setShowViewModal(false);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await axios.delete(`${API_URL}/api/stock/suppliers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSuppliers(prev => prev.filter(sup => sup.id !== id));
        setDeleteConfirm(null);
      } else {
        throw new Error(response.data.message || 'Failed to delete supplier');
      }
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      alert(error.response?.data?.message || error.message || 'Failed to delete supplier');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      company: '',
      status: 'active',
      outstanding_balance: 0,
    });
  };

  const openAddModal = () => {
    setEditingSupplier(null);
    resetForm();
    setShowModal(true);
  };

  const supplierFieldClass =
    'mt-2 block w-full rounded-2xl border border-orange-200/80 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition duration-200 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100';

  const formatCurrency = (amount: number) => `LKR ${Number(amount || 0).toFixed(2)}`;
  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const totalPages = Math.max(1, Math.ceil(suppliers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, suppliers.length);
  const paginatedSuppliers = suppliers.slice(startIndex, endIndex);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff3e4_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      {isElementVisible('stock-suppliers-el-header') && (
        <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-el-header', true); }}
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
              Vendor relationship workspace
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Supplier Management</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Manage supplier profiles, communication channels, and payable snapshots in one polished command center.
              </p>
            </div>
            {isElementVisible('stock-suppliers-el-btn-add') && (
              <div className="relative inline-flex">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-el-btn-add', true); }}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide add supplier button"
                    aria-label="Hide add supplier button"
                  >
                    x
                  </button>
                )}
                <button
                  onClick={openAddModal}
                  className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-300/50 transition hover:scale-[1.02] hover:from-orange-600 hover:to-yellow-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Supplier
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {isElementVisible('stock-suppliers-el-stat-total') && (
              <div className="relative rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-el-stat-total', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-white/20 text-xs font-bold text-white hover:bg-white/30"
                  title="Hide total suppliers stat"
                  aria-label="Hide total suppliers stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Total Suppliers</p>
              <p className="mt-2 text-3xl font-bold">{suppliers.length}</p>
              <p className="mt-2 text-sm text-white/85">Active vendor records in your system</p>
            </div>
            )}
            {isElementVisible('stock-suppliers-el-stat-active') && (
              <div className="relative rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-el-stat-active', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  title="Hide active suppliers stat"
                  aria-label="Hide active suppliers stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Active</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{suppliers.filter((s) => s.status === 'active').length}</p>
              <p className="mt-2 text-sm text-slate-500">Ready for procurement operations</p>
            </div>
            )}
            {isElementVisible('stock-suppliers-el-stat-inactive') && (
              <div className="relative rounded-3xl border border-red-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-el-stat-inactive', true); }}
                  className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide inactive suppliers stat"
                  aria-label="Hide inactive suppliers stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Inactive</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{suppliers.filter((s) => s.status === 'inactive').length}</p>
              <p className="mt-2 text-sm text-slate-500">Archived or paused vendors</p>
            </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Suppliers Table */}
      {isElementVisible('stock-suppliers-sec-table') && (
        <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleSuppliersVisibilityToggle('stock-suppliers-sec-table', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide table section"
            aria-label="Hide table section"
          >
            x
          </button>
        )}
        <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
          {isElementVisible('stock-suppliers-el-title-directory') && (
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">Supplier Directory</h4>
          )}
        </div>
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-500 text-sm">No suppliers found</div>
              <button
                onClick={openAddModal}
                className="mt-4 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-orange-700 hover:to-amber-600"
              >
                Add Your First Supplier
              </button>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100/80">
                  <tr>
                    {isColumnVisible('stock-suppliers-col-supplier') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">Supplier</th>
                    )}
                    {isColumnVisible('stock-suppliers-col-contact') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">Contact</th>
                    )}
                    {isColumnVisible('stock-suppliers-col-status') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">Status</th>
                    )}
                    {isColumnVisible('stock-suppliers-col-outstanding-balance') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">Outstanding Balance</th>
                    )}
                    {isColumnVisible('stock-suppliers-col-actions') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedSuppliers.map((supplier) => (
                    <tr key={supplier.id} className="transition hover:bg-orange-50/35">
                      {isColumnVisible('stock-suppliers-col-supplier') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                              <span className="text-orange-600 font-medium text-sm">
                                {supplier.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {supplier.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {supplier.company}
                            </div>
                          </div>
                        </div>
                      </td>
                      )}
                      {isColumnVisible('stock-suppliers-col-contact') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{supplier.contact_person}</div>
                        <div className="text-sm text-gray-500">{supplier.email}</div>
                        <div className="text-sm text-gray-500">{supplier.phone}</div>
                      </td>
                      )}
                      {isColumnVisible('stock-suppliers-col-status') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          supplier.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {supplier.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      )}
                      {isColumnVisible('stock-suppliers-col-outstanding-balance') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        LKR {Number(supplier.outstanding_balance).toFixed(2)}
                      </td>
                      )}
                      {isColumnVisible('stock-suppliers-col-actions') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => { void handleView(supplier); }}
                          className="mr-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="mr-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(supplier.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isElementVisible('stock-suppliers-sec-pagination') && (
              <div className="mt-4 flex flex-col gap-3 border-t border-orange-100 bg-orange-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Showing {suppliers.length === 0 ? 0 : startIndex + 1} to {endIndex} of {suppliers.length} suppliers
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
                  <span className="text-sm font-semibold text-slate-700">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
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
      </div>
      )}

      {/* View Supplier Modal */}
      {showViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/25 bg-white shadow-[0_28px_90px_-35px_rgba(234,88,12,0.55)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.3),_transparent_42%),linear-gradient(120deg,_rgba(194,65,12,0.95)_0%,_rgba(234,88,12,0.95)_45%,_rgba(249,115,22,0.92)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pt-7 pb-6 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    👁️
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Supplier Details</h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    View complete supplier profile, outstanding amount, purchasing activity, and payment timeline.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewSupplier(null);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                {viewLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-orange-600"></div>
                  </div>
                ) : !viewSupplier ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Unable to load supplier details.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm md:col-span-2">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">Profile</h4>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-slate-700">
                          <div><span className="font-semibold text-slate-900">Supplier:</span> {viewSupplier.name || '—'}</div>
                          <div><span className="font-semibold text-slate-900">Company:</span> {viewSupplier.company || '—'}</div>
                          <div><span className="font-semibold text-slate-900">Contact Person:</span> {viewSupplier.contact_person || '—'}</div>
                          <div><span className="font-semibold text-slate-900">Phone:</span> {viewSupplier.phone || '—'}</div>
                          <div><span className="font-semibold text-slate-900">Email:</span> {viewSupplier.email || '—'}</div>
                          <div>
                            <span className="font-semibold text-slate-900">Status:</span>{' '}
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                              viewSupplier.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {viewSupplier.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">Address:</span> {viewSupplier.address || '—'}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-4 shadow-sm">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-500">Outstanding</h4>
                        <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(viewSupplier.outstanding_balance)}</p>
                        <p className="mt-2 text-xs text-slate-600">Current payable balance for this supplier.</p>
                        <div className="mt-4 border-t border-orange-100 pt-3 text-xs text-slate-600 space-y-1">
                          <p>Orders: {viewSupplier.purchase_summary?.total_orders ?? 0}</p>
                          <p>Order Total: {formatCurrency(viewSupplier.purchase_summary?.total_order_amount ?? 0)}</p>
                          <p>Payments: {viewSupplier.payment_summary?.total_payments ?? 0}</p>
                          <p>Total Paid: {formatCurrency(viewSupplier.payment_summary?.total_paid_amount ?? 0)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-orange-100 bg-white shadow-sm">
                      <div className="border-b border-orange-100 bg-orange-50/50 px-4 py-3">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-orange-600">Purchasing History</h4>
                      </div>
                      <div className="overflow-x-auto">
                        {viewSupplier.purchase_history && viewSupplier.purchase_history.length > 0 ? (
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100/70">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">PO Number</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Order Date</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Expected Date</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {viewSupplier.purchase_history.map((po) => (
                                <tr key={po.id} className="hover:bg-orange-50/30">
                                  <td className="px-4 py-2 font-medium text-slate-900">{po.order_number || `PO #${po.id}`}</td>
                                  <td className="px-4 py-2 text-slate-700">{formatDate(po.order_date)}</td>
                                  <td className="px-4 py-2 text-slate-700">{formatDate(po.expected_delivery_date)}</td>
                                  <td className="px-4 py-2">
                                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 capitalize">
                                      {po.status || '—'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(po.total_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="px-4 py-4 text-sm text-slate-500">No purchasing history found for this supplier.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
                      <div className="border-b border-emerald-100 bg-emerald-50/50 px-4 py-3">
                        <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Payment History</h4>
                      </div>
                      <div className="overflow-x-auto">
                        {viewSupplier.payment_history && viewSupplier.payment_history.length > 0 ? (
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100/70">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">GRN</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">PO</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Paid Date</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Method</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Paid</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Balance Due</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {viewSupplier.payment_history.map((payment) => (
                                <tr key={payment.id} className="hover:bg-emerald-50/25">
                                  <td className="px-4 py-2 font-medium text-slate-900">{payment.grn_number || `GRN #${payment.id}`}</td>
                                  <td className="px-4 py-2 text-slate-700">{payment.order_number || '—'}</td>
                                  <td className="px-4 py-2 text-slate-700">{formatDate(payment.paid_at || payment.received_date)}</td>
                                  <td className="px-4 py-2 text-slate-700 capitalize">{payment.payment_type ? payment.payment_type.replace(/_/g, ' ') : '—'}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{formatCurrency(payment.paid_amount)}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-orange-700">{formatCurrency(payment.balance_due)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="px-4 py-4 text-sm text-slate-500">No payment history found for this supplier.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-[30px] border border-white/25 bg-white shadow-[0_28px_90px_-35px_rgba(234,88,12,0.55)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.3),_transparent_42%),linear-gradient(120deg,_rgba(194,65,12,0.95)_0%,_rgba(234,88,12,0.95)_45%,_rgba(249,115,22,0.92)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pt-7 pb-6 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    {editingSupplier ? '✎' : '🤝'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {editingSupplier ? 'Update Supplier Profile' : 'Add New Supplier'}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    Build a complete supplier profile with identity, contacts, and financial status in one polished workflow.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Supplier Profile</p>
                    <h4 className="mt-2 text-lg font-semibold text-gray-900">Identity and relationship</h4>
                    <p className="mt-1 text-sm text-gray-500">Capture supplier information used across purchasing and stock operations.</p>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Supplier Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter supplier name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Company</label>
                        <input
                          type="text"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter company name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Contact Person *</label>
                        <input
                          type="text"
                          required
                          value={formData.contact_person}
                          onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter contact person"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                          className={supplierFieldClass}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Address</label>
                        <textarea
                          rows={4}
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className={`${supplierFieldClass} min-h-[110px] resize-none`}
                          placeholder="Enter full address"
                        />
                      </div>
                    </div>
                  </section>

                  <div className="space-y-6">
                    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Contact Channels</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Communication</h4>
                      <p className="mt-1 text-sm text-gray-500">Primary channels for PO follow-up and delivery coordination.</p>

                      <div className="mt-5 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Email</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={supplierFieldClass}
                            placeholder="Enter email address"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Phone</label>
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className={supplierFieldClass}
                            placeholder="Enter phone number"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Financial Snapshot</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Opening balance</h4>
                      <p className="mt-1 text-sm text-gray-500">Track outstanding supplier payable at onboarding or update stage.</p>

                      <div className="mt-5">
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Outstanding Balance</label>
                        <div className="relative mt-2">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-orange-600">LKR</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.outstanding_balance}
                            onChange={(e) => setFormData({ ...formData, outstanding_balance: Number(e.target.value) || 0 })}
                            className={`${supplierFieldClass} pl-14`}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:scale-[1.01] hover:shadow-xl hover:shadow-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Add Supplier')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-white shadow-[0_24px_80px_-35px_rgba(239,68,68,0.6)]">
            <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-5 text-white">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-xl">
                ⚠
              </div>
              <h3 className="mt-3 text-xl font-semibold">Delete Supplier</h3>
              <p className="mt-1 text-sm text-white/90">This action is permanent and cannot be undone.</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">
                Are you sure you want to delete this supplier record from the directory?
              </p>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="rounded-full border border-transparent bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}