'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

type JobStatus = 'pending' | 'in_progress' | 'on_hold' | 'completed' | 'delivered' | 'cancelled';
type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

interface EmployeeOption {
  id: number;
  first_name: string;
  last_name: string;
  employee_code?: string;
}

interface JobCardRecord {
  id: number;
  job_card_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  vehicle_no?: string | null;
  chassis_no?: string | null;
  brand?: string | null;
  model?: string | null;
  problem_description: string;
  accessories_received?: string | null;
  inspection_review?: string | null;
  inspection_reviewed_at?: string | null;
  inspected_by_employee_id?: number | null;
  inspected_by_employee?: EmployeeOption | null;
  priority: JobPriority;
  status: JobStatus;
  received_date: string;
  promised_date?: string | null;
  estimated_cost?: number | null;
  advance_amount?: number | null;
  notes?: string | null;
  assigned_employee_id?: number | null;
  assigned_employee?: EmployeeOption | null;
  created_at?: string;
}

interface SummaryStats {
  active: number;
  pending: number;
  in_progress: number;
  completed_today: number;
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500';

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const employeeName = (emp?: EmployeeOption | null) => {
  if (!emp) return '—';
  return [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '—';
};

const statusBadge = (status: JobStatus) => {
  const map: Record<JobStatus, string> = {
    pending: 'bg-amber-500/15 text-amber-800 ring-amber-500/25',
    in_progress: 'bg-sky-500/15 text-sky-800 ring-sky-500/25',
    on_hold: 'bg-slate-500/15 text-slate-700 ring-slate-500/25',
    completed: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25',
    delivered: 'bg-violet-500/15 text-violet-800 ring-violet-500/25',
    cancelled: 'bg-rose-500/15 text-rose-800 ring-rose-500/25',
  };
  return map[status] || map.pending;
};

const priorityBadge = (priority: JobPriority) => {
  const map: Record<JobPriority, string> = {
    low: 'text-slate-500',
    normal: 'text-indigo-600',
    high: 'text-orange-600',
    urgent: 'text-rose-600 font-bold',
  };
  return map[priority] || map.normal;
};

const INSPECTION_QUICK_NOTES = [
  'Engine & fluids checked',
  'Brakes & suspension checked',
  'Electrical & battery checked',
  'Tyres & wheels checked',
  'Body & paint inspected',
  'Interior & A/C checked',
  'Road test completed',
  'No immediate issues found',
];

const STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

type ListFilter = 'active' | 'pending' | 'in_progress' | 'on_hold' | 'all';
type DocumentType = 'quotation' | 'invoice';
type ViewDocsTab = 'all' | DocumentType;
type InvoicePaymentTiming = 'credit' | 'pay_now';

const INVOICE_PAYMENT_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
] as const;

interface JobCardDocumentRecord {
  id: number;
  document_type: DocumentType;
  document_number: string;
  document_date: string;
  status: string;
  total_amount: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_status?: string;
  payment_timing?: InvoicePaymentTiming;
  valid_until?: string | null;
  due_date?: string | null;
  created_at?: string;
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
  quantity: number;
  unitPrice: number;
  inventoryItemId: number | null;
}

const createDocLine = (
  id: number,
  description = '',
  quantity = 1,
  unitPrice = 0,
  inventoryItemId: number | null = null
): DocLineRow => ({
  id,
  description,
  quantity,
  unitPrice,
  inventoryItemId,
});

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

const buildDefaultDocLines = (job: JobCardRecord, type: DocumentType): DocLineRow[] => {
  const vehicle = [job.brand, job.model].filter(Boolean).join(' ');
  const desc = vehicle
    ? `Service / repair – ${vehicle}${job.vehicle_no ? ` (${job.vehicle_no})` : ''}`
    : `Service / repair – ${job.job_card_number}`;
  const unitPrice =
    type === 'invoice' ? Number(job.estimated_cost) || 0 : 0;
  return [createDocLine(1, desc, 1, unitPrice)];
};

export default function JobCardsPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [records, setRecords] = useState<JobCardRecord[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({ active: 0, pending: 0, in_progress: 0, completed_today: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [perPage] = useState(15);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobCardRecord | null>(null);
  const [reviewInspection, setReviewInspection] = useState('');
  const [reviewTechnicianId, setReviewTechnicianId] = useState<number | ''>('');
  const [reviewInspectorId, setReviewInspectorId] = useState<number | ''>('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docJob, setDocJob] = useState<JobCardRecord | null>(null);
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
  const [docPaymentTiming, setDocPaymentTiming] = useState<InvoicePaymentTiming>('pay_now');
  const [docPaidAmount, setDocPaidAmount] = useState('0');
  const [docPaymentType, setDocPaymentType] = useState('cash');
  const [docPaymentReference, setDocPaymentReference] = useState('');
  const [storeItems, setStoreItems] = useState<InventoryItem[]>([]);
  const [docDropdownRowId, setDocDropdownRowId] = useState<number | null>(null);
  const [docDropdownSearch, setDocDropdownSearch] = useState<Record<number, string>>({});
  const [docDropdownHighlight, setDocDropdownHighlight] = useState<number>(-1);
  const [showViewDocsModal, setShowViewDocsModal] = useState(false);
  const [viewDocsJob, setViewDocsJob] = useState<JobCardRecord | null>(null);
  const [viewDocsList, setViewDocsList] = useState<JobCardDocumentRecord[]>([]);
  const [viewDocsLoading, setViewDocsLoading] = useState(false);
  const [viewDocsTab, setViewDocsTab] = useState<ViewDocsTab>('all');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [formMessageType, setFormMessageType] = useState<'success' | 'error' | ''>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [accessoriesReceived, setAccessoriesReceived] = useState('');
  const [inspectionReview, setInspectionReview] = useState('');
  const [inspectedByEmployeeId, setInspectedByEmployeeId] = useState<number | ''>('');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<number | ''>('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [promisedDate, setPromisedDate] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [notes, setNotes] = useState('');

  const searchInitialized = useRef(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) setToken(storedToken);
  }, []);

  const listParams = useMemo(() => {
    const params: Record<string, string | number | boolean> = {
      page: currentPage,
      per_page: perPage,
    };
    if (listFilter === 'active') {
      params.pending_only = true;
    } else if (listFilter === 'all') {
      params.pending_only = false;
    } else {
      params.pending_only = false;
      params.status = listFilter;
    }
    const term = listSearch.trim();
    if (term) params.search = term;
    return params;
  }, [currentPage, perPage, listFilter, listSearch]);

  const fetchSummary = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/api/job-cards/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setSummary(res.data.data);
    } catch (error) {
      console.error('Error fetching job card summary:', error);
    }
  };

  const fetchRecords = async (page = currentPage) => {
    if (!token) return;
    try {
      setListLoading(true);
      const res = await axios.get(`${API_URL}/api/job-cards`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { ...listParams, page },
      });
      const payload = res.data?.success ? res.data.data : res.data;
      const rows = Array.isArray(payload) ? payload : payload?.data || [];
      setRecords(rows as JobCardRecord[]);
      setLastPage(Number(payload?.last_page) || 1);
      setTotalRecords(Number(payload?.total) || rows.length);
    } catch (error) {
      console.error('Error fetching job cards:', error);
      setRecords([]);
      setLastPage(1);
      setTotalRecords(0);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    const loadEmployees = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/hr/employees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setEmployees(
          rows.map((e: EmployeeOption) => ({
            id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            employee_code: e.employee_code,
          }))
        );
      } catch (error) {
        console.error('Error fetching employees:', error);
        setEmployees([]);
      }
    };
    loadEmployees();

    const loadStoreItems = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 },
        });
        const rows = res.data?.success
          ? res.data?.data?.data || res.data?.data || []
          : [];
        setStoreItems(
          (Array.isArray(rows) ? rows : []).map((item: InventoryItem) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            sell_price: 0,
            unit_price: Number(item.unit_price) || 0,
            current_stock: Number(item.current_stock) || 0,
            unit: item.unit || '',
          }))
        );
      } catch (error) {
        console.error('Error fetching store items:', error);
        setStoreItems([]);
      }
    };
    loadStoreItems();
    fetchSummary();
  }, [token]);

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

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setVehicleNo('');
    setChassisNo('');
    setBrand('');
    setModel('');
    setProblemDescription('');
    setAccessoriesReceived('');
    setInspectionReview('');
    setInspectedByEmployeeId('');
    setPriority('normal');
    setAssignedEmployeeId('');
    setReceivedDate(new Date().toISOString().split('T')[0]);
    setPromisedDate('');
    setEstimatedCost('');
    setAdvanceAmount('');
    setNotes('');
    setFormMessage('');
    setFormMessageType('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const extractApiError = (error: unknown, fallback = 'Failed to save job card.'): string => {
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

  const handleSave = async () => {
    if (!token) {
      setFormMessage('Please login again.');
      setFormMessageType('error');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !problemDescription.trim()) {
      setFormMessage('Customer name, phone, and problem description are required.');
      setFormMessageType('error');
      return;
    }

    try {
      setSaving(true);
      setFormMessage('');
      await axios.post(
        `${API_URL}/api/job-cards`,
        {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || null,
          vehicle_no: vehicleNo.trim().toUpperCase() || null,
          chassis_no: chassisNo.trim().toUpperCase() || null,
          brand: brand.trim() || null,
          model: model.trim() || null,
          problem_description: problemDescription.trim(),
          accessories_received: accessoriesReceived.trim() || null,
          inspection_review: inspectionReview.trim() || null,
          inspected_by_employee_id: inspectionReview.trim()
            ? inspectedByEmployeeId || assignedEmployeeId || null
            : null,
          priority,
          assigned_employee_id: assignedEmployeeId || null,
          received_date: receivedDate,
          promised_date: promisedDate || null,
          estimated_cost: estimatedCost ? Number(estimatedCost) : null,
          advance_amount: advanceAmount ? Number(advanceAmount) : null,
          notes: notes.trim() || null,
          status: 'pending',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFormMessage('Job card created successfully.');
      setFormMessageType('success');
      setShowCreateModal(false);
      setCurrentPage(1);
      await fetchRecords(1);
      await fetchSummary();
    } catch (error) {
      setFormMessage(extractApiError(error));
      setFormMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const appendInspectionNote = (current: string, note: string) => {
    const trimmed = current.trim();
    if (!trimmed) return note;
    if (trimmed.includes(note)) return trimmed;
    return `${trimmed}\n• ${note}`;
  };

  const handleTechnicianChange = async (jobCard: JobCardRecord, employeeId: number | '') => {
    if (!token) return;
    const nextId = employeeId || null;
    if ((jobCard.assigned_employee_id || null) === nextId) return;
    try {
      setUpdatingId(jobCard.id);
      await axios.put(
        `${API_URL}/api/job-cards/${jobCard.id}`,
        { assigned_employee_id: nextId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchRecords(currentPage);
    } catch (error) {
      console.error('Failed to assign technician:', error);
      alert(extractApiError(error, 'Failed to assign technician.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenReview = (job: JobCardRecord) => {
    setReviewJob(job);
    setReviewInspection(job.inspection_review || '');
    setReviewTechnicianId(job.assigned_employee_id || '');
    setReviewInspectorId(job.inspected_by_employee_id || job.assigned_employee_id || '');
    setShowReviewModal(true);
  };

  const handleSaveReview = async () => {
    if (!token || !reviewJob) return;
    if (!reviewInspection.trim()) {
      alert('Please enter an inspection review before saving.');
      return;
    }
    if (!reviewTechnicianId) {
      alert('Please assign a technician for this job.');
      return;
    }
    try {
      setReviewSaving(true);
      await axios.put(
        `${API_URL}/api/job-cards/${reviewJob.id}`,
        {
          inspection_review: reviewInspection.trim(),
          inspected_by_employee_id: reviewInspectorId || reviewTechnicianId,
          assigned_employee_id: reviewTechnicianId,
          status: reviewJob.status === 'pending' ? 'in_progress' : reviewJob.status,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowReviewModal(false);
      setReviewJob(null);
      setFormMessage('Inspection review and technician assignment saved.');
      setFormMessageType('success');
      await fetchRecords(currentPage);
      await fetchSummary();
    } catch (error) {
      alert(extractApiError(error, 'Failed to save inspection review.'));
    } finally {
      setReviewSaving(false);
    }
  };

  const getDocDropdownItems = (rowId: number): InventoryItem[] => {
    const search = (docDropdownSearch[rowId] || '').trim().toLowerCase();
    if (!search) return [];
    return storeItems
      .filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.code.toLowerCase().includes(search)
      )
      .slice(0, 10);
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

  const handleOpenDocument = async (job: JobCardRecord, type: DocumentType) => {
    const today = new Date().toISOString().split('T')[0];
    const validDefault = new Date();
    validDefault.setDate(validDefault.getDate() + 14);
    const dueDefault = new Date();
    dueDefault.setDate(dueDefault.getDate() + 7);

    setDocJob(job);
    setDocType(type);
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
    setDocPaymentTiming('pay_now');
    setDocPaymentType('cash');
    setDocPaymentReference('');
    setDocPaidAmount('0');

    if (type === 'invoice' && token) {
      try {
        const res = await axios.get(`${API_URL}/api/job-cards/${job.id}/documents/latest-quotation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const quotation = res.data?.data;
        if (quotation?.items?.length) {
          setDocSourceId(quotation.id);
          const quotLines = quotation.items.map((item: any, index: number) => {
            const desc = String(item.description || '');
            return createDocLine(
              index + 1,
              desc,
              Number(item.quantity) || 1,
              Number(item.unit_price) || 0,
              item.inventory_item_id
                ? Number(item.inventory_item_id)
                : resolveInventoryIdFromDescription(desc, storeItems)
            );
          });
          setDocLines(quotLines);
          const initSearch: Record<number, string> = {};
          quotLines.forEach((l: DocLineRow) => { initSearch[l.id] = l.description; });
          setDocDropdownSearch(initSearch);
          setDocDiscount(String(quotation.discount_amount || 0));
          setDocTax(String(quotation.tax_amount || 0));
          setDocNotes(quotation.notes ? `From quotation ${quotation.document_number}\n${quotation.notes}` : `From quotation ${quotation.document_number}`);
          setShowDocModal(true);
          return;
        }
      } catch (error) {
        console.error('Could not load quotation for invoice:', error);
      }
    }

    const defaultLines = buildDefaultDocLines(job, type);
    setDocLines(defaultLines);
    const initSearch: Record<number, string> = {};
    defaultLines.forEach((l) => { initSearch[l.id] = l.description; });
    setDocDropdownSearch(initSearch);
    setShowDocModal(true);
  };

  const updateDocLine = (rowId: number, patch: Partial<DocLineRow>) => {
    setDocLines((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
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
    if (docDropdownRowId === rowId) setDocDropdownRowId(null);
  };

  const handleSaveDocument = async () => {
    if (!token || !docJob) return;
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
        discount_amount: Number(docDiscount) || 0,
        tax_amount: Number(docTax) || 0,
        notes: docNotes.trim() || null,
        items: validLines.map((row) => ({
          description: row.description.trim(),
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

      const res = await axios.post(`${API_URL}/api/job-cards/${docJob.id}/documents`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const saved = res.data?.data;
      setShowDocModal(false);
      setDocJob(null);
      let successMsg = `${docType === 'quotation' ? 'Quotation' : 'Invoice'} ${saved?.document_number || ''} created.`;
      if (docType === 'invoice' && Number(saved?.balance_amount) > 0) {
        successMsg += ` Customer outstanding: LKR ${money(Number(saved.balance_amount))}.`;
      }
      setFormMessage(successMsg);
      setFormMessageType('success');

      if (saved?.id) {
        window.open(`/dashboard/job-cards/documents/${saved.id}/print`, '_blank');
      }

      if (docType === 'invoice' && token) {
        try {
          const res = await axios.get(`${API_URL}/api/stock/inventory`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1000 },
          });
          const rows = res.data?.success
            ? res.data?.data?.data || res.data?.data || []
            : [];
          setStoreItems(
            (Array.isArray(rows) ? rows : []).map((item: InventoryItem) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              sell_price: 0,
              unit_price: Number(item.unit_price) || 0,
              current_stock: Number(item.current_stock) || 0,
              unit: item.unit || '',
            }))
          );
        } catch {
          /* stock refresh is best-effort */
        }
      }
    } catch (error) {
      alert(extractApiError(error, `Failed to create ${docType}.`));
    } finally {
      setDocSaving(false);
    }
  };

  const fetchJobDocuments = async (jobId: number) => {
    if (!token) return [];
    const res = await axios.get(`${API_URL}/api/job-cards/${jobId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (res.data?.data || []) as JobCardDocumentRecord[];
  };

  const handleOpenViewDocuments = async (job: JobCardRecord, tab: ViewDocsTab = 'all') => {
    setViewDocsJob(job);
    setViewDocsTab(tab);
    setShowViewDocsModal(true);
    setViewDocsLoading(true);
    setViewDocsList([]);
    try {
      setViewDocsList(await fetchJobDocuments(job.id));
    } catch (error) {
      console.error('Error fetching job card documents:', error);
      alert(extractApiError(error, 'Failed to load documents.'));
    } finally {
      setViewDocsLoading(false);
    }
  };

  const filteredViewDocs = useMemo(() => {
    if (viewDocsTab === 'all') return viewDocsList;
    return viewDocsList.filter((d) => d.document_type === viewDocsTab);
  }, [viewDocsList, viewDocsTab]);

  const viewDocsCounts = useMemo(
    () => ({
      all: viewDocsList.length,
      quotation: viewDocsList.filter((d) => d.document_type === 'quotation').length,
      invoice: viewDocsList.filter((d) => d.document_type === 'invoice').length,
    }),
    [viewDocsList]
  );

  const openDocumentPrint = (docId: number) => {
    window.open(`/dashboard/job-cards/documents/${docId}/print`, '_blank');
  };

  const fmtDocDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleStatusChange = async (jobCard: JobCardRecord, newStatus: JobStatus) => {
    if (!token || jobCard.status === newStatus) return;
    try {
      setUpdatingId(jobCard.id);
      await axios.put(
        `${API_URL}/api/job-cards/${jobCard.id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchRecords(currentPage);
      await fetchSummary();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert(extractApiError(error, 'Failed to update status.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const filterPills: Array<{ value: ListFilter; label: string }> = [
    { value: 'active', label: 'All Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'all', label: 'All Records' },
  ];

  return (
    <div className="space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-950 to-purple-900 px-6 py-8 shadow-2xl shadow-indigo-900/30 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-indigo-400/15 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-indigo-100 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
              Service · Job Cards
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Job Card Management</h1>
            <p className="mt-3 text-sm leading-relaxed text-indigo-100/90 sm:text-base">
              Register vehicle service jobs, track pending work, and assign technicians from one workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-4 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/15 text-lg">+</span>
            New Job Card
          </button>
        </div>
      </section>

      {formMessage && formMessageType === 'success' && !showCreateModal && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 shadow-sm">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm text-white">✓</span>
          <p className="text-sm font-medium text-emerald-900">{formMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Active Jobs', value: String(summary.active), hint: 'Pending + in progress + on hold', icon: '🔧', accent: 'from-indigo-500 to-violet-600' },
          { label: 'Pending', value: String(summary.pending), hint: 'Awaiting start', icon: '⏳', accent: 'from-amber-500 to-orange-500' },
          { label: 'In Progress', value: String(summary.in_progress), hint: 'Currently working', icon: '⚡', accent: 'from-sky-500 to-blue-600' },
          { label: 'Completed Today', value: String(summary.completed_today), hint: 'Finished today', icon: '✅', accent: 'from-emerald-500 to-teal-600' },
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
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-xl">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
        <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/40 px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Pending Job Cards</h2>
              <p className="mt-1 text-sm text-slate-500">
                {totalRecords} record{totalRecords !== 1 ? 's' : ''} · Page {currentPage} of {lastPage}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search vehicle no, chassis, customer..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-none sm:w-72"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
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
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200'
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
                <th className="px-5 py-3.5">Job Card</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Vehicle</th>
                <th className="px-5 py-3.5">Problem</th>
                <th className="px-5 py-3.5">Technician</th>
                <th className="px-5 py-3.5">Inspection</th>
                <th className="px-5 py-3.5">Received</th>
                <th className="px-5 py-3.5">Est. Cost</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={10} className="px-5 py-4">
                      <div className="h-4 rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 text-3xl">
                        🔧
                      </div>
                      <p className="font-semibold text-slate-800">No job cards in this view</p>
                      <p className="mt-1 text-sm text-slate-500">Create a new job card to start tracking work.</p>
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                      >
                        New Job Card
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                records.map((job, index) => {
                  const received = job.received_date
                    ? new Date(job.received_date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const vehicleLabel = [job.brand, job.model].filter(Boolean).join(' ') || '—';
                  const initial = job.customer_name?.charAt(0)?.toUpperCase() || '?';

                  return (
                    <tr
                      key={job.id}
                      className={`transition-colors hover:bg-indigo-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-mono text-sm font-bold text-indigo-700">{job.job_card_number}</p>
                        <p className={`mt-0.5 text-xs font-semibold capitalize ${priorityBadge(job.priority)}`}>
                          {job.priority} priority
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                            {initial}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{job.customer_name}</p>
                            <p className="text-xs text-slate-500">{job.customer_phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {job.vehicle_no && (
                          <p className="font-mono text-sm font-bold text-slate-800">{job.vehicle_no}</p>
                        )}
                        <p className={job.vehicle_no ? 'mt-0.5 text-slate-600' : ''}>{vehicleLabel}</p>
                        {job.chassis_no && (
                          <p className="mt-0.5 font-mono text-xs text-slate-400">Chassis: {job.chassis_no}</p>
                        )}
                        {!job.vehicle_no && !job.chassis_no && vehicleLabel === '—' && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-5 py-4">
                        <p className="line-clamp-2 text-sm text-slate-600" title={job.problem_description}>
                          {job.problem_description}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={job.assigned_employee_id || ''}
                          disabled={updatingId === job.id}
                          onChange={(e) =>
                            handleTechnicianChange(job, e.target.value ? Number(e.target.value) : '')
                          }
                          className="w-full min-w-[130px] rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-6 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="">Assign technician...</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {employeeName(emp)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        {job.inspection_review ? (
                          <div>
                            <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/25">
                              Reviewed
                            </span>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={job.inspection_review}>
                              {job.inspection_review}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">Pending review</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{received}</td>
                      <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                        {job.estimated_cost != null ? money(Number(job.estimated_cost)) : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={job.status}
                          disabled={updatingId === job.id}
                          onChange={(e) => handleStatusChange(job, e.target.value as JobStatus)}
                          className={`rounded-lg border-0 py-1.5 pl-2 pr-7 text-xs font-semibold capitalize ring-1 ring-inset focus:ring-2 focus:ring-indigo-300 ${statusBadge(job.status)}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[148px] flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenReview(job)}
                            className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                          >
                            {job.inspection_review ? 'Edit Review' : 'Add Review'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDocument(job, 'quotation')}
                            className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                          >
                            Make Quotation
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDocument(job, 'invoice')}
                            className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            Make Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenViewDocuments(job)}
                            className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View QT / Invoice
                          </button>
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
            Showing <span className="font-semibold text-slate-900">{records.length}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalRecords}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-semibold text-slate-700">
              {currentPage} / {lastPage}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(lastPage, p + 1))}
              disabled={currentPage >= lastPage || listLoading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="relative shrink-0 overflow-hidden border-b border-indigo-100/80 bg-gradient-to-r from-indigo-950 via-violet-950 to-purple-900 px-6 py-5 sm:px-8">
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200/80">New job</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">Create Job Card</h3>
                  <p className="mt-1 text-sm text-indigo-100/80">Customer & vehicle details for service tracking</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white hover:bg-white/20"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-6 bg-gradient-to-b from-slate-50/80 to-white p-5 sm:p-7">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-700">Customer</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass} placeholder="Customer name" />
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={fieldClass} placeholder="07X XXX XXXX" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Email</label>
                    <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={fieldClass} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-indigo-100/80 bg-indigo-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg text-white shadow-md">
                    🚗
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Vehicle Details</h4>
                    <p className="text-xs text-slate-500">Registration, chassis, make & model</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Vehicle No</label>
                    <input
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                      className={`${fieldClass} font-mono uppercase tracking-wide`}
                      placeholder="e.g. CAB-1234"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Chassis No</label>
                    <input
                      value={chassisNo}
                      onChange={(e) => setChassisNo(e.target.value.toUpperCase())}
                      className={`${fieldClass} font-mono uppercase tracking-wide`}
                      placeholder="VIN / chassis number"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <input
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Toyota, Honda"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Model</label>
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Corolla, Civic"
                    />
                  </div>
                </div>
                {(vehicleNo || chassisNo || brand || model) && (
                  <div className="mx-5 mb-5 rounded-xl border border-indigo-100 bg-white/80 px-4 py-3 text-sm text-slate-700">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Preview</span>
                    <p className="mt-1 font-medium">
                      {[vehicleNo, [brand, model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {chassisNo && <p className="mt-0.5 font-mono text-xs text-slate-500">Chassis: {chassisNo}</p>}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-700">Job Details</h4>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Problem Description *</label>
                    <textarea
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                      rows={3}
                      className={fieldClass}
                      placeholder="Describe the issue reported by customer..."
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Accessories Received</label>
                    <input
                      value={accessoriesReceived}
                      onChange={(e) => setAccessoriesReceived(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. keys, spare wheel, jack, tool kit, floor mats, fuel cap"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      List items handed over with the vehicle (keys, documents, spare parts, etc.)
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Priority</label>
                      <select value={priority} onChange={(e) => setPriority(e.target.value as JobPriority)} className={fieldClass}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Received Date *</label>
                      <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Promised Date</label>
                      <input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Estimated Cost (LKR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={estimatedCost}
                        onChange={(e) => setEstimatedCost(e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Advance (LKR)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Internal Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClass} placeholder="Optional notes" />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-indigo-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-sky-100/80 bg-sky-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 text-lg text-white shadow-md">
                    👷
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Assign Technician</h4>
                    <p className="text-xs text-slate-500">Select who will carry out the repair work</p>
                  </div>
                </div>
                <div className="p-5">
                  <label className={labelClass}>Technician for this job</label>
                  <select
                    value={assignedEmployeeId}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : '';
                      setAssignedEmployeeId(id);
                      if (id && !inspectedByEmployeeId) setInspectedByEmployeeId(id);
                    }}
                    className={fieldClass}
                  >
                    <option value="">Select technician...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {employeeName(emp)}
                        {emp.employee_code ? ` (${emp.employee_code})` : ''}
                      </option>
                    ))}
                  </select>
                  {!assignedEmployeeId && (
                    <p className="mt-2 text-xs text-amber-700">You can assign now or later from the job list.</p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 shadow-sm">
                <div className="flex items-center gap-3 border-b border-emerald-100/80 bg-emerald-950/5 px-5 py-3.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-lg text-white shadow-md">
                    🔍
                  </span>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Inspection Review</h4>
                    <p className="text-xs text-slate-500">Initial vehicle inspection findings (optional at intake)</p>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label className={labelClass}>Inspector</label>
                    <select
                      value={inspectedByEmployeeId}
                      onChange={(e) => setInspectedByEmployeeId(e.target.value ? Number(e.target.value) : '')}
                      className={fieldClass}
                      disabled={!inspectionReview.trim()}
                    >
                      <option value="">Same as assigned technician</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {employeeName(emp)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {INSPECTION_QUICK_NOTES.map((note) => (
                      <button
                        key={note}
                        type="button"
                        onClick={() => setInspectionReview((prev) => appendInspectionNote(prev, note))}
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
                      >
                        + {note}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className={labelClass}>Review Notes</label>
                    <textarea
                      value={inspectionReview}
                      onChange={(e) => setInspectionReview(e.target.value)}
                      rows={4}
                      className={fieldClass}
                      placeholder="e.g. Front brake pads worn, engine oil low, battery terminals corroded..."
                    />
                  </div>
                </div>
              </div>

              {formMessage && formMessageType === 'error' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formMessage}</div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex min-w-[140px] items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving...
                  </span>
                ) : (
                  'Save Job Card'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && docJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div
              className={`shrink-0 border-b px-6 py-5 sm:px-8 ${
                docType === 'quotation'
                  ? 'border-violet-100 bg-gradient-to-r from-violet-900 to-indigo-900'
                  : 'border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-900'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                    {docType === 'quotation' ? 'Quotation' : 'Invoice'}
                  </p>
                  <h3 className="mt-1 text-2xl font-bold text-white">
                    {docType === 'quotation' ? 'Make Quotation' : 'Make Invoice'}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">
                    {docJob.job_card_number} · {docJob.customer_name}
                    {docSourceId && docType === 'invoice' ? ' · from latest quotation' : ''}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Document Date</label>
                  <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className={fieldClass} />
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
                    <input type="date" value={docDueDate} onChange={(e) => setDocDueDate(e.target.value)} className={fieldClass} />
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

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Line Items</h4>
                    {docType === 'quotation' && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Enter prices manually — job estimate is not applied to quotations.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addDocLine}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left text-xs font-bold uppercase text-slate-500">
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 w-24">Qty</th>
                        <th className="px-3 py-2 w-32">Unit (LKR)</th>
                        <th className="px-3 py-2 w-32 text-right">Total</th>
                        <th className="px-3 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {docLines.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2 relative">
                            <input
                              value={docDropdownSearch[row.id] ?? row.description}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDocDropdownSearch((prev) => ({ ...prev, [row.id]: val }));
                                updateDocLine(row.id, { description: val, inventoryItemId: null });
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                              }}
                              onFocus={() => {
                                setDocDropdownRowId(row.id);
                                setDocDropdownHighlight(-1);
                              }}
                              onBlur={() => {
                                setTimeout(() => setDocDropdownRowId(null), 150);
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
                            {docDropdownRowId === row.id && getDocDropdownItems(row.id).length > 0 && (
                              <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-xl border border-indigo-100 bg-white shadow-xl max-h-52 overflow-y-auto">
                                {getDocDropdownItems(row.id).map((item, idx) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onMouseDown={() => handleDocItemSelect(row.id, item)}
                                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors ${
                                      docDropdownHighlight === idx
                                        ? 'bg-indigo-50 text-indigo-900'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="text-sm font-semibold text-slate-800">
                                      {item.code} — {item.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Stock: {item.current_stock} {item.unit}
                                      {item.unit_price > 0 && <span className="ml-2">· Price: LKR {item.unit_price.toFixed(2)}</span>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
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
                    Credit or unpaid balance is added to the customer&apos;s outstanding by phone number.
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
                      <p className="text-xs text-slate-500">Full or partial — balance goes to outstanding</p>
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
                      <p className="text-xs text-slate-500">Full invoice amount to customer outstanding</p>
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
                      { label: 'To Outstanding', value: `LKR ${money(docInvoiceBalance)}`, highlight: true },
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
                          tile.highlight
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{tile.label}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{tile.value}</p>
                      </div>
                    ))}
                  </div>

                  {docInvoiceBalance > 0 && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                      <span className="font-bold">LKR {money(docInvoiceBalance)}</span> will be added to{' '}
                      <span className="font-bold">{docJob.customer_name}</span> ({docJob.customer_phone}) outstanding.
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
                disabled={docSaving}
                className={`inline-flex min-w-[160px] items-center justify-center rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60 ${
                  docType === 'quotation'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
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

      {showViewDocsModal && viewDocsJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
                    Quotations &amp; Invoices
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-white">{viewDocsJob.job_card_number}</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {viewDocsJob.customer_name}
                    {viewDocsJob.vehicle_no ? ` · ${viewDocsJob.vehicle_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowViewDocsModal(false);
                    setViewDocsJob(null);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-b border-slate-100 bg-slate-50 px-6 py-3">
              {(
                [
                  { key: 'all' as ViewDocsTab, label: 'All', count: viewDocsCounts.all },
                  { key: 'quotation' as ViewDocsTab, label: 'Quotations', count: viewDocsCounts.quotation },
                  { key: 'invoice' as ViewDocsTab, label: 'Invoices', count: viewDocsCounts.invoice },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setViewDocsTab(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewDocsTab === tab.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      viewDocsTab === tab.key ? 'bg-white/20' : 'bg-slate-100'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {viewDocsLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading documents…</p>
              ) : filteredViewDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    No {viewDocsTab === 'all' ? 'documents' : viewDocsTab === 'quotation' ? 'quotations' : 'invoices'}{' '}
                    for this job card yet.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewDocsModal(false);
                        handleOpenDocument(viewDocsJob, 'quotation');
                      }}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
                    >
                      Make Quotation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewDocsModal(false);
                        handleOpenDocument(viewDocsJob, 'invoice');
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Make Invoice
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredViewDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              doc.document_type === 'quotation'
                                ? 'bg-violet-500/15 text-violet-800 ring-1 ring-violet-500/25'
                                : 'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25'
                            }`}
                          >
                            {doc.document_type === 'quotation' ? 'Quotation' : 'Invoice'}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-900">{doc.document_number}</span>
                          <span className="text-xs capitalize text-slate-500">{doc.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Date: {fmtDocDate(doc.document_date)}
                          {doc.document_type === 'quotation' && doc.valid_until
                            ? ` · Valid until ${fmtDocDate(doc.valid_until)}`
                            : ''}
                          {doc.document_type === 'invoice' && doc.due_date
                            ? ` · Due ${fmtDocDate(doc.due_date)}`
                            : ''}
                          {doc.document_type === 'invoice' && (
                            <>
                              {' · '}
                              Paid LKR {money(Number(doc.paid_amount || 0))}
                              {Number(doc.balance_amount) > 0
                                ? ` · Balance LKR ${money(Number(doc.balance_amount))}`
                                : ''}
                              {doc.payment_status ? ` · ${doc.payment_status}` : ''}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900">LKR {money(Number(doc.total_amount))}</span>
                        <button
                          type="button"
                          onClick={() => openDocumentPrint(doc.id)}
                          className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          View / Print
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  handleOpenDocument(viewDocsJob, 'quotation');
                }}
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100"
              >
                + Quotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  handleOpenDocument(viewDocsJob, 'invoice');
                }}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                + Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowViewDocsModal(false);
                  setViewDocsJob(null);
                }}
                className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && reviewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="shrink-0 border-b border-emerald-100 bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/90">Inspection</p>
                  <h3 className="mt-1 text-xl font-bold text-white">{reviewJob.job_card_number}</h3>
                  <p className="mt-1 text-sm text-emerald-100/90">
                    {reviewJob.customer_name}
                    {reviewJob.vehicle_no ? ` · ${reviewJob.vehicle_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-6">
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                <label className={labelClass}>Assign technician for work *</label>
                <select
                  value={reviewTechnicianId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setReviewTechnicianId(id);
                    if (id && !reviewInspectorId) setReviewInspectorId(id);
                  }}
                  className={fieldClass}
                >
                  <option value="">Select technician...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {employeeName(emp)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Inspector</label>
                <select
                  value={reviewInspectorId}
                  onChange={(e) => setReviewInspectorId(e.target.value ? Number(e.target.value) : '')}
                  className={fieldClass}
                >
                  <option value="">Same as technician</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {employeeName(emp)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {INSPECTION_QUICK_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setReviewInspection((prev) => appendInspectionNote(prev, note))}
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    + {note}
                  </button>
                ))}
              </div>

              <div>
                <label className={labelClass}>Inspection review *</label>
                <textarea
                  value={reviewInspection}
                  onChange={(e) => setReviewInspection(e.target.value)}
                  rows={5}
                  className={fieldClass}
                  placeholder="Document inspection findings, recommended repairs, and parts needed..."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Reported problem</p>
                <p className="mt-1">{reviewJob.problem_description}</p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={reviewSaving}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={reviewSaving}
                className="inline-flex min-w-[160px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
              >
                {reviewSaving ? 'Saving...' : 'Save Review & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
