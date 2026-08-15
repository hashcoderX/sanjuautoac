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

export default function PurchasingGrnPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [grnNo, setGrnNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('');
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<GrnItemRow[]>([createEmptyRow(1)]);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('post_payment');
  const [paymentType, setPaymentType] = useState<PaymentTypeOption>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
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

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) setToken(storedToken);
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
    setDiscountAmount('0');
    setPaymentTiming('post_payment');
    setPaymentType('cash');
    setPaymentReference('');
    setPaidAmount('0');
    setFormMessage('');
    setFormMessageType('');
    setShowCreateModal(true);
  };

  const addItemRow = () => {
    setRows((prev) => [...prev, createEmptyRow((prev[prev.length - 1]?.id || 0) + 1)]);
  };

  const removeItemRow = (rowId: number) => {
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
    const raw = Number(paidAmount || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, netAmount);
  }, [paidAmount, netAmount, paymentTiming]);

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
    let paymentTypeValue: PaymentTypeOption | null = null;
    let paymentReferenceValue: string | null = null;

    if (timing === 'on_time') {
      paid = effectivePaidAmount;
      if (netAmount > 0 && paid <= 0) {
        setFormMessage('Enter paid amount for pay-now GRN.');
        setFormMessageType('error');
        return;
      }
      paymentTypeValue = paymentType;
      paymentReferenceValue = paymentReference.trim() || grnNo || 'PAY-NOW';
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

  return (
    <div className="space-y-8 pb-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-cyan-950 to-teal-900 px-6 py-8 shadow-2xl shadow-cyan-900/20 sm:px-10 sm:py-10">
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
              <Link
                href="/dashboard/purchasing"
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                ← Purchasing Hub
              </Link>
              <Link
                href="/dashboard/accounts/grn-payments"
                className="inline-flex items-center rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/30"
              >
                GRN Payments →
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-400 to-teal-400 px-8 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:scale-[1.02] hover:shadow-cyan-400/40 active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/15 text-lg">+</span>
            Create New GRN
          </button>
        </div>
      </section>

      {formMessage && formMessageType === 'success' && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-sm">✓</span>
          <p className="text-sm font-medium text-emerald-900">{formMessage}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Total GRNs',
            value: String(totalRecords),
            hint: 'All time records',
            icon: '📋',
            accent: 'from-cyan-500 to-blue-600',
          },
          {
            label: 'Unpaid (page)',
            value: String(listStats.unpaid),
            hint: 'On current page',
            icon: '⏳',
            accent: 'from-rose-500 to-orange-500',
          },
          {
            label: 'Outstanding (page)',
            value: `LKR ${money(listStats.pageOutstanding)}`,
            hint: 'Balance on this page',
            icon: '💳',
            accent: 'from-violet-500 to-purple-600',
          },
          {
            label: 'Suppliers',
            value: String(suppliers.length),
            hint: 'Available to select',
            icon: '🚚',
            accent: 'from-teal-500 to-emerald-600',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
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

      {/* Records */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">GRN Ledger</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords} record{totalRecords === 1 ? '' : 's'} · Page {currentPage} of {lastPage}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search GRN, supplier, PO..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 focus:outline-none sm:w-72"
                />
              </div>
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
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                <th className="px-5 py-3.5">GRN No</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Supplier</th>
                <th className="px-5 py-3.5">Invoice</th>
                <th className="px-5 py-3.5 text-right">Items</th>
                <th className="px-5 py-3.5 text-right">Net (LKR)</th>
                <th className="px-5 py-3.5 text-right">Paid</th>
                <th className="px-5 py-3.5 text-right">Balance</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-5 py-4">
                      <div className="h-4 rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : grnRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
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
                      className={`transition-colors hover:bg-cyan-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-bold text-cyan-700">{grn.grn_number}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{receivedDate}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-xs font-bold text-white">
                            {initial}
                          </span>
                          <span className="text-sm font-medium text-slate-800">{supplierName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{parseInvoiceFromNotes(grn.notes)}</td>
                      <td className="px-5 py-4 text-right">
                        <span className="inline-flex min-w-[2rem] justify-center rounded-lg bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">
                          {itemCount}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">{money(net)}</td>
                      <td className="px-5 py-4 text-right text-sm text-slate-600">{money(paid)}</td>
                      <td className="px-5 py-4 text-right">
                        {balance > 0 ? (
                          <span className="text-sm font-bold text-rose-600">{money(balance)}</span>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
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
      </section>

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
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-4 py-2 text-xs font-bold text-slate-900 shadow-md transition hover:brightness-105"
                  >
                    + Add Item
                  </button>
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
                            <input
                              value={row.itemName}
                              onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                              className={tableFieldClass}
                              placeholder="Item name"
                            />
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
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 md:grid-cols-3">
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
