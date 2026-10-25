'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

interface Supplier {
  id: number;
  name: string;
}

interface GrnListRecord {
  id: number;
  grn_number: string;
  received_date: string;
  notes?: string | null;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  paid_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_timing?: 'post_payment' | 'on_time';
  payment_type?: string | null;
  created_at?: string;
  purchase_order?: {
    id: number;
    order_number: string;
    supplier?: { id: number; name: string };
  };
  grn_items?: Array<{ id: number }>;
}

interface GrnPaymentBreakdownEntry {
  payment_type?: string;
  payment_reference?: string | null;
  paid_amount?: number;
  paid_at?: string | null;
}

interface GrnDetailItem {
  id: number;
  received_quantity?: number;
  accepted_quantity?: number;
  rejected_quantity?: number;
  purchase_price?: number;
  sell_price?: number;
  quality_status?: string;
  remarks?: string | null;
  expiry_date?: string | null;
  purchase_order_item?: {
    id?: number;
    item_name?: string;
    item_code?: string;
    inventory_item?: {
      id?: number;
      name?: string;
      code?: string;
      unit?: string;
    };
  };
}

interface GrnDetailRecord extends GrnListRecord {
  payment_reference?: string | null;
  payment_note?: string | null;
  paid_at?: string | null;
  payment_breakdown?: GrnPaymentBreakdownEntry[] | null;
  grn_items?: GrnDetailItem[];
}

interface GrnItemRow {
  id: number;
  itemName: string;
  serialNo: string;
  model: string;
  brand: string;
  warranty: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  maxDiscountPercentage: number;
  minSellingPrice: number;
}

interface InventorySuggestionItem {
  id: number;
  name: string;
  code?: string | null;
  unit_price?: number | null;
  purchase_price?: number | null;
  sell_price?: number | null;
  additional_info?: Record<string, unknown> | string | null;
}

interface SplitPaymentRow {
  id: number;
  type: PaymentTypeOption;
  reference: string;
  amount: string;
}

const createEmptyRow = (id: number): GrnItemRow => ({
  id,
  itemName: '',
  serialNo: '',
  model: '',
  brand: '',
  warranty: '',
  quantity: 1,
  buyPrice: 0,
  sellPrice: 0,
  maxDiscountPercentage: 0,
  minSellingPrice: 0,
});

const createSplitPaymentRow = (id: number): SplitPaymentRow => ({
  id,
  type: 'cash',
  reference: '',
  amount: '0',
});

const lineBuyTotal = (row: GrnItemRow): number => {
  const qty = Math.max(Number(row.quantity) || 0, 0);
  const unit = Math.max(Number(row.buyPrice) || 0, 0);
  return qty * unit;
};

type PaymentTiming = 'post_payment' | 'on_time';
type PaymentTypeOption = 'cash' | 'bank_transfer' | 'bank_deposit' | 'cheque' | 'card';

const PAYMENT_TYPE_OPTIONS: Array<{ value: PaymentTypeOption; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'bank_deposit', label: 'Bank Deposit' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
];

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-all duration-200 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 focus:outline-none';
const tableFieldClass =
  'w-full min-w-[88px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-all duration-200 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500';

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseInvoiceFromNotes = (notes?: string | null): string => {
  if (!notes) return '—';
  const match = notes.match(/Supplier Invoice:\s*([^|]+)/i);
  return match?.[1]?.trim() || '—';
};

const paymentStatusBadge = (status: string) => {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25';
  if (status === 'partial') return 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/25';
  return 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/25';
};

const paymentTimingBadge = (timing?: string) => {
  if (timing === 'on_time') return 'bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/25';
  return 'bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/25';
};

const buildAutoNumber = (prefix: string) => {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const timePart = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `${prefix}-${datePart}-${timePart}`;
};

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

export default function PurchasingGrnPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [grnNo, setGrnNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<GrnItemRow[]>([createEmptyRow(1)]);
  const [useMainItemTable, setUseMainItemTable] = useState(false);
  const [itemSuggestionsByRow, setItemSuggestionsByRow] = useState<Record<number, InventorySuggestionItem[]>>({});
  const [itemSuggestLoadingByRow, setItemSuggestLoadingByRow] = useState<Record<number, boolean>>({});
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('post_payment');
  const [paymentType, setPaymentType] = useState<PaymentTypeOption>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [useMultiplePayments, setUseMultiplePayments] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([createSplitPaymentRow(1)]);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formMessageType, setFormMessageType] = useState<'success' | 'error' | ''>('');
  const [grnRecords, setGrnRecords] = useState<GrnListRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listPaymentFilter, setListPaymentFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage] = useState(15);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedGrnDetail, setSelectedGrnDetail] = useState<GrnDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const itemSuggestDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

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
      console.error('Error fetching purchasing GRN visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleGrnVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating purchasing GRN widget visibility:', error);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchAccessProfile(storedToken);
    }
  }, []);

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
    if (!token) return;
    const fetchSuppliers = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/stock/suppliers`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 },
        });
        const rowsData = response.data?.success
          ? (response.data?.data?.data || response.data?.data || [])
          : [];
        setSuppliers(rowsData.map((supplier: any) => ({ id: supplier.id, name: supplier.name })));
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        setSuppliers([]);
      }
    };
    fetchSuppliers();
  }, [token]);

  const fetchGrnRecords = async (page = currentPage) => {
    if (!token) return;
    try {
      setListLoading(true);
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };
      const term = listSearch.trim();
      if (term) params.search = term;
      if (listPaymentFilter !== 'all') params.payment_status = listPaymentFilter;

      const response = await axios.get(`${API_URL}/api/purchasing/grn`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      const payload = response.data?.success ? response.data.data : response.data;
      const rows = Array.isArray(payload) ? payload : (payload?.data || []);
      setGrnRecords(rows as GrnListRecord[]);
      setLastPage(Number(payload?.last_page) || 1);
      setTotalRecords(Number(payload?.total) || rows.length);
    } catch (error) {
      console.error('Error fetching GRN records:', error);
      setGrnRecords([]);
      setLastPage(1);
      setTotalRecords(0);
    } finally {
      setListLoading(false);
    }
  };

  const openGrnDetail = async (grnId: number) => {
    if (!token) return;

    setShowDetailModal(true);
    setDetailLoading(true);
    setDetailError('');
    setSelectedGrnDetail(null);

    try {
      const response = await axios.get(`${API_URL}/api/purchasing/grn/${grnId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = response.data?.data ?? response.data;
      setSelectedGrnDetail(payload as GrnDetailRecord);
    } catch (error) {
      console.error('Error fetching GRN detail:', error);
      setDetailError('Failed to load GRN details. Please try again.');
    } finally {
      setDetailLoading(false);
    }
  };

  const searchInitialized = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetchGrnRecords(currentPage);
  }, [token, currentPage, listPaymentFilter]);

  useEffect(() => {
    if (!token) return;
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchGrnRecords(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [listSearch]);

  const selectedSupplierName = useMemo(() => {
    return suppliers.find((supplier) => supplier.id === selectedSupplierId)?.name || '';
  }, [suppliers, selectedSupplierId]);

  const handleOpenCreate = () => {
    setGrnNo(buildAutoNumber('GRN'));
    setInvoiceNo('');
    setSelectedSupplierId('');
    setGrnDate(new Date().toISOString().split('T')[0]);
    setRows([createEmptyRow(1)]);
    setUseMainItemTable(false);
    setItemSuggestionsByRow({});
    setItemSuggestLoadingByRow({});
    setDiscountAmount('0');
    setPaymentTiming('post_payment');
    setPaymentType('cash');
    setPaymentReference('');
    setPaidAmount('0');
    setUseMultiplePayments(false);
    setSplitPayments([createSplitPaymentRow(1)]);
    setFormMessage('');
    setFormMessageType('');
    setShowCreateModal(true);
  };

  const addItemRow = () => {
    setRows((prev) => [...prev, createEmptyRow((prev[prev.length - 1]?.id || 0) + 1)]);
  };

  const removeItemRow = (rowId: number) => {
    const timer = itemSuggestDebounceRef.current[rowId];
    if (timer) {
      clearTimeout(timer);
      delete itemSuggestDebounceRef.current[rowId];
    }
    setItemSuggestionsByRow((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setItemSuggestLoadingByRow((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const updateRow = (rowId: number, patch: Partial<GrnItemRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const next = { ...row, ...patch };
        if (patch.quantity !== undefined) {
          next.quantity = Math.max(Number(next.quantity) || 0, 0);
        }
        const sell = Number(next.sellPrice) || 0;
        const discount = Math.min(Math.max(Number(next.maxDiscountPercentage) || 0, 0), 100);
        next.maxDiscountPercentage = discount;
        next.minSellingPrice = Number((sell - (sell * discount) / 100).toFixed(2));
        return next;
      })
    );
  };

  const addSplitPaymentRow = () => {
    setSplitPayments((prev) => [...prev, createSplitPaymentRow((prev[prev.length - 1]?.id || 0) + 1)]);
  };

  const removeSplitPaymentRow = (rowId: number) => {
    setSplitPayments((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const updateSplitPaymentRow = (rowId: number, patch: Partial<SplitPaymentRow>) => {
    setSplitPayments((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        return { ...row, ...patch };
      })
    );
  };

  const parseAdditionalInfo = (value: InventorySuggestionItem['additional_info']): Record<string, unknown> => {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof value === 'object' ? value : {};
  };

  const fetchInventorySuggestions = async (rowId: number, rawQuery: string) => {
    const query = rawQuery.trim();
    if (!token || !useMainItemTable || query.length < 2) {
      setItemSuggestionsByRow((prev) => ({ ...prev, [rowId]: [] }));
      setItemSuggestLoadingByRow((prev) => ({ ...prev, [rowId]: false }));
      return;
    }

    setItemSuggestLoadingByRow((prev) => ({ ...prev, [rowId]: true }));

    try {
      const response = await axios.get(`${API_URL}/api/stock/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          search: query,
          per_page: 8,
          status: 'active',
        },
      });

      const data = response.data?.success ? response.data?.data : response.data;
      const rowsData = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const suggestions = rowsData.map((item: any) => ({
        id: Number(item.id),
        name: String(item.name || ''),
        code: item.code ?? null,
        unit_price: Number(item.unit_price) || 0,
        purchase_price: Number(item.purchase_price) || 0,
        sell_price: Number(item.sell_price) || 0,
        additional_info: item.additional_info ?? null,
      }));

      setItemSuggestionsByRow((prev) => ({ ...prev, [rowId]: suggestions }));
    } catch (error) {
      console.error('Error fetching inventory suggestions:', error);
      setItemSuggestionsByRow((prev) => ({ ...prev, [rowId]: [] }));
    } finally {
      setItemSuggestLoadingByRow((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const handleItemNameInput = (rowId: number, value: string) => {
    updateRow(rowId, { itemName: value });

    if (!useMainItemTable) return;

    // If user picked an exact suggestion label, apply it immediately.
    tryApplySuggestionFromInput(rowId, value);

    const existingTimer = itemSuggestDebounceRef.current[rowId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    itemSuggestDebounceRef.current[rowId] = setTimeout(() => {
      void fetchInventorySuggestions(rowId, value);
    }, 250);
  };

  const applySuggestionToRow = (rowId: number, item: InventorySuggestionItem) => {
    const info = parseAdditionalInfo(item.additional_info);
    const code = String(item.code || '').trim();
    const buyPrice = Number(item.purchase_price) > 0
      ? Number(item.purchase_price)
      : Number(item.unit_price) || 0;
    const sellPrice = Number(item.sell_price) > 0
      ? Number(item.sell_price)
      : Number(item.unit_price) || 0;

    const rawMaxDisc = Number(info.max_discount_percentage ?? info.maxDiscountPercentage ?? 0) || 0;
    const safeMaxDisc = Math.min(Math.max(rawMaxDisc, 0), 100);

    updateRow(rowId, {
      itemName: item.name || '',
      // In main item table mode, serial field should default to item code.
      serialNo: code || String(info.serial_no ?? info.serialNo ?? ''),
      model: String(info.model ?? ''),
      brand: String(info.brand ?? ''),
      warranty: String(info.warranty ?? ''),
      buyPrice,
      sellPrice,
      maxDiscountPercentage: safeMaxDisc,
    });

    setItemSuggestionsByRow((prev) => ({ ...prev, [rowId]: [] }));
  };

  const getSuggestionLabel = (item: InventorySuggestionItem): string => {
    const code = String(item.code || '').trim();
    return code ? `${item.name} (${code})` : item.name;
  };

  const tryApplySuggestionFromInput = (rowId: number, value: string) => {
    const input = value.trim().toLowerCase();
    if (!input) return;

    const candidates = itemSuggestionsByRow[rowId] || [];
    const matched = candidates.find((item) => {
      const byLabel = getSuggestionLabel(item).trim().toLowerCase() === input;
      const byName = String(item.name || '').trim().toLowerCase() === input;
      return byLabel || byName;
    });

    if (matched) {
      applySuggestionToRow(rowId, matched);
    }
  };

  useEffect(() => {
    return () => {
      Object.values(itemSuggestDebounceRef.current).forEach((timer) => clearTimeout(timer));
      itemSuggestDebounceRef.current = {};
    };
  }, []);

  const totalQuantity = useMemo(() => {
    return rows.reduce((sum, row) => sum + Math.max(Number(row.quantity) || 0, 0), 0);
  }, [rows]);

  const subtotal = useMemo(() => {
    return rows.reduce((sum, row) => sum + lineBuyTotal(row), 0);
  }, [rows]);

  const effectiveDiscount = useMemo(() => {
    const raw = Number(discountAmount || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, subtotal);
  }, [discountAmount, subtotal]);

  const netAmount = useMemo(() => {
    return Math.max(subtotal - effectiveDiscount, 0);
  }, [subtotal, effectiveDiscount]);

  const effectivePaidAmount = useMemo(() => {
    if (paymentTiming === 'post_payment') return 0;

    if (useMultiplePayments) {
      const total = splitPayments.reduce((sum, row) => {
        const amount = Number(row.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return sum;
        return sum + amount;
      }, 0);
      return Math.min(total, netAmount);
    }

    const raw = Number(paidAmount || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, netAmount);
  }, [paidAmount, netAmount, paymentTiming, useMultiplePayments, splitPayments]);

  const outstandingAmount = useMemo(() => {
    return Math.max(netAmount - effectivePaidAmount, 0);
  }, [netAmount, effectivePaidAmount]);

  const listStats = useMemo(() => {
    let unpaid = 0;
    let partial = 0;
    let paid = 0;
    let pageOutstanding = 0;
    for (const grn of grnRecords) {
      if (grn.payment_status === 'unpaid') unpaid += 1;
      else if (grn.payment_status === 'partial') partial += 1;
      else paid += 1;
      pageOutstanding += Math.max(Number(grn.net_amount) - Number(grn.paid_amount), 0);
    }
    return { unpaid, partial, paid, pageOutstanding };
  }, [grnRecords]);

  const extractApiError = (error: unknown, fallback = 'Failed to save GRN. Please try again.'): string => {
    if (!axios.isAxiosError(error)) {
      return fallback;
    }
    const data = error.response?.data as { message?: string; errors?: Record<string, string[] | string> } | undefined;
    if (data?.errors) {
      const messages = Object.entries(data.errors).flatMap(([field, value]) => {
        const parts = Array.isArray(value) ? value : [String(value)];
        return parts.map((msg) => `${field}: ${msg}`);
      });
      if (messages.length > 0) return messages.join(' ');
    }
    return data?.message || fallback;
  };

  const handleSaveGrn = async () => {
    if (!token) {
      setFormMessage('Please login again.');
      setFormMessageType('error');
      return;
    }

    if (!selectedSupplierId) {
      setFormMessage('Please select a supplier.');
      setFormMessageType('error');
      return;
    }

    const validRows = rows.filter((row) => row.itemName.trim());
    if (validRows.length === 0) {
      setFormMessage('Add at least one item with a name.');
      setFormMessageType('error');
      return;
    }

    for (const row of validRows) {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) {
        setFormMessage(`Quantity must be greater than zero for "${row.itemName.trim()}".`);
        setFormMessageType('error');
        return;
      }
      if ((Number(row.buyPrice) || 0) <= 0) {
        setFormMessage(`Buy price must be greater than zero for "${row.itemName.trim()}".`);
        setFormMessageType('error');
        return;
      }
    }

    const timing: PaymentTiming = paymentTiming;
    let paid = 0;
    let paymentTypeValue: string | null = null;
    let paymentReferenceValue: string | null = null;
    let paymentBreakdownValue: Array<{ payment_type: string; payment_reference?: string; paid_amount: number }> = [];

    if (timing === 'on_time') {
      paid = effectivePaidAmount;
      if (netAmount > 0 && paid <= 0) {
        setFormMessage('Enter paid amount for pay-now GRN.');
        setFormMessageType('error');
        return;
      }

      if (useMultiplePayments) {
        const positiveRows = splitPayments.filter((row) => (Number(row.amount || 0) || 0) > 0);
        if (positiveRows.length === 0) {
          setFormMessage('Add at least one payment split with amount greater than zero.');
          setFormMessageType('error');
          return;
        }

        paymentBreakdownValue = positiveRows.map((row) => ({
          payment_type: row.type,
          payment_reference: row.reference.trim() || undefined,
          paid_amount: Number(row.amount || 0) || 0,
        }));

        paymentTypeValue = 'multiple';
        paymentReferenceValue = grnNo || 'PAY-NOW';
      } else {
        paymentTypeValue = paymentType;
        paymentReferenceValue = paymentReference.trim() || grnNo || 'PAY-NOW';
      }
    }

    try {
      setSaving(true);
      setFormMessage('');
      setFormMessageType('');

      const poItems = validRows.map((row) => ({
        item_name: row.itemName.trim(),
        item_code: row.serialNo.trim() || undefined,
        item_unit: 'pieces',
        item_type: 'finished_good',
        quantity: Math.max(Number(row.quantity) || 0, 0.01),
        unit_price: Number(row.buyPrice) || 0,
        sell_price: Number(row.sellPrice) || 0,
        serial_no: row.serialNo.trim() || undefined,
        model: row.model.trim() || undefined,
        brand: row.brand.trim() || undefined,
        warranty: row.warranty.trim() || undefined,
        max_discount_percentage: row.maxDiscountPercentage,
        min_selling_price: row.minSellingPrice,
      }));

      const poResponse = await axios.post(
        `${API_URL}/api/purchasing/purchase-orders`,
        {
          supplier_id: selectedSupplierId,
          order_date: grnDate,
          expected_delivery_date: grnDate,
          notes: `Direct GRN backing PO | GRN: ${grnNo}${invoiceNo.trim() ? ` | Invoice: ${invoiceNo.trim()}` : ''}`,
          items: poItems,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const purchaseOrder = poResponse.data?.data ?? poResponse.data;
      const purchaseOrderId = Number(purchaseOrder?.id);
      if (!purchaseOrderId) {
        throw new Error('Could not read purchase order ID from server response.');
      }

      let poLineItems: Array<{ id: number }> = Array.isArray(purchaseOrder?.items) ? purchaseOrder.items : [];
      if (poLineItems.length === 0) {
        const poDetailResponse = await axios.get(`${API_URL}/api/purchasing/purchase-orders/${purchaseOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const poDetail = poDetailResponse.data?.data ?? poDetailResponse.data;
        poLineItems = Array.isArray(poDetail?.items) ? poDetail.items : [];
      }

      if (poLineItems.length !== validRows.length) {
        throw new Error('Purchase order line mismatch. Please retry saving GRN.');
      }

      const grnItems = poLineItems.map((poItem, index) => {
        const row = validRows[index];
        const qty = Number((Math.max(Number(row.quantity) || 0, 0.01)).toFixed(2));
        const remarks = [
          `Qty: ${qty}`,
          row.model.trim() ? `Model: ${row.model.trim()}` : '',
          row.brand.trim() ? `Brand: ${row.brand.trim()}` : '',
          row.serialNo.trim() ? `Serial: ${row.serialNo.trim()}` : '',
          row.warranty.trim() ? `Warranty: ${row.warranty.trim()}` : '',
          `Max discount: ${row.maxDiscountPercentage}%`,
          `Min selling price: ${row.minSellingPrice}`,
        ]
          .filter(Boolean)
          .join(' | ');

        return {
          purchase_order_item_id: poItem.id,
          received_quantity: qty,
          accepted_quantity: qty,
          rejected_quantity: 0,
          purchase_price: Number(row.buyPrice) || 0,
          sell_price: Number(row.sellPrice) || 0,
          remarks,
          quality_status: 'accepted',
        };
      });

      const grnPayload: Record<string, unknown> = {
        purchase_order_id: purchaseOrderId,
        received_date: grnDate,
        notes: [
          `GRN Ref: ${grnNo}`,
          invoiceNo.trim() ? `Supplier Invoice: ${invoiceNo.trim()}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        discount_amount: Number(effectiveDiscount.toFixed(2)),
        payment_timing: timing,
        paid_amount: Number(paid.toFixed(2)),
        items: grnItems,
      };

      if (timing === 'on_time') {
        grnPayload.payment_type = paymentTypeValue || 'cash';
        grnPayload.payment_reference = paymentReferenceValue;
        if (paymentBreakdownValue.length > 0) {
          grnPayload.payment_breakdown = paymentBreakdownValue;
        }
      }

      await axios.post(`${API_URL}/api/purchasing/grn`, grnPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const successText =
        outstandingAmount > 0
          ? `GRN saved. Outstanding supplier balance: LKR ${outstandingAmount.toFixed(2)}`
          : 'GRN saved successfully with full payment.';

      setFormMessage(successText);
      setFormMessageType('success');
      setShowCreateModal(false);
      setCurrentPage(1);
      await fetchGrnRecords(1);
    } catch (error) {
      console.error('Error saving GRN:', error);
      if (axios.isAxiosError(error)) {
        console.error('GRN save response:', error.response?.data);
      }
      setFormMessage(extractApiError(error));
      setFormMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const filterPills: Array<{ value: typeof listPaymentFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
  ];

  const visibleLedgerColumns = Math.max(
    [
      'purchasing-grn-col-grn-no',
      'purchasing-grn-col-date',
      'purchasing-grn-col-supplier',
      'purchasing-grn-col-invoice',
      'purchasing-grn-col-items',
      'purchasing-grn-col-net',
      'purchasing-grn-col-paid',
      'purchasing-grn-col-balance',
      'purchasing-grn-col-status',
    ].filter((key) => isColumnVisible(key)).length,
    1
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Hero */}
      {isElementVisible('purchasing-grn-el-hero') && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-cyan-950 to-teal-900 px-6 py-8 shadow-2xl shadow-cyan-900/20 sm:px-10 sm:py-10">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-hero', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/10 text-sm font-bold text-white hover:bg-white/20"
            title="Hide hero"
            aria-label="Hide hero"
          >
            x
          </button>
        )}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-cyan-100 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              Purchasing · Direct GRN
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Goods Received Notes
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cyan-100/90 sm:text-base">
              Receive stock directly from suppliers, set pricing, and manage pay-now or credit settlements in one flow.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {isElementVisible('purchasing-grn-el-hero-link-hub') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-hero-link-hub', true); }}
                      className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold text-white hover:bg-white/25"
                      title="Hide purchasing hub link"
                      aria-label="Hide purchasing hub link"
                    >
                      x
                    </button>
                  )}
                  <Link
                    href="/dashboard/purchasing"
                    className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    ← Purchasing Hub
                  </Link>
                </div>
              )}
              {isElementVisible('purchasing-grn-el-hero-link-payments') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-hero-link-payments', true); }}
                      className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold text-white hover:bg-white/25"
                      title="Hide payments link"
                      aria-label="Hide payments link"
                    >
                      x
                    </button>
                  )}
                  <Link
                    href="/dashboard/accounts/grn-payments"
                    className="inline-flex items-center rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/30"
                  >
                    GRN Payments →
                  </Link>
                </div>
              )}
            </div>
          </div>
          {isElementVisible('purchasing-grn-el-btn-create') && (
            <div className="relative">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-btn-create', true); }}
                  className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-white/15 text-xs font-bold text-white hover:bg-white/25"
                  title="Hide create button"
                  aria-label="Hide create button"
                >
                  x
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenCreate}
                className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 to-teal-400 px-8 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:scale-[1.02] hover:shadow-cyan-400/40 active:scale-[0.98]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/15 text-lg">+</span>
                Create New GRN
              </button>
            </div>
          )}
        </div>
      </section>
      )}

      {formMessage && formMessageType === 'success' && isElementVisible('purchasing-grn-el-success-message') && (
        <div className="relative flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-success-message', true); }}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-white text-sm font-bold text-emerald-700 hover:bg-emerald-50"
              title="Hide success message"
              aria-label="Hide success message"
            >
              x
            </button>
          )}
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-sm">✓</span>
          <p className="text-sm font-medium text-emerald-900">{formMessage}</p>
        </div>
      )}

      {/* Stats */}
      {isElementVisible('purchasing-grn-sec-stats') && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            key: 'purchasing-grn-el-stat-total-grns',
            label: 'Total GRNs',
            value: String(totalRecords),
            hint: 'All time records',
            icon: '📋',
            accent: 'from-cyan-500 to-blue-600',
          },
          {
            key: 'purchasing-grn-el-stat-unpaid',
            label: 'Unpaid (page)',
            value: String(listStats.unpaid),
            hint: 'On current page',
            icon: '⏳',
            accent: 'from-rose-500 to-orange-500',
          },
          {
            key: 'purchasing-grn-el-stat-outstanding',
            label: 'Outstanding (page)',
            value: `LKR ${money(listStats.pageOutstanding)}`,
            hint: 'Balance on this page',
            icon: '💳',
            accent: 'from-violet-500 to-purple-600',
          },
          {
            key: 'purchasing-grn-el-stat-suppliers',
            label: 'Suppliers',
            value: String(suppliers.length),
            hint: 'Available to select',
            icon: '🚚',
            accent: 'from-teal-500 to-emerald-600',
          },
        ]
          .filter((card) => isElementVisible(card.key))
          .map((card) => (
          <div
            key={card.key}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleGrnVisibilityToggle(card.key, true); }}
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                title={`Hide ${card.label}`}
                aria-label={`Hide ${card.label}`}
              >
                x
              </button>
            )}
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl shadow-inner">
                {card.icon}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Records */}
      {isElementVisible('purchasing-grn-sec-ledger') && (
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-sec-ledger', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide GRN ledger"
            aria-label="Hide GRN ledger"
          >
            x
          </button>
        )}
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">GRN Ledger</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords} record{totalRecords === 1 ? '' : 's'} · Page {currentPage} of {lastPage}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isElementVisible('purchasing-grn-el-search') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-search', true); }}
                      className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                      title="Hide search"
                      aria-label="Hide search"
                    >
                      x
                    </button>
                  )}
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                  <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search GRN, supplier, PO..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 focus:outline-none sm:w-72"
                  />
                </div>
              )}
              {isElementVisible('purchasing-grn-el-filter-pills') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-el-filter-pills', true); }}
                      className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                      title="Hide payment filters"
                      aria-label="Hide payment filters"
                    >
                      x
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                    {filterPills.map((pill) => (
                      <button
                        key={pill.value}
                        type="button"
                        onClick={() => {
                          setListPaymentFilter(pill.value);
                          setCurrentPage(1);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                          listPaymentFilter === pill.value
                            ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isColumnVisible('purchasing-grn-col-grn-no') && (
                  <th className="px-5 py-3.5 relative">
                    GRN No
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-grn-no', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide GRN no column"
                        aria-label="Hide GRN no column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-date') && (
                  <th className="px-5 py-3.5 relative">
                    Date
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-date', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide date column"
                        aria-label="Hide date column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-supplier') && (
                  <th className="px-5 py-3.5 relative">
                    Supplier
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-supplier', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide supplier column"
                        aria-label="Hide supplier column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-invoice') && (
                  <th className="px-5 py-3.5 relative">
                    Invoice
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-invoice', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide invoice column"
                        aria-label="Hide invoice column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-items') && (
                  <th className="px-5 py-3.5 text-right relative">
                    Items
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-items', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide items column"
                        aria-label="Hide items column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-net') && (
                  <th className="px-5 py-3.5 text-right relative">
                    Net (LKR)
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-net', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide net column"
                        aria-label="Hide net column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-paid') && (
                  <th className="px-5 py-3.5 text-right relative">
                    Paid
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-paid', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide paid column"
                        aria-label="Hide paid column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-balance') && (
                  <th className="px-5 py-3.5 text-right relative">
                    Balance
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-balance', true); }}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                        title="Hide balance column"
                        aria-label="Hide balance column"
                      >
                        x
                      </button>
                    )}
                  </th>
                )}
                {isColumnVisible('purchasing-grn-col-status') && (
                  <th className="px-5 py-3.5 relative">
                    Status
                    {showWidgetCloseButtons && (
                      <button
                        type="button"
                        onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-col-status', true); }}
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
            <tbody className="divide-y divide-slate-100">
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={visibleLedgerColumns} className="px-5 py-4">
                      <div className="h-4 rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : grnRecords.length === 0 ? (
                <tr>
                  <td colSpan={visibleLedgerColumns} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-100 text-3xl">
                        📥
                      </div>
                      <p className="font-semibold text-slate-800">No GRN records yet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Start by creating your first goods received note.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-cyan-500 hover:to-teal-500"
                      >
                        Create GRN
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                grnRecords.map((grn, index) => {
                  const net = Number(grn.net_amount) || 0;
                  const paid = Number(grn.paid_amount) || 0;
                  const balance = Math.max(net - paid, 0);
                  const itemCount = grn.grn_items?.length ?? 0;
                  const receivedDate = grn.received_date
                    ? new Date(grn.received_date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const supplierName = grn.purchase_order?.supplier?.name || '—';
                  const initial = supplierName !== '—' ? supplierName.charAt(0).toUpperCase() : '?';
                  const timing = grn.payment_timing || 'post_payment';

                  return (
                    <tr
                      key={grn.id}
                      onClick={() => {
                        void openGrnDetail(grn.id);
                      }}
                      className={`cursor-pointer transition-colors hover:bg-cyan-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      {isColumnVisible('purchasing-grn-col-grn-no') && (
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-bold text-cyan-700">{grn.grn_number}</span>
                        </td>
                      )}
                      {isColumnVisible('purchasing-grn-col-date') && <td className="px-5 py-4 text-sm text-slate-600">{receivedDate}</td>}
                      {isColumnVisible('purchasing-grn-col-supplier') && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-xs font-bold text-white">
                              {initial}
                            </span>
                            <span className="text-sm font-medium text-slate-800">{supplierName}</span>
                          </div>
                        </td>
                      )}
                      {isColumnVisible('purchasing-grn-col-invoice') && <td className="px-5 py-4 text-sm text-slate-500">{parseInvoiceFromNotes(grn.notes)}</td>}
                      {isColumnVisible('purchasing-grn-col-items') && (
                        <td className="px-5 py-4 text-right">
                          <span className="inline-flex min-w-[2rem] justify-center rounded-lg bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">
                            {itemCount}
                          </span>
                        </td>
                      )}
                      {isColumnVisible('purchasing-grn-col-net') && <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">{money(net)}</td>}
                      {isColumnVisible('purchasing-grn-col-paid') && <td className="px-5 py-4 text-right text-sm text-slate-600">{money(paid)}</td>}
                      {isColumnVisible('purchasing-grn-col-balance') && (
                        <td className="px-5 py-4 text-right">
                          {balance > 0 ? (
                            <span className="text-sm font-bold text-rose-600">{money(balance)}</span>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {isColumnVisible('purchasing-grn-col-status') && (
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1.5">
                            <span
                              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${paymentStatusBadge(grn.payment_status)}`}
                            >
                              {grn.payment_status}
                            </span>
                            <span
                              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${paymentTimingBadge(timing)}`}
                            >
                              {timing === 'on_time' ? 'Pay now' : 'Credit'}
                            </span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {isElementVisible('purchasing-grn-sec-pagination') && (
          <div className="relative flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleGrnVisibilityToggle('purchasing-grn-sec-pagination', true); }}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
              title="Hide pagination"
              aria-label="Hide pagination"
            >
              x
            </button>
          )}
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{grnRecords.length}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalRecords}</span> records
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-semibold text-slate-700">
              {currentPage} / {lastPage}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(lastPage, prev + 1))}
              disabled={currentPage >= lastPage || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
        )}
      </section>
      )}

      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-cyan-900/30 xl:max-w-[1400px] [&_p]:!text-black [&_h3]:!text-black [&_h4]:!text-black [&_th]:!text-black [&_td]:!text-black [&_span]:!text-black [&_button]:!text-black">
            <div className="relative shrink-0 overflow-hidden border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white px-6 py-5 sm:px-8">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest">GRN Details</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">
                    {selectedGrnDetail?.grn_number || 'Loading...'}
                  </h3>
                  <p className="mt-1 text-sm">Full goods received note information</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-lg transition hover:bg-slate-50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-7 space-y-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
                </div>
              ) : detailError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
                  {detailError}
                </div>
              ) : selectedGrnDetail ? (
                <>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">GRN</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{selectedGrnDetail.grn_number}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Date: {selectedGrnDetail.received_date ? new Date(selectedGrnDetail.received_date).toLocaleDateString() : '—'}
                      </p>
                      <p className="text-sm text-slate-600">
                        PO: {selectedGrnDetail.purchase_order?.order_number || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Supplier</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{selectedGrnDetail.purchase_order?.supplier?.name || '—'}</p>
                      <p className="mt-2 text-sm text-slate-600">Invoice: {parseInvoiceFromNotes(selectedGrnDetail.notes)}</p>
                      <p className="text-sm text-slate-600">Payment Timing: {selectedGrnDetail.payment_timing || '—'}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</p>
                      <p className="mt-1 text-sm text-slate-700">Type: {selectedGrnDetail.payment_type || '—'}</p>
                      <p className="text-sm text-slate-700">Paid: LKR {money(Number(selectedGrnDetail.paid_amount) || 0)}</p>
                      <p className="text-sm text-slate-700">
                        Outstanding: LKR {money(Math.max((Number(selectedGrnDetail.net_amount) || 0) - (Number(selectedGrnDetail.paid_amount) || 0), 0))}
                      </p>
                      {selectedGrnDetail.paid_at && (
                        <p className="text-sm text-slate-600">Paid At: {new Date(selectedGrnDetail.paid_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>

                  {Array.isArray(selectedGrnDetail.payment_breakdown) && selectedGrnDetail.payment_breakdown.length > 0 && (
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Payment Breakdown</p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-cyan-200 text-left text-xs uppercase tracking-wider text-cyan-700">
                              <th className="px-2 py-2">Type</th>
                              <th className="px-2 py-2">Reference</th>
                              <th className="px-2 py-2 text-right">Amount</th>
                              <th className="px-2 py-2">Paid At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedGrnDetail.payment_breakdown.map((entry, idx) => (
                              <tr key={`${entry.payment_type || 'type'}-${idx}`} className="border-b border-cyan-100/80">
                                <td className="px-2 py-2 capitalize">{String(entry.payment_type || '').replace('_', ' ') || '—'}</td>
                                <td className="px-2 py-2">{entry.payment_reference || '—'}</td>
                                <td className="px-2 py-2 text-right font-semibold">{money(Number(entry.paid_amount) || 0)}</td>
                                <td className="px-2 py-2">{entry.paid_at ? new Date(entry.paid_at).toLocaleString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-100 px-4 py-3">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">Line Items</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2.5">Item</th>
                            <th className="px-3 py-2.5">Code</th>
                            <th className="px-3 py-2.5 text-right">Received</th>
                            <th className="px-3 py-2.5 text-right">Accepted</th>
                            <th className="px-3 py-2.5 text-right">Rejected</th>
                            <th className="px-3 py-2.5 text-right">Buy Price</th>
                            <th className="px-3 py-2.5 text-right">Sell Price</th>
                            <th className="px-3 py-2.5">Quality</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(selectedGrnDetail.grn_items || []).map((item) => {
                            const poItem = item.purchase_order_item;
                            const inv = poItem?.inventory_item;
                            const itemName = poItem?.item_name || inv?.name || '—';
                            const itemCode = poItem?.item_code || inv?.code || '—';

                            return (
                              <tr key={item.id} className="bg-white">
                                <td className="px-3 py-2.5 font-medium text-slate-800">{itemName}</td>
                                <td className="px-3 py-2.5 text-slate-600">{itemCode}</td>
                                <td className="px-3 py-2.5 text-right">{Number(item.received_quantity || 0).toFixed(2)}</td>
                                <td className="px-3 py-2.5 text-right">{Number(item.accepted_quantity || 0).toFixed(2)}</td>
                                <td className="px-3 py-2.5 text-right">{Number(item.rejected_quantity || 0).toFixed(2)}</td>
                                <td className="px-3 py-2.5 text-right">{money(Number(item.purchase_price) || 0)}</td>
                                <td className="px-3 py-2.5 text-right">{money(Number(item.sell_price) || 0)}</td>
                                <td className="px-3 py-2.5 capitalize">{item.quality_status || 'pending'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: 'Total Amount',
                        value: `LKR ${money(Number(selectedGrnDetail.total_amount) || 0)}`,
                        tone: 'slate',
                      },
                      {
                        label: 'Discount',
                        value: `LKR ${money(Number(selectedGrnDetail.discount_amount) || 0)}`,
                        tone: 'slate',
                      },
                      {
                        label: 'Net Amount',
                        value: `LKR ${money(Number(selectedGrnDetail.net_amount) || 0)}`,
                        tone: 'cyan',
                      },
                      {
                        label: 'Paid Amount',
                        value: `LKR ${money(Number(selectedGrnDetail.paid_amount) || 0)}`,
                        tone: 'emerald',
                      },
                    ].map((tile) => (
                      <div
                        key={tile.label}
                        className={`rounded-xl border px-3 py-3 ${
                          tile.tone === 'cyan'
                            ? 'border-cyan-200 bg-cyan-50'
                            : tile.tone === 'emerald'
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tile.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{tile.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-cyan-900/30 xl:max-w-[1600px]">
            <div className="relative shrink-0 overflow-hidden border-b border-cyan-100/80 bg-gradient-to-r from-slate-900 via-cyan-950 to-teal-900 px-6 py-5 sm:px-8">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/80">New receipt</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">Create GRN</h3>
                  <p className="mt-1 text-sm text-cyan-100/80">Header, line items, and payment in one form</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white backdrop-blur-sm transition hover:bg-white/20"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-7 space-y-7">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-100 text-xs text-cyan-700">1</span>
                  Document & Supplier
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={labelClass}>GRN No</label>
                    <input
                      value={grnNo}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Invoice No</label>
                    <input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Supplier invoice #"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Supplier</label>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : '')}
                      className={fieldClass}
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>GRN Date</label>
                    <input type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} className={fieldClass} />
                  </div>
                </div>

                {selectedSupplierName && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-cyan-200/80 bg-gradient-to-r from-cyan-50 to-teal-50 px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-sm font-bold text-white">
                      {selectedSupplierName.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-sm text-cyan-900">
                      Receiving from <span className="font-bold">{selectedSupplierName}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-5 py-3.5">
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 text-xs">2</span>
                    Line Items
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-cyan-200/80 bg-cyan-50/90 px-3 py-2 text-xs font-semibold text-cyan-800">
                      <input
                        type="checkbox"
                        checked={useMainItemTable}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseMainItemTable(checked);
                          setItemSuggestionsByRow({});
                          setItemSuggestLoadingByRow({});
                        }}
                        className="h-3.5 w-3.5 rounded border-cyan-300 text-cyan-600"
                      />
                      Load Item From Main Item Table
                    </label>
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-4 py-2 text-xs font-bold text-slate-900 shadow-md transition hover:brightness-105"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2.5">Item Name</th>
                        <th className="px-3 py-2.5">Serial No</th>
                        <th className="px-3 py-2.5">Model</th>
                        <th className="px-3 py-2.5">Brand</th>
                        <th className="px-3 py-2.5">Warranty</th>
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Buy Price</th>
                        <th className="px-3 py-2.5">Line Total</th>
                        <th className="px-3 py-2.5">Sell Price</th>
                        <th className="px-3 py-2.5">Max Disc %</th>
                        <th className="px-3 py-2.5">Min Sell</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, rowIndex) => (
                        <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="px-3 py-2">
                            <div className="relative">
                              <input
                                value={row.itemName}
                                onChange={(e) => handleItemNameInput(row.id, e.target.value)}
                                onBlur={(e) => {
                                  if (!useMainItemTable) return;
                                  tryApplySuggestionFromInput(row.id, e.target.value);
                                }}
                                className={tableFieldClass}
                                placeholder={useMainItemTable ? 'Type at least 2 letters for suggestions' : 'Item name'}
                                autoComplete="off"
                                list={useMainItemTable ? `grn-item-suggestions-${row.id}` : undefined}
                              />

                              {useMainItemTable && (
                                <datalist id={`grn-item-suggestions-${row.id}`}>
                                  {(itemSuggestionsByRow[row.id] || []).map((suggestion) => (
                                    <option key={suggestion.id} value={getSuggestionLabel(suggestion)} />
                                  ))}
                                </datalist>
                              )}

                              {useMainItemTable && itemSuggestLoadingByRow[row.id] && (
                                <p className="mt-1 text-[11px] font-medium text-cyan-700">Loading suggestions...</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.serialNo}
                              onChange={(e) => updateRow(row.id, { serialNo: e.target.value })}
                              className={tableFieldClass}
                              placeholder="Serial"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.model}
                              onChange={(e) => updateRow(row.id, { model: e.target.value })}
                              className={tableFieldClass}
                              placeholder="Model"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.brand}
                              onChange={(e) => updateRow(row.id, { brand: e.target.value })}
                              className={tableFieldClass}
                              placeholder="Brand"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.warranty}
                              onChange={(e) => updateRow(row.id, { warranty: e.target.value })}
                              className={tableFieldClass}
                              placeholder="Warranty"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                              className={tableFieldClass}
                              placeholder="Qty"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.buyPrice}
                              onChange={(e) => updateRow(row.id, { buyPrice: Number(e.target.value) || 0 })}
                              className={tableFieldClass}
                              placeholder="Unit buy"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={lineBuyTotal(row)}
                              readOnly
                              className="w-full min-w-[88px] rounded-lg border border-slate-200 bg-cyan-50/80 px-2.5 py-2 text-sm font-bold text-cyan-900"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.sellPrice}
                              onChange={(e) => updateRow(row.id, { sellPrice: Number(e.target.value) || 0 })}
                              className={tableFieldClass}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={row.maxDiscountPercentage}
                              onChange={(e) => updateRow(row.id, { maxDiscountPercentage: Number(e.target.value) || 0 })}
                              className={tableFieldClass}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={row.minSellingPrice}
                              readOnly
                              className="w-full min-w-[88px] rounded-lg border border-slate-200 bg-emerald-50/80 px-2.5 py-2 text-sm font-semibold text-emerald-800"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeItemRow(row.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              title="Remove row"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-5">
                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-xs text-violet-700">3</span>
                  Payment & Totals
                </h4>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div>
                    <label className={labelClass}>Bill Discount (LKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className={labelClass}>Payment Mode</label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentTiming('on_time');
                          setUseMultiplePayments(false);
                          setSplitPayments([createSplitPaymentRow(1)]);
                          setPaidAmount(netAmount > 0 ? netAmount.toFixed(2) : '0');
                        }}
                        className={`rounded-2xl border-2 p-4 text-left transition ${
                          paymentTiming === 'on_time'
                            ? 'border-cyan-400 bg-cyan-50 shadow-md ring-2 ring-cyan-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="text-lg">💵</span>
                        <p className="mt-2 font-bold text-slate-900">Pay Now</p>
                        <p className="text-xs text-slate-500">Settle immediately on receipt</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentTiming('post_payment');
                          setPaidAmount('0');
                        }}
                        className={`rounded-2xl border-2 p-4 text-left transition ${
                          paymentTiming === 'post_payment'
                            ? 'border-violet-400 bg-violet-50 shadow-md ring-2 ring-violet-200'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="text-lg">📒</span>
                        <p className="mt-2 font-bold text-slate-900">Credit</p>
                        <p className="text-xs text-slate-500">Add to supplier outstanding</p>
                      </button>
                    </div>
                  </div>
                </div>

                {paymentTiming === 'on_time' && (
                  <div className="space-y-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-cyan-800">
                      <input
                        type="checkbox"
                        checked={useMultiplePayments}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseMultiplePayments(checked);
                          if (checked) {
                            setSplitPayments([createSplitPaymentRow(1)]);
                            setPaidAmount('0');
                          } else {
                            setPaymentType('cash');
                            setPaymentReference('');
                            setPaidAmount(netAmount > 0 ? netAmount.toFixed(2) : '0');
                          }
                        }}
                        className="h-4 w-4 rounded border-cyan-300 text-cyan-600"
                      />
                      Use Multiple Payment Methods (Cash + Cheque / Bank Transfer)
                    </label>

                    {useMultiplePayments ? (
                      <div className="space-y-3">
                        {splitPayments.map((split) => (
                          <div key={split.id} className="grid grid-cols-1 gap-3 rounded-xl border border-cyan-200 bg-white p-3 md:grid-cols-[1fr_1.2fr_1fr_auto]">
                            <div>
                              <label className={labelClass}>Type</label>
                              <select
                                value={split.type}
                                onChange={(e) => updateSplitPaymentRow(split.id, { type: e.target.value as PaymentTypeOption })}
                                className={fieldClass}
                              >
                                {PAYMENT_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Reference</label>
                              <input
                                value={split.reference}
                                onChange={(e) => updateSplitPaymentRow(split.id, { reference: e.target.value })}
                                placeholder="Receipt / cheque / transfer ref"
                                className={fieldClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Amount (LKR)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={split.amount}
                                onChange={(e) => updateSplitPaymentRow(split.id, { amount: e.target.value })}
                                className={fieldClass}
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => removeSplitPaymentRow(split.id)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                title="Remove payment split"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={addSplitPaymentRow}
                            className="rounded-lg border border-cyan-300 bg-cyan-100 px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-200"
                          >
                            + Add Payment Split
                          </button>
                          <p className="text-xs font-semibold text-cyan-800">
                            Split total: LKR {money(effectivePaidAmount)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <label className={labelClass}>Payment Type</label>
                          <select
                            value={paymentType}
                            onChange={(e) => setPaymentType(e.target.value as PaymentTypeOption)}
                            className={fieldClass}
                          >
                            {PAYMENT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Payment Reference</label>
                          <input
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="Receipt / cheque / transfer ref"
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Paid Amount (LKR)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paidAmount}
                            onChange={(e) => setPaidAmount(e.target.value)}
                            className={fieldClass}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Total Qty', value: totalQuantity.toFixed(2), tone: 'slate' },
                    { label: 'Subtotal', value: `LKR ${money(subtotal)}`, tone: 'slate' },
                    { label: 'Net Amount', value: `LKR ${money(netAmount)}`, tone: 'cyan' },
                    { label: 'Outstanding', value: `LKR ${money(outstandingAmount)}`, tone: 'rose' },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      className={`rounded-xl border px-3 py-3 ${
                        tile.tone === 'cyan'
                          ? 'border-cyan-200 bg-cyan-50'
                          : tile.tone === 'rose'
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tile.label}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{tile.value}</p>
                    </div>
                  ))}
                </div>
                {paymentTiming === 'post_payment' && outstandingAmount > 0 && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                    This GRN will post <span className="font-bold">LKR {money(outstandingAmount)}</span> to supplier credit.
                  </p>
                )}
              </div>

              {formMessage && formMessageType === 'error' && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <span className="font-bold">!</span>
                  {formMessage}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="text-xs text-slate-500">
                Discount applied: LKR {money(effectiveDiscount)} · Paid: LKR {money(effectivePaidAmount)}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGrn}
                  disabled={saving}
                  className="inline-flex min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60"
                >
                  {saving ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Saving...
                    </span>
                  ) : (
                    'Save GRN'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
