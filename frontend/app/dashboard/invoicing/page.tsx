'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { clearCacheByPrefix, readCache, writeCache } from '@/lib/swrCache';

type DocumentType = 'quotation' | 'invoice';
type ListFilter = 'all' | DocumentType;
type InvoicePaymentTiming = 'credit' | 'pay_now';

interface SummaryStats {
  invoices_today: number;
  quotations_active: number;
  unpaid_invoices: number;
  outstanding_total: number;
}

interface ServiceInvoiceRecord {
  id: number;
  document_type: DocumentType;
  document_number: string;
  document_date: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  vehicle_no?: string | null;
  brand?: string | null;
  model?: string | null;
  chassis_no?: string | null;
  total_amount: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_status?: string;
  valid_until?: string | null;
  due_date?: string | null;
  status: string;
  discount_amount?: number;
  tax_amount?: number;
  notes?: string | null;
  items?: Array<{
    id?: number;
    description: string;
    quantity: number;
    unit_price: number;
    inventory_item_id?: number | null;
  }>;
}

interface InventoryItem {
  id: number;
  code: string;
  name: string;
  sell_price: number;
  unit_price: number;
  current_stock: number;
  unit?: string;
}

interface DocLineRow {
  id: number;
  description: string;
  warranty: string;
  quantity: number;
  unitPrice: number;
  inventoryItemId: number | null;
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500';

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const INVOICE_PAYMENT_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
] as const;

const createDocLine = (
  id: number,
  description = '',
  quantity = 1,
  unitPrice = 0,
  inventoryItemId: number | null = null,
  warranty = ''
): DocLineRow => ({
  id,
  description,
  warranty,
  quantity,
  unitPrice,
  inventoryItemId,
});

const mapInventoryItem = (item: InventoryItem): InventoryItem => ({
  id: item.id,
  code: String(item.code || ''),
  name: String(item.name || ''),
  sell_price: Number(item.sell_price) || 0,
  unit_price: Number(item.unit_price) || 0,
  current_stock: Number(item.current_stock) || 0,
  unit: item.unit || '',
});

const parseInventoryRows = (res: { data?: unknown }): InventoryItem[] => {
  const payload = (res.data as { data?: unknown })?.data;
  const rows = Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: InventoryItem[] }).data : [];
  return rows.map((item) => mapInventoryItem(item as InventoryItem));
};

const resolveInventoryIdFromDescription = (
  description: string,
  items: InventoryItem[]
): number | null => {
  const trimmed = description.trim();
  if (!trimmed) return null;
  const matched = items.find(
    (item) =>
      trimmed.startsWith(`${item.code} –`) ||
      trimmed.startsWith(`${item.code} —`) ||
      trimmed.startsWith(`${item.code} -`)
  );
  return matched?.id ?? null;
};

const docLineTotal = (row: DocLineRow) => {
  const qty = Math.max(Number(row.quantity) || 0, 0);
  const unit = Math.max(Number(row.unitPrice) || 0, 0);
  return Math.round(qty * unit * 100) / 100;
};

const extractApiError = (error: unknown, fallback = 'Request failed.'): string => {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as { message?: string; errors?: Record<string, string[] | string> };
  if (data?.errors) {
    const messages = Object.entries(data.errors).flatMap(([field, value]) => {
      const parts = Array.isArray(value) ? value : [String(value)];
      return parts.map((msg) => `${field}: ${msg}`);
    });
    if (messages.length) return messages.join(' ');
  }
  return data?.message || fallback;
};

const fmtDocDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const typeBadge = (type: DocumentType) =>
  type === 'quotation'
    ? 'bg-violet-500/15 text-violet-800 ring-violet-500/25'
    : 'bg-teal-500/15 text-teal-800 ring-teal-500/25';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';

const INV_CACHE_TTL = {
  access: 5 * 60 * 1000,
  summary: 60 * 1000,
  records: 30 * 1000,
  storeItems: 5 * 60 * 1000,
};
const invCacheKey = (tokenValue: string, name: string) =>
  `invoicing:${name}:${tokenValue.slice(-10)}`;

export default function InvoicingPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);

  const [summary, setSummary] = useState<SummaryStats>({
    invoices_today: 0,
    quotations_active: 0,
    unpaid_invoices: 0,
    outstanding_total: 0,
  });
  const [records, setRecords] = useState<ServiceInvoiceRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const perPage = 15;

  const [showDocModal, setShowDocModal] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('quotation');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docValidUntil, setDocValidUntil] = useState('');
  const [docDueDate, setDocDueDate] = useState('');
  const [docDiscount, setDocDiscount] = useState('0');
  const [docTax, setDocTax] = useState('0');
  const [docNotes, setDocNotes] = useState('');
  const [docLines, setDocLines] = useState<DocLineRow[]>([createDocLine(1)]);
  const [docSourceId, setDocSourceId] = useState<number | null>(null);
  const [docSaving, setDocSaving] = useState(false);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [docPaymentTiming, setDocPaymentTiming] = useState<InvoicePaymentTiming>('pay_now');
  const [docPaidAmount, setDocPaidAmount] = useState('0');
  const [docPaymentType, setDocPaymentType] = useState('cash');
  const [docPaymentReference, setDocPaymentReference] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [chassisNo, setChassisNo] = useState('');

  const [storeItems, setStoreItems] = useState<InventoryItem[]>([]);
  const [docDropdownRowId, setDocDropdownRowId] = useState<number | null>(null);
  const [docDropdownSearch, setDocDropdownSearch] = useState<Record<number, string>>({});
  const [docDropdownHighlight, setDocDropdownHighlight] = useState(-1);
  const [rowSearchItems, setRowSearchItems] = useState<Record<number, InventoryItem[]>>({});
  const [itemDropdownRect, setItemDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inventorySearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const positionItemDropdown = (input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    setItemDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  };

  const [formMessage, setFormMessage] = useState('');
  const [formMessageType, setFormMessageType] = useState<'success' | 'error' | ''>('');
  const showWidgetCloseButtons = canManageFeatureVisibility && !widgetsFixed;

  const isColumnVisible = (key: string) => !hiddenModules.includes(key);
  const isElementVisible = (key: string) => !hiddenModules.includes(key);

  const searchInitialized = useRef(false);

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
    const cacheKey = invCacheKey(authToken, 'access');
    const cached = readCache<{ canManage: boolean; hidden: string[] }>(cacheKey, INV_CACHE_TTL.access);
    if (cached) {
      setCanManageFeatureVisibility(cached.canManage);
      setHiddenModules(cached.hidden);
    }

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

      const canManage = superAdmin && Boolean(visibilityRes.data?.can_manage);
      const hidden: string[] = Array.from(new Set<string>(hiddenModuleList));
      setCanManageFeatureVisibility(canManage);
      setHiddenModules(hidden);
      writeCache(cacheKey, { canManage, hidden });
    } catch (error) {
      console.error('Error fetching invoicing visibility profile:', error);
      if (!cached) {
        setCanManageFeatureVisibility(false);
        setHiddenModules([]);
      }
    }
  };

  const handleInvoicingVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating invoicing widget visibility:', error);
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

  const listParams = useMemo(() => {
    const params: Record<string, string | number> = {
      page: currentPage,
      per_page: perPage,
    };
    if (listFilter !== 'all') params.type = listFilter;
    const term = listSearch.trim();
    if (term) params.search = term;
    return params;
  }, [currentPage, perPage, listFilter, listSearch]);

  const fetchSummary = async () => {
    if (!token) return;
    const cacheKey = invCacheKey(token, 'summary');
    const cached = readCache<SummaryStats>(cacheKey, INV_CACHE_TTL.summary);
    if (cached) {
      setSummary(cached);
    }
    try {
      const res = await axios.get(`${API_URL}/api/service-invoices/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setSummary(res.data.data);
        writeCache(cacheKey, res.data.data as SummaryStats);
      }
    } catch (error) {
      console.error('Error fetching invoicing summary:', error);
    }
  };

  const fetchRecords = async (page = currentPage) => {
    if (!token) return;
    const requestParams = { ...listParams, page };
    const cacheKey = invCacheKey(token, `records:${JSON.stringify(requestParams)}`);
    const cached = readCache<{ rows: ServiceInvoiceRecord[]; lastPage: number; total: number }>(
      cacheKey,
      INV_CACHE_TTL.records
    );
    if (cached) {
      setRecords(cached.rows);
      setLastPage(cached.lastPage);
      setTotalRecords(cached.total);
      setListLoading(false);
    }
    try {
      if (!cached) setListLoading(true);
      const res = await axios.get(`${API_URL}/api/service-invoices`, {
        headers: { Authorization: `Bearer ${token}` },
        params: requestParams,
      });
      const payload = res.data?.success ? res.data.data : res.data;
      const rows = Array.isArray(payload) ? payload : payload?.data || [];
      const nextLastPage = Number(payload?.last_page) || 1;
      const nextTotal = Number(payload?.total) || rows.length;
      setRecords(rows as ServiceInvoiceRecord[]);
      setLastPage(nextLastPage);
      setTotalRecords(nextTotal);
      writeCache(cacheKey, { rows, lastPage: nextLastPage, total: nextTotal });
    } catch (error) {
      console.error('Error fetching service invoices:', error);
      if (!cached) {
        setRecords([]);
        setLastPage(1);
        setTotalRecords(0);
      }
    } finally {
      setListLoading(false);
    }
  };

  const loadStoreItems = async (forceRefresh = false) => {
    if (!token) return;
    const cacheKey = invCacheKey(token, 'store-items');
    if (!forceRefresh) {
      const cached = readCache<InventoryItem[]>(cacheKey, INV_CACHE_TTL.storeItems);
      if (cached) {
        setStoreItems(cached);
        return;
      }
    }
    try {
      const res = await axios.get(`${API_URL}/api/stock/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000, status: 'active' },
      });
      if (res.data?.success) {
        const items = parseInventoryRows(res);
        setStoreItems(items);
        writeCache(cacheKey, items);
      } else {
        setStoreItems([]);
      }
    } catch (error) {
      console.error('Error fetching store items:', error);
      setStoreItems([]);
    }
  };

  const searchInventoryForRow = (rowId: number, term: string) => {
    if (!token) return;
    const trimmed = term.trim();
    if (trimmed.length < 1) {
      setRowSearchItems((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }

    if (inventorySearchTimers.current[rowId]) {
      clearTimeout(inventorySearchTimers.current[rowId]);
    }

    inventorySearchTimers.current[rowId] = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { search: trimmed, per_page: 15, status: 'active' },
        });
        if (res.data?.success) {
          setRowSearchItems((prev) => ({ ...prev, [rowId]: parseInventoryRows(res) }));
        }
      } catch (error) {
        console.error('Inventory search failed:', error);
      }
    }, 280);
  };

  useEffect(() => {
    if (!token) return;
    loadStoreItems();
    fetchSummary();
  }, [token]);

  useEffect(() => {
    if (showDocModal && token) {
      loadStoreItems();
    }
  }, [showDocModal, token]);

  useEffect(() => {
    if (!token) return;
    fetchRecords(currentPage);
  }, [token, currentPage, listFilter]);

  useEffect(() => {
    if (!token) return;
    if (!searchInitialized.current) {
      searchInitialized.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchRecords(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [listSearch]);

  const getDocDropdownItems = (rowId: number): InventoryItem[] => {
    const search = (docDropdownSearch[rowId] ?? '').trim().toLowerCase();
    if (!search) return [];

    const local = storeItems
      .filter(
        (item) =>
          item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search)
      )
      .slice(0, 10);

    if (local.length > 0) return local;

    return rowSearchItems[rowId] || [];
  };

  const handleDocItemSelect = (rowId: number, item: InventoryItem) => {
    const price = item.unit_price > 0 ? item.unit_price : item.sell_price;
    updateDocLine(rowId, {
      description: `${item.code} – ${item.name}`,
      unitPrice: price,
      inventoryItemId: item.id,
    });
    setDocDropdownSearch((prev) => ({ ...prev, [rowId]: `${item.code} – ${item.name}` }));
    setDocDropdownRowId(null);
    setDocDropdownHighlight(-1);
    setItemDropdownRect(null);
  };

  const docSubtotal = useMemo(
    () => docLines.reduce((sum, row) => sum + docLineTotal(row), 0),
    [docLines]
  );

  const docTotal = useMemo(() => {
    const discount = Math.min(Math.max(Number(docDiscount) || 0, 0), docSubtotal);
    const tax = Math.max(Number(docTax) || 0, 0);
    return Math.max(docSubtotal - discount + tax, 0);
  }, [docSubtotal, docDiscount, docTax]);

  const docEffectivePaid = useMemo(() => {
    if (docType !== 'invoice' || docPaymentTiming === 'credit') return 0;
    return Math.min(Math.max(Number(docPaidAmount) || 0, 0), docTotal);
  }, [docType, docPaymentTiming, docPaidAmount, docTotal]);

  const docInvoiceBalance = useMemo(
    () => Math.max(docTotal - docEffectivePaid, 0),
    [docTotal, docEffectivePaid]
  );

  const updateDocLine = (rowId: number, patch: Partial<DocLineRow>) => {
    setDocLines((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    if (patch.description !== undefined) {
      setDocDropdownSearch((prev) => ({ ...prev, [rowId]: patch.description as string }));
    }
  };

  const addDocLine = () => {
    setDocLines((prev) => {
      const newId = (prev[prev.length - 1]?.id || 0) + 1;
      setDocDropdownSearch((s) => ({ ...s, [newId]: '' }));
      return [...prev, createDocLine(newId)];
    });
  };

  const removeDocLine = (rowId: number) => {
    setDocLines((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
    setDocDropdownSearch((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (docDropdownRowId === rowId) {
      setDocDropdownRowId(null);
      setItemDropdownRect(null);
    }
  };

  const applyQuotationToForm = (quotation: ServiceInvoiceRecord) => {
    setDocSourceId(quotation.id);
    setCustomerName(quotation.customer_name || '');
    setCustomerPhone(quotation.customer_phone || '');
    setCustomerEmail(quotation.customer_email || '');
    setVehicleNo(quotation.vehicle_no || '');
    setBrand(quotation.brand || '');
    setModel(quotation.model || '');
    setChassisNo(quotation.chassis_no || '');

    if (quotation.items?.length) {
      const quotLines = quotation.items.map((item, index) => {
        const desc = String(item.description || '');
        return createDocLine(
          index + 1,
          desc,
          Number(item.quantity) || 1,
          Number(item.unit_price) || 0,
          item.inventory_item_id
            ? Number(item.inventory_item_id)
            : resolveInventoryIdFromDescription(desc, storeItems),
          String((item as { warranty?: string }).warranty || '')
        );
      });
      setDocLines(quotLines);
      const initSearch: Record<number, string> = {};
      quotLines.forEach((l) => {
        initSearch[l.id] = l.description;
      });
      setDocDropdownSearch(initSearch);
    }

    setDocDiscount(String(quotation.discount_amount || 0));
    setDocTax(String(quotation.tax_amount || 0));
    setDocNotes(
      quotation.notes
        ? `From quotation ${quotation.document_number}\n${quotation.notes}`
        : `From quotation ${quotation.document_number}`
    );
  };

  const resetDocForm = () => {
    const today = new Date().toISOString().split('T')[0];
    const validDefault = new Date();
    validDefault.setDate(validDefault.getDate() + 14);
    const dueDefault = new Date();
    dueDefault.setDate(dueDefault.getDate() + 7);

    setDocDate(today);
    setDocValidUntil(validDefault.toISOString().split('T')[0]);
    setDocDueDate(dueDefault.toISOString().split('T')[0]);
    setDocDiscount('0');
    setDocTax('0');
    setDocNotes('');
    setDocSourceId(null);
    setDocDropdownRowId(null);
    setDocDropdownHighlight(-1);
    setDocDropdownSearch({});
    setRowSearchItems({});
    setItemDropdownRect(null);
    setDocPaymentTiming('pay_now');
    setDocPaymentType('cash');
    setDocPaymentReference('');
    setDocPaidAmount('0');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setVehicleNo('');
    setBrand('');
    setModel('');
    setChassisNo('');
    const defaultLines = [createDocLine(1)];
    setDocLines(defaultLines);
    setDocDropdownSearch({ 1: '' });
  };

  const fetchLatestQuotation = async (phone: string): Promise<ServiceInvoiceRecord | null> => {
    if (!token || !phone.trim()) return null;
    try {
      const res = await axios.get(`${API_URL}/api/service-invoices/latest-quotation`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { customer_phone: phone.trim() },
      });
      return res.data?.data || null;
    } catch (error) {
      console.error('Could not load latest quotation:', error);
      return null;
    }
  };

  const handleOpenCreateModal = async (
    type: DocumentType,
    sourceQuotation?: ServiceInvoiceRecord | null
  ) => {
    resetDocForm();
    setDocType(type);
    setShowDocModal(true);

    if (sourceQuotation) {
      applyQuotationToForm(sourceQuotation);
    }
  };

  const handleLoadQuotation = async () => {
    if (!customerPhone.trim()) {
      alert('Enter customer phone to load a quotation.');
      return;
    }
    setQuotationLoading(true);
    try {
      const quotation = await fetchLatestQuotation(customerPhone);
      if (!quotation?.items?.length) {
        alert('No quotation found for this phone number.');
        return;
      }
      applyQuotationToForm(quotation);
    } finally {
      setQuotationLoading(false);
    }
  };

  const handleMakeInvoiceFromQuotation = async (quotation: ServiceInvoiceRecord) => {
    let source = quotation;
    if (!source.items?.length && token) {
      try {
        const res = await axios.get(`${API_URL}/api/service-invoices/${quotation.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        source = res.data?.data || quotation;
      } catch (error) {
        console.error('Could not load quotation details:', error);
      }
    }
    resetDocForm();
    setDocType('invoice');
    applyQuotationToForm(source);
    setShowDocModal(true);
  };

  const handleSaveDocument = async () => {
    if (!token) {
      alert('Please login again.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Customer name and phone are required.');
      return;
    }

    const validLines = docLines.filter((row) => row.description.trim());
    if (validLines.length === 0) {
      alert('Add at least one line item with a description.');
      return;
    }

    try {
      setDocSaving(true);
      const payload: Record<string, unknown> = {
        document_type: docType,
        document_date: docDate,
        status: 'draft',
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        vehicle_no: vehicleNo.trim().toUpperCase() || null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        chassis_no: chassisNo.trim().toUpperCase() || null,
        discount_amount: Number(docDiscount) || 0,
        tax_amount: Number(docTax) || 0,
        notes: docNotes.trim() || null,
        items: validLines.map((row) => ({
          description: row.description.trim(),
          warranty: row.warranty.trim() || null,
          quantity: Number(row.quantity) || 1,
          unit_price: Number(row.unitPrice) || 0,
          inventory_item_id: row.inventoryItemId ?? null,
        })),
      };

      if (docType === 'quotation') {
        payload.valid_until = docValidUntil || null;
      } else {
        payload.due_date = docDueDate || null;
        if (docSourceId) payload.source_document_id = docSourceId;
        payload.payment_timing = docPaymentTiming;
        payload.paid_amount = docPaymentTiming === 'credit' ? 0 : docEffectivePaid;
        if (docPaymentTiming === 'pay_now' && docEffectivePaid > 0) {
          payload.payment_type = docPaymentType;
          payload.payment_reference = docPaymentReference.trim() || null;
        }
      }

      const res = await axios.post(`${API_URL}/api/service-invoices`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const saved = res.data?.data;
      setShowDocModal(false);

      let successMsg = `${docType === 'quotation' ? 'Quotation' : 'Invoice'} ${saved?.document_number || ''} created.`;
      if (docType === 'invoice' && Number(saved?.balance_amount) > 0) {
        successMsg += ` Customer outstanding: LKR ${money(Number(saved.balance_amount))}.`;
      }
      setFormMessage(successMsg);
      setFormMessageType('success');

      setCurrentPage(1);
      clearCacheByPrefix(invCacheKey(token, 'records'));
      clearCacheByPrefix(invCacheKey(token, 'summary'));
      await fetchRecords(1);
      await fetchSummary();

      if (docType === 'invoice' && saved?.id) {
        window.open(`/dashboard/invoicing/documents/${saved.id}/print`, '_blank');
      }

      if (docType === 'invoice') {
        await loadStoreItems(true);
      }
    } catch (error) {
      alert(extractApiError(error, `Failed to create ${docType}.`));
    } finally {
      setDocSaving(false);
    }
  };

  const openDocumentPrint = (docId: number) => {
    window.open(`/dashboard/invoicing/documents/${docId}/print`, '_blank');
  };

  const filterPills: Array<{ value: ListFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'quotation', label: 'Quotations' },
    { value: 'invoice', label: 'Invoices' },
  ];

  const visibleDocColumnCount = [
    'invoicing-col-doc-no',
    'invoicing-col-type',
    'invoicing-col-customer',
    'invoicing-col-phone',
    'invoicing-col-date',
    'invoicing-col-total',
    'invoicing-col-paid',
    'invoicing-col-balance',
    'invoicing-col-actions',
  ].filter((key) => isColumnVisible(key)).length;

  return (
    <div className="space-y-8 pb-10">
      {isElementVisible('invoicing-el-hero') && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-950 via-cyan-950 to-teal-900 px-6 py-8 shadow-2xl shadow-teal-900/30 sm:px-10 sm:py-10">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-hero', true); }}
              className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
              title="Hide section"
              aria-label="Hide invoicing hero section"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-teal-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-teal-100 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                Service · Invoicing
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Quotations &amp; Invoices
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-teal-100/90 sm:text-base">
                Create standalone quotations and invoices, track payments, and manage customer
                outstanding balances.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {isElementVisible('invoicing-el-btn-new-quotation') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-btn-new-quotation', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide button"
                      aria-label="Hide new quotation button"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal('quotation')}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    New Quotation
                  </button>
                </div>
              )}
              {isElementVisible('invoicing-el-btn-new-invoice') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-btn-new-invoice', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide button"
                      aria-label="Hide new invoice button"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal('invoice')}
                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-teal-400 px-8 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/15 text-lg">
                      +
                    </span>
                    New Invoice
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {formMessage && formMessageType === 'success' && !showDocModal && isElementVisible('invoicing-el-success-message') && (
        <div className="relative flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          {showWidgetCloseButtons && (
            <button
              type="button"
              onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-success-message', true); }}
              className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
              title="Hide message"
              aria-label="Hide success message"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm text-white">
            ✓
          </span>
          <p className="text-sm font-medium text-emerald-900">{formMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Invoices Today',
            value: String(summary.invoices_today),
            hint: 'Issued today',
            icon: '🧾',
            accent: 'from-teal-500 to-cyan-600',
          },
          {
            label: 'Active Quotations',
            value: String(summary.quotations_active),
            hint: 'Open quotations',
            icon: '📋',
            accent: 'from-violet-500 to-purple-600',
          },
          {
            label: 'Unpaid Invoices',
            value: String(summary.unpaid_invoices),
            hint: 'Unpaid or partial',
            icon: '⏳',
            accent: 'from-amber-500 to-orange-500',
          },
          {
            label: 'Outstanding Total',
            value: `LKR ${money(summary.outstanding_total)}`,
            hint: 'All customers',
            icon: '💰',
            accent: 'from-emerald-500 to-teal-600',
          },
        ].map((card) => {
          const visibilityMap: Record<string, string> = {
            'Invoices Today': 'invoicing-el-stat-invoices-today',
            'Active Quotations': 'invoicing-el-stat-active-quotations',
            'Unpaid Invoices': 'invoicing-el-stat-unpaid-invoices',
            'Outstanding Total': 'invoicing-el-stat-outstanding-total',
          };
          const key = visibilityMap[card.label];
          if (!key || !isElementVisible(key)) return null;

          return (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInvoicingVisibilityToggle(key, true); }}
                  className="absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                  title="Hide stat"
                  aria-label={`Hide ${card.label}`}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl">
                  {card.icon}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isElementVisible('invoicing-sec-documents') && (
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleInvoicingVisibilityToggle('invoicing-sec-documents', true); }}
            className="absolute top-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
            title="Hide section"
            aria-label="Hide documents section"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
        <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50/80 via-white to-cyan-50/40 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Documents</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords} record{totalRecords !== 1 ? 's' : ''} · Page {currentPage} of{' '}
                {lastPage}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {isElementVisible('invoicing-el-search') && (
                <div className="relative">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-search', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide search"
                      aria-label="Hide search"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    ⌕
                  </span>
                  <input
                    type="search"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder="Search doc #, customer, phone, vehicle..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 focus:outline-none sm:w-80"
                  />
                </div>
              )}
              {isElementVisible('invoicing-el-filter-pills') && (
                <div className="relative flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                  {showWidgetCloseButtons && (
                    <button
                      type="button"
                      onClick={() => { void handleInvoicingVisibilityToggle('invoicing-el-filter-pills', true); }}
                      className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                      title="Hide filters"
                      aria-label="Hide filters"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                  {filterPills.map((pill) => (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => {
                        setListFilter(pill.value);
                        setCurrentPage(1);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        listFilter === pill.value
                          ? 'bg-white text-teal-700 shadow-sm ring-1 ring-teal-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-slate-900 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                {isColumnVisible('invoicing-col-doc-no') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Doc #</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-doc-no', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Doc # column"
                          aria-label="Hide Doc # column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-type') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Type</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-type', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Type column"
                          aria-label="Hide Type column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-customer') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Customer</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-customer', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Customer column"
                          aria-label="Hide Customer column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-phone') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Phone</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-phone', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Phone column"
                          aria-label="Hide Phone column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-date') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span>Date</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-date', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Date column"
                          aria-label="Hide Date column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-total') && (
                  <th className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>Total</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-total', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Total column"
                          aria-label="Hide Total column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-paid') && (
                  <th className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>Paid</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-paid', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Paid column"
                          aria-label="Hide Paid column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-balance') && (
                  <th className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>Balance</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-balance', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Balance column"
                          aria-label="Hide Balance column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
                {isColumnVisible('invoicing-col-actions') && (
                  <th className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <span>Actions</span>
                      {showWidgetCloseButtons && (
                        <button
                          type="button"
                          onClick={() => { void handleInvoicingVisibilityToggle('invoicing-col-actions', true); }}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Hide Actions column"
                          aria-label="Hide Actions column"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={Math.max(visibleDocColumnCount, 1)} className="px-5 py-4">
                      <div className="h-4 rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(visibleDocColumnCount, 1)} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-cyan-100 text-3xl">
                        🧾
                      </div>
                      <p className="font-semibold text-slate-800">No documents in this view</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Create a quotation or invoice to get started.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/80">
                    {isColumnVisible('invoicing-col-doc-no') && (
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-900">
                        {row.document_number}
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-type') && (
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${typeBadge(row.document_type)}`}
                        >
                          {row.document_type}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-customer') && <td className="px-5 py-4 text-sm text-slate-800">{row.customer_name}</td>}
                    {isColumnVisible('invoicing-col-phone') && <td className="px-5 py-4 text-sm text-slate-600">{row.customer_phone}</td>}
                    {isColumnVisible('invoicing-col-date') && (
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {fmtDocDate(row.document_date)}
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-total') && (
                      <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                        {money(Number(row.total_amount))}
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-paid') && (
                      <td className="px-5 py-4 text-right text-sm text-slate-600">
                        {row.document_type === 'invoice'
                          ? money(Number(row.paid_amount || 0))
                          : '—'}
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-balance') && (
                      <td className="px-5 py-4 text-right text-sm text-slate-600">
                        {row.document_type === 'invoice'
                          ? money(Number(row.balance_amount || 0))
                          : '—'}
                      </td>
                    )}
                    {isColumnVisible('invoicing-col-actions') && (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDocumentPrint(row.id)}
                            className="whitespace-nowrap rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
                          >
                            View / Print
                          </button>
                          {row.document_type === 'quotation' && (
                            <button
                              type="button"
                              onClick={() => handleMakeInvoiceFromQuotation(row)}
                              className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              Make Invoice
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && isElementVisible('invoicing-sec-pagination') && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-8">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {currentPage} of {lastPage}
            </span>
            <button
              type="button"
              disabled={currentPage >= lastPage}
              onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
      )}

      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div
              className={`shrink-0 border-b px-6 py-5 sm:px-8 ${
                docType === 'quotation'
                  ? 'border-violet-100 bg-gradient-to-r from-violet-900 to-purple-900'
                  : 'border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-900'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                    {docType === 'quotation' ? 'Quotation' : 'Invoice'}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-white">
                    {docType === 'quotation' ? 'New Quotation' : 'New Invoice'}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">
                    Standalone service document
                    {docSourceId && docType === 'invoice' ? ' · from quotation' : ''}
                    {quotationLoading ? ' · loading quotation…' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDocModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-5 sm:p-7">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <h4 className="text-sm font-bold text-slate-800">Customer</h4>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={fieldClass}
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={fieldClass}
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className={fieldClass}
                      placeholder="optional@email.com"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-800">Vehicle (optional)</h4>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={labelClass}>Vehicle No</label>
                    <input
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <input value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Model</label>
                    <input value={model} onChange={(e) => setModel(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Chassis No</label>
                    <input
                      value={chassisNo}
                      onChange={(e) => setChassisNo(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Document Date</label>
                  <input
                    type="date"
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                {docType === 'quotation' ? (
                  <div>
                    <label className={labelClass}>Valid Until</label>
                    <input
                      type="date"
                      value={docValidUntil}
                      onChange={(e) => setDocValidUntil(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Due Date</label>
                    <input
                      type="date"
                      value={docDueDate}
                      onChange={(e) => setDocDueDate(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Discount (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={docDiscount}
                    onChange={(e) => setDocDiscount(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              {docType === 'invoice' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleLoadQuotation}
                    disabled={quotationLoading}
                    className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-60"
                  >
                    {quotationLoading ? 'Loading…' : 'Load quotation'}
                  </button>
                </div>
              )}

              <div className="overflow-visible rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <h4 className="text-sm font-bold text-slate-800">Line Items</h4>
                  <p className="mr-auto ml-3 text-xs text-slate-500">Type name or code to search store items</p>
                  <button
                    type="button"
                    onClick={addDocLine}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-xs font-bold uppercase text-slate-500">
                        <th className="min-w-[200px] px-3 py-2">Description</th>
                        <th className="w-28 px-3 py-2">Warranty</th>
                        <th className="w-24 px-3 py-2">Qty</th>
                        <th className="w-32 px-3 py-2">Unit (LKR)</th>
                        <th className="w-32 px-3 py-2 text-right">Total</th>
                        <th className="w-12 px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {docLines.map((row) => (
                        <tr key={row.id} className="relative">
                          <td className="relative px-3 py-2 align-top">
                            <input
                              value={docDropdownSearch[row.id] ?? row.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDocDropdownSearch((prev) => ({ ...prev, [row.id]: val }));
                                updateDocLine(row.id, { description: val, inventoryItemId: null });
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                                positionItemDropdown(e.currentTarget);
                                searchInventoryForRow(row.id, val);
                              }}
                              onFocus={(e) => {
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                                positionItemDropdown(e.currentTarget);
                                const term = docDropdownSearch[row.id] ?? row.description;
                                if (term.trim()) searchInventoryForRow(row.id, term);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setDocDropdownRowId(null);
                                  setItemDropdownRect(null);
                                }, 150);
                              }}
                              onKeyDown={(e) => {
                                const items = getDocDropdownItems(row.id);
                                if (!items.length) return;
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setDocDropdownHighlight((h) => (h < items.length - 1 ? h + 1 : 0));
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setDocDropdownHighlight((h) => (h > 0 ? h - 1 : items.length - 1));
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const idx = docDropdownHighlight >= 0 ? docDropdownHighlight : 0;
                                  if (items[idx]) handleDocItemSelect(row.id, items[idx]);
                                } else if (e.key === 'Escape') {
                                  setDocDropdownRowId(null);
                                }
                              }}
                              className={fieldClass}
                              placeholder="Type item name or code…"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <input
                              value={row.warranty}
                              onChange={(e) => updateDocLine(row.id, { warranty: e.target.value })}
                              className={fieldClass}
                              placeholder="e.g. 6 months"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) =>
                                updateDocLine(row.id, { quantity: Number(e.target.value) || 0 })
                              }
                              className={fieldClass}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unitPrice}
                              onChange={(e) =>
                                updateDocLine(row.id, { unitPrice: Number(e.target.value) || 0 })
                              }
                              className={fieldClass}
                              placeholder={docType === 'quotation' ? 'Enter price' : '0.00'}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">
                            {money(docLineTotal(row))}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeDocLine(row.id)}
                              className="text-rose-600 hover:text-rose-800"
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Tax (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={docTax}
                    onChange={(e) => setDocTax(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Summary</p>
                  <p className="mt-2 flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>LKR {money(docSubtotal)}</span>
                  </p>
                  <p className="mt-1 flex justify-between text-lg font-bold text-slate-900">
                    <span>Total</span>
                    <span>LKR {money(docTotal)}</span>
                  </p>
                </div>
              </div>

              {docType === 'invoice' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
                  <h4 className="text-sm font-bold text-slate-800">Payment</h4>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Credit or unpaid balance is added to the customer&apos;s outstanding by phone
                    number.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDocPaymentTiming('pay_now');
                        setDocPaidAmount(docTotal > 0 ? docTotal.toFixed(2) : '0');
                      }}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        docPaymentTiming === 'pay_now'
                          ? 'border-emerald-400 bg-white shadow-md ring-2 ring-emerald-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg">💵</span>
                      <p className="mt-2 font-bold text-slate-900">Collect Payment</p>
                      <p className="text-xs text-slate-500">
                        Full or partial — balance goes to outstanding
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDocPaymentTiming('credit');
                        setDocPaidAmount('0');
                      }}
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        docPaymentTiming === 'credit'
                          ? 'border-violet-400 bg-white shadow-md ring-2 ring-violet-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg">📒</span>
                      <p className="mt-2 font-bold text-slate-900">Credit</p>
                      <p className="text-xs text-slate-500">
                        Full invoice amount to customer outstanding
                      </p>
                    </button>
                  </div>

                  {docPaymentTiming === 'pay_now' && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelClass}>Payment Type</label>
                        <select
                          value={docPaymentType}
                          onChange={(e) => setDocPaymentType(e.target.value)}
                          className={fieldClass}
                        >
                          {INVOICE_PAYMENT_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Paid Amount (LKR)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={docTotal}
                          value={docPaidAmount}
                          onChange={(e) => setDocPaidAmount(e.target.value)}
                          className={fieldClass}
                        />
                        <button
                          type="button"
                          onClick={() => setDocPaidAmount(docTotal > 0 ? docTotal.toFixed(2) : '0')}
                          className="mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                        >
                          Pay full amount
                        </button>
                      </div>
                      <div>
                        <label className={labelClass}>Reference</label>
                        <input
                          value={docPaymentReference}
                          onChange={(e) => setDocPaymentReference(e.target.value)}
                          placeholder="Receipt / transfer ref"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Invoice Total', value: `LKR ${money(docTotal)}` },
                      { label: 'Paid Now', value: `LKR ${money(docEffectivePaid)}` },
                      {
                        label: 'To Outstanding',
                        value: `LKR ${money(docInvoiceBalance)}`,
                        highlight: true,
                      },
                      {
                        label: 'Status',
                        value:
                          docInvoiceBalance <= 0 && docTotal > 0
                            ? 'Paid'
                            : docEffectivePaid > 0
                              ? 'Partial'
                              : 'Credit',
                      },
                    ].map((tile) => (
                      <div
                        key={tile.label}
                        className={`rounded-xl border px-3 py-3 ${
                          tile.highlight ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {tile.label}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{tile.value}</p>
                      </div>
                    ))}
                  </div>

                  {docInvoiceBalance > 0 && customerPhone.trim() && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                      <span className="font-bold">LKR {money(docInvoiceBalance)}</span> will be added
                      to{' '}
                      <span className="font-bold">{customerName.trim() || 'customer'}</span> (
                      {customerPhone.trim()}) outstanding.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  rows={2}
                  className={fieldClass}
                  placeholder="Terms, warranty, payment instructions..."
                />
              </div>
            </div>

            {docDropdownRowId !== null && itemDropdownRect && (
              <>
                {getDocDropdownItems(docDropdownRowId).length > 0 ? (
                  <div
                    className="fixed z-[500] max-h-52 overflow-y-auto rounded-xl border border-teal-200 bg-white shadow-2xl ring-1 ring-teal-100"
                    style={{
                      top: itemDropdownRect.top,
                      left: itemDropdownRect.left,
                      width: itemDropdownRect.width,
                    }}
                  >
                    {getDocDropdownItems(docDropdownRowId).map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => handleDocItemSelect(docDropdownRowId, item)}
                        className={`w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 ${
                          docDropdownHighlight === idx
                            ? 'bg-teal-50 text-teal-900'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-800">
                          {item.code} — {item.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Stock: {item.current_stock} {item.unit}
                          {item.unit_price > 0 && (
                            <span className="ml-2">· Price: LKR {item.unit_price.toFixed(2)}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (docDropdownSearch[docDropdownRowId] ?? '').trim().length > 0 ? (
                  <div
                    className="fixed z-[500] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg"
                    style={{
                      top: itemDropdownRect.top,
                      left: itemDropdownRect.left,
                      width: itemDropdownRect.width,
                    }}
                  >
                    No matching items in store
                  </div>
                ) : null}
              </>
            )}

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                disabled={docSaving}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDocument}
                disabled={docSaving || quotationLoading}
                className={`inline-flex min-w-[160px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60 ${
                  docType === 'quotation'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600'
                }`}
              >
                {docSaving
                  ? 'Saving...'
                  : docType === 'quotation'
                    ? 'Save Quotation'
                    : 'Save Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
