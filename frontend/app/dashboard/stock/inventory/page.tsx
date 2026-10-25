'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const GLOBAL_WIDGET_FIX_KEY = 'widgets_fixed_global';
const INVENTORY_MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;
const SUPPLIERS_MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;

interface InventoryItem {
  id: number;
  name: string;
  code: string;
  description: string;
  type: 'raw_material' | 'finished_good';
  category: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit_price: number;
  purchase_price?: number | null;
  sell_price?: number | null;
  supplier_name: string | null;
  supplier_id: number | null;
  location: string;
  expiry_date: string | null;
  status: 'active' | 'inactive';
  additional_info?: {
    store_tag?: string;
    stock_source?: string;
    last_batch_no?: string;
    last_packaging_batch_id?: number;
    last_label_code?: string;
    last_barcode_value?: string;
    last_qr_value?: string;
    last_synced_at?: string;
    last_batch_unit_price?: number;
    last_batch_expiry_date?: string;
    lastPackagingBatchId?: number;
    lastBatchNo?: string;
    lastLabelCode?: string;
    lastBarcodeValue?: string;
    lastQrValue?: string;
    lastSyncedAt?: string;
  };
  supplier?: {
    id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

type StockStateFilter = 'all' | 'out_of_stock' | 'low_stock' | 'healthy_stock' | 'over_stock';

export default function Inventory() {
  const [token, setToken] = useState('');
  const [canManageFeatureVisibility, setCanManageFeatureVisibility] = useState(false);
  const [widgetsFixed, setWidgetsFixed] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [activeTab] = useState<'raw_material' | 'finished_good'>('finished_good');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSupplierId, setImportSupplierId] = useState('');
  const [importUseDiscount, setImportUseDiscount] = useState(false);
  const [importDiscountMode, setImportDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [importDiscountValue, setImportDiscountValue] = useState('');
  const [importUseProfit, setImportUseProfit] = useState(false);
  const [importProfitMode, setImportProfitMode] = useState<'amount' | 'percent'>('amount');
  const [importProfitValue, setImportProfitValue] = useState('');
  const [importSummary, setImportSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importProgressPhase, setImportProgressPhase] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    type: 'raw_material' as 'raw_material' | 'finished_good',
    category: '',
    unit: '',
    current_stock: 0,
    minimum_stock: 0,
    maximum_stock: 0,
    unit_price: 0,
    supplier_name: '',
    supplier_id: '',
    location: '',
    expiry_date: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState<InventoryItem | null>(null);
  const [showItemDetailsModal, setShowItemDetailsModal] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [stockStateFilter, setStockStateFilter] = useState<StockStateFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [loadedItemsCount, setLoadedItemsCount] = useState(0);
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const fetchRunIdRef = useRef(0);
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
      console.error('Error fetching stock inventory visibility profile:', error);
      setCanManageFeatureVisibility(false);
      setHiddenModules([]);
    }
  };

  const handleInventoryVisibilityToggle = async (moduleKey: string, hidden: boolean) => {
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
      console.error('Error updating stock inventory widget visibility:', error);
    }
  };

  const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolveItemPrice = (item: Partial<InventoryItem> | null | undefined): number => {
    if (!item) return 0;
    const unitPrice = toSafeNumber(item.unit_price);
    const purchasePrice = toSafeNumber(item.purchase_price);
    const sellPrice = toSafeNumber(item.sell_price);

    if (unitPrice > 0) return unitPrice;
    if (purchasePrice > 0) return purchasePrice;
    if (sellPrice > 0) return sellPrice;
    return unitPrice || purchasePrice || sellPrice || 0;
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
      fetchItems();
    }
  }, [token, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, supplierFilter, statusFilter, stockStateFilter]);

  const readSuppliersMemoryCache = (): any[] | null => {
    if (!suppliersMemoryCache) return null;
    const isFresh = Date.now() - suppliersMemoryCache.timestamp < SUPPLIERS_MEMORY_CACHE_TTL_MS;
    return isFresh ? suppliersMemoryCache.suppliers : null;
  };

  const writeSuppliersMemoryCache = (supplierList: any[]) => {
    suppliersMemoryCache = {
      timestamp: Date.now(),
      suppliers: supplierList,
    };
  };

  const readInventoryMemoryCache = (type: 'raw_material' | 'finished_good'): InventoryMemoryCacheEntry | null => {
    const cached = inventoryMemoryCache[type];
    if (!cached) return null;
    const isFresh = Date.now() - cached.timestamp < INVENTORY_MEMORY_CACHE_TTL_MS;
    return isFresh ? cached : null;
  };

  const writeInventoryMemoryCache = (
    type: 'raw_material' | 'finished_good',
    payload: {
      items: InventoryItem[];
      loadedItemsCount: number;
      totalItemsCount: number;
      isBackgroundLoading: boolean;
    }
  ) => {
    inventoryMemoryCache[type] = {
      timestamp: Date.now(),
      items: payload.items,
      loadedItemsCount: payload.loadedItemsCount,
      totalItemsCount: payload.totalItemsCount,
      isBackgroundLoading: payload.isBackgroundLoading,
    };
  };

  const fetchSuppliers = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cachedSuppliers = readSuppliersMemoryCache();
      if (cachedSuppliers) {
        setSuppliers(cachedSuppliers);
        return;
      }
    }

    try {
      const response = await axios.get(`${API_URL}/api/stock/suppliers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 }
      });

      if (response.data.success) {
        const supplierList = response.data.data.data || [];
        setSuppliers(supplierList);
        writeSuppliersMemoryCache(supplierList);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchItems = async (forceRefresh = false) => {
    const runId = ++fetchRunIdRef.current;

    const formatItems = (source: any[]) =>
      source.map((item: any) => ({
        ...item,
        current_stock: toSafeNumber(item.current_stock),
        minimum_stock: toSafeNumber(item.minimum_stock),
        maximum_stock: toSafeNumber(item.maximum_stock),
        purchase_price: toSafeNumber(item.purchase_price),
        sell_price: toSafeNumber(item.sell_price),
        unit_price: resolveItemPrice(item),
      }));

    const mergeById = (base: InventoryItem[], incoming: InventoryItem[]) => {
      const merged = new Map<number, InventoryItem>();
      base.forEach((item) => merged.set(item.id, item));
      incoming.forEach((item) => merged.set(item.id, item));
      return Array.from(merged.values());
    };

    if (!forceRefresh) {
      const cachedItems = readInventoryMemoryCache(activeTab);
      if (cachedItems) {
        setItems(cachedItems.items);
        setLoadedItemsCount(cachedItems.loadedItemsCount);
        setTotalItemsCount(cachedItems.totalItemsCount);
        setIsBackgroundLoading(cachedItems.isBackgroundLoading);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      setIsBackgroundLoading(false);
      setLoadedItemsCount(0);
      setTotalItemsCount(0);

      const initialPageSize = 100;
      const initialResponse = await axios.get(`${API_URL}/api/stock/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { type: activeTab, per_page: initialPageSize, page: 1 }
      });

      if (runId !== fetchRunIdRef.current) {
        return;
      }

      if (initialResponse.data?.success) {
        const pagePayload = initialResponse.data?.data;
        const firstPageItems = Array.isArray(pagePayload?.data)
          ? pagePayload.data
          : Array.isArray(pagePayload)
            ? pagePayload
            : [];

        const formattedFirstPage = formatItems(firstPageItems);
        setItems(formattedFirstPage);

        const resolvedTotalItems = Number(pagePayload?.total || formattedFirstPage.length || 0);
        const safeTotalItems = Number.isFinite(resolvedTotalItems) ? Math.max(0, resolvedTotalItems) : formattedFirstPage.length;
        setLoadedItemsCount(formattedFirstPage.length);
        setTotalItemsCount(safeTotalItems);

        const payloadLastPage = Number(pagePayload?.last_page || 1);
        const lastPage = Number.isFinite(payloadLastPage) && payloadLastPage > 0
          ? payloadLastPage
          : Math.max(1, Math.ceil(safeTotalItems / initialPageSize));

        writeInventoryMemoryCache(activeTab, {
          items: formattedFirstPage,
          loadedItemsCount: formattedFirstPage.length,
          totalItemsCount: safeTotalItems,
          isBackgroundLoading: lastPage > 1,
        });

        // Show first 100 quickly, then continue loading in background.
        if (lastPage > 1) {
          setIsBackgroundLoading(true);
          setLoading(false);

          let loadedSoFar = formattedFirstPage.length;
          let mergedItems = formattedFirstPage;

          for (let page = 2; page <= lastPage; page++) {
            if (runId !== fetchRunIdRef.current) {
              return;
            }

            try {
              const pageResponse = await axios.get(`${API_URL}/api/stock/inventory`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { type: activeTab, per_page: initialPageSize, page }
              });

              if (!pageResponse.data?.success) {
                continue;
              }

              const nextPayload = pageResponse.data?.data;
              const nextRows = Array.isArray(nextPayload?.data)
                ? nextPayload.data
                : Array.isArray(nextPayload)
                  ? nextPayload
                  : [];
              const formattedNextRows = formatItems(nextRows);

              mergedItems = mergeById(mergedItems, formattedNextRows);
              setItems(mergedItems);
              loadedSoFar += formattedNextRows.length;
              setLoadedItemsCount(loadedSoFar);

              writeInventoryMemoryCache(activeTab, {
                items: mergedItems,
                loadedItemsCount: loadedSoFar,
                totalItemsCount: safeTotalItems,
                isBackgroundLoading: true,
              });
            } catch (backgroundError) {
              console.error(`Background inventory load failed on page ${page}:`, backgroundError);
            }
          }

          if (runId === fetchRunIdRef.current) {
            setIsBackgroundLoading(false);
            writeInventoryMemoryCache(activeTab, {
              items: mergedItems,
              loadedItemsCount: mergedItems.length,
              totalItemsCount: safeTotalItems,
              isBackgroundLoading: false,
            });
          }

          return;
        }

        writeInventoryMemoryCache(activeTab, {
          items: formattedFirstPage,
          loadedItemsCount: formattedFirstPage.length,
          totalItemsCount: safeTotalItems,
          isBackgroundLoading: false,
        });
      } else {
        setItems([]);
        writeInventoryMemoryCache(activeTab, {
          items: [],
          loadedItemsCount: 0,
          totalItemsCount: 0,
          isBackgroundLoading: false,
        });
      }
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      // Mock data for development
      const mockItems: InventoryItem[] = activeTab === 'raw_material' ? [
        {
          id: 1,
          name: 'Steel Rods',
          code: 'STL-001',
          description: 'High-quality steel rods for construction',
          type: 'raw_material',
          category: 'Metals',
          unit: 'kg',
          current_stock: 500,
          minimum_stock: 100,
          maximum_stock: 1000,
          unit_price: 250.00,
          supplier_name: 'ABC Supplies Ltd',
          supplier_id: 1,
          location: 'Warehouse A - Section 1',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          name: 'Cement Bags',
          code: 'CMT-001',
          description: 'Portland cement 50kg bags',
          type: 'raw_material',
          category: 'Construction Materials',
          unit: 'bags',
          current_stock: 200,
          minimum_stock: 50,
          maximum_stock: 500,
          unit_price: 850.00,
          supplier_name: 'Global Traders Inc',
          supplier_id: 2,
          location: 'Warehouse B - Section 2',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-20T14:30:00Z',
          updated_at: '2024-01-20T14:30:00Z'
        }
      ] : [
        {
          id: 3,
          name: 'Steel Door Frame',
          code: 'SDF-001',
          description: 'Pre-fabricated steel door frame',
          type: 'finished_good',
          category: 'Door Systems',
          unit: 'pieces',
          current_stock: 25,
          minimum_stock: 10,
          maximum_stock: 100,
          unit_price: 2500.00,
          supplier_name: null,
          supplier_id: null,
          location: 'Finished Goods Warehouse - Section A',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-25T09:00:00Z',
          updated_at: '2024-01-25T09:00:00Z'
        }
      ];
      setItems(mockItems);
    } finally {
      if (runId === fetchRunIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) return;

    try {
      setSaving(true);
      const submitData = {
        ...formData,
        type: activeTab,
        supplier_id: formData.supplier_id ? Number(formData.supplier_id) : null
      };

      if (editingItem) {
        const response = await axios.put(`${API_URL}/api/stock/inventory/${editingItem.id}`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setItems(prev => {
            const nextItems = prev.map(item =>
              item.id === editingItem.id
                ? {
                    ...response.data.data,
                    current_stock: toSafeNumber(response.data.data.current_stock),
                    minimum_stock: toSafeNumber(response.data.data.minimum_stock),
                    maximum_stock: toSafeNumber(response.data.data.maximum_stock),
                    purchase_price: toSafeNumber(response.data.data.purchase_price),
                    sell_price: toSafeNumber(response.data.data.sell_price),
                    unit_price: resolveItemPrice(response.data.data),
                  }
                : item
            );

            writeInventoryMemoryCache(activeTab, {
              items: nextItems,
              loadedItemsCount: nextItems.length,
              totalItemsCount: Math.max(totalItemsCount, nextItems.length),
              isBackgroundLoading: false,
            });

            return nextItems;
          });
        } else {
          throw new Error(response.data.message || 'Failed to update item');
        }
      } else {
        const response = await axios.post(`${API_URL}/api/stock/inventory`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setItems(prev => {
            const nextItems = [
              ...prev,
              {
                ...response.data.data,
                current_stock: toSafeNumber(response.data.data.current_stock),
                minimum_stock: toSafeNumber(response.data.data.minimum_stock),
                maximum_stock: toSafeNumber(response.data.data.maximum_stock),
                purchase_price: toSafeNumber(response.data.data.purchase_price),
                sell_price: toSafeNumber(response.data.data.sell_price),
                unit_price: resolveItemPrice(response.data.data),
              },
            ];

            writeInventoryMemoryCache(activeTab, {
              items: nextItems,
              loadedItemsCount: nextItems.length,
              totalItemsCount: Math.max(totalItemsCount, nextItems.length),
              isBackgroundLoading: false,
            });

            return nextItems;
          });
        } else {
          throw new Error(response.data.message || 'Failed to create item');
        }
      }

      setShowModal(false);
      setEditingItem(null);
      resetForm();
    } catch (error: any) {
      console.error('Error saving item:', error);
      alert(error.response?.data?.message || error.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description || '',
      type: item.type,
      category: item.category || '',
      unit: item.unit,
      current_stock: item.current_stock,
      minimum_stock: item.minimum_stock,
      maximum_stock: item.maximum_stock || 0,
      unit_price: item.unit_price,
      supplier_name: item.supplier_name || '',
      supplier_id: item.supplier_id?.toString() || '',
      location: item.location || '',
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
      status: item.status
    });
    setShowModal(true);
  };

  const openItemDetails = (item: InventoryItem) => {
    setSelectedItemDetails(item);
    setShowItemDetailsModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await axios.delete(`${API_URL}/api/stock/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setItems(prev => {
          const nextItems = prev.filter(item => item.id !== id);
          writeInventoryMemoryCache(activeTab, {
            items: nextItems,
            loadedItemsCount: nextItems.length,
            totalItemsCount: Math.min(totalItemsCount, nextItems.length),
            isBackgroundLoading: false,
          });
          return nextItems;
        });
        setDeleteConfirm(null);
      } else {
        throw new Error(response.data.message || 'Failed to delete item');
      }
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert(error.response?.data?.message || error.message || 'Failed to delete item');
    }
  };

  const resetForm = () => {
    setSkuManuallyEdited(false);
    setFormData({
      name: '',
      code: '',
      description: '',
      type: activeTab,
      category: '',
      unit: '',
      current_stock: 0,
      minimum_stock: 0,
      maximum_stock: 0,
      unit_price: 0,
      supplier_name: '',
      supplier_id: '',
      location: '',
      expiry_date: '',
      status: 'active'
    });
  };

  const openAddModal = () => {
    setEditingItem(null);
    setSkuManuallyEdited(false);
    resetForm();
    setShowModal(true);
  };

  const openImportModal = () => {
    setImportFile(null);
    setImportSupplierId('');
    setImportUseDiscount(false);
    setImportDiscountMode('amount');
    setImportDiscountValue('');
    setImportUseProfit(false);
    setImportProfitMode('amount');
    setImportProfitValue('');
    setImportSummary(null);
    setImportProgress(0);
    setImportProgressPhase('idle');
    setShowImportModal(true);
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      alert('Please choose a CSV file first.');
      return;
    }

    const form = new FormData();
    form.append('file', importFile);
    form.append('default_type', activeTab);
    if (importSupplierId) {
      form.append('supplier_id', importSupplierId);
    }
    form.append('use_discount', importUseDiscount ? '1' : '0');
    form.append('discount_mode', importUseDiscount ? importDiscountMode : 'none');
    if (importUseDiscount) {
      form.append('discount_value', String(Number(importDiscountValue) || 0));
    }
    form.append('use_profit', importUseProfit ? '1' : '0');
    form.append('profit_mode', importUseProfit ? importProfitMode : 'none');
    if (importUseProfit) {
      form.append('profit_value', String(Number(importProfitValue) || 0));
    }

    try {
      setImporting(true);
      setImportProgress(0);
      setImportProgressPhase('uploading');
      const response = await axios.post(`${API_URL}/api/stock/inventory/import-csv`, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total || progressEvent.total <= 0) {
            setImportProgress((prev) => Math.min(prev + 3, 90));
            return;
          }

          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setImportProgress(Math.min(percent, 95));
          if (percent >= 100) {
            setImportProgressPhase('processing');
          }
        },
      });

      setImportProgress(100);
      setImportProgressPhase('idle');

      const summary = response.data?.data || {};
      setImportSummary({
        created: Number(summary.created) || 0,
        updated: Number(summary.updated) || 0,
        skipped: Number(summary.skipped) || 0,
        failed: Number(summary.failed) || 0,
        errors: Array.isArray(summary.errors) ? summary.errors : [],
      });

      await fetchItems(true);
      await fetchSuppliers(true);
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      setImportProgressPhase('idle');
      alert(error.response?.data?.message || error.message || 'Failed to import CSV file');
    } finally {
      setImporting(false);
    }
  };

  const generateSkuCode = (name: string, type: 'raw_material' | 'finished_good') => {
    const prefix = type === 'raw_material' ? 'RM' : 'FG';
    const cleanedName = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim();
    const words = cleanedName.split(/\s+/).filter(Boolean);
    const core = cleanedName
      ? words.length > 1
        ? words.slice(0, 3).map((word) => word.slice(0, 2)).join('')
        : cleanedName.replace(/\s+/g, '').slice(0, 6)
      : 'ITEM';

    const normalizedCore = core.replace(/[^A-Z0-9]/g, '') || 'ITEM';
    const escapedCore = normalizedCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${prefix}-${escapedCore}-(\\d{3})$`);

    const nextSerial = (items || [])
      .map((item) => {
        const match = String(item.code || '').toUpperCase().match(pattern);
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, current) => Math.max(max, current), 0) + 1;

    const paddedSerial = String(nextSerial).padStart(3, '0');
    return `${prefix}-${normalizedCore}-${paddedSerial}`;
  };

  useEffect(() => {
    if (!showModal || editingItem || skuManuallyEdited) return;

    const autoCode = generateSkuCode(formData.name, activeTab);
    setFormData((prev) => {
      if (prev.code === autoCode) return prev;
      return { ...prev, code: autoCode };
    });
  }, [formData.name, activeTab, showModal, editingItem, skuManuallyEdited, items]);

  const resolveAdditionalInfo = (item: InventoryItem): Record<string, any> => {
    const info = item.additional_info;
    if (!info) return {};

    if (typeof info === 'string') {
      try {
        return JSON.parse(info);
      } catch {
        return {};
      }
    }

    return info as Record<string, any>;
  };

  const getStockStateKey = (item: InventoryItem): Exclude<StockStateFilter, 'all'> => {
    if (item.current_stock <= 0) return 'out_of_stock';
    if (item.current_stock <= item.minimum_stock) return 'low_stock';
    if (item.maximum_stock && item.current_stock > item.maximum_stock) return 'over_stock';
    return 'healthy_stock';
  };

  const getStockStatus = (item: InventoryItem) => {
    const key = getStockStateKey(item);
    if (key === 'out_of_stock') return { status: 'Out of Stock', color: 'bg-red-100 text-red-800' };
    if (key === 'low_stock') return { status: 'Low Stock', color: 'bg-yellow-100 text-yellow-800' };
    if (key === 'over_stock') return { status: 'Overstocked', color: 'bg-blue-100 text-blue-800' };
    return { status: 'In Stock', color: 'bg-green-100 text-green-800' };
  };

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    items.forEach((item) => {
      const category = String(item.category || '').trim();
      if (category) categories.add(category);
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item) => {
      if (!item.supplier_id) return;
      const label = item.supplier?.name || item.supplier_name || `Supplier #${item.supplier_id}`;
      map.set(item.supplier_id, label);
    });
    suppliers.forEach((supplier) => {
      if (supplier?.id) {
        map.set(supplier.id, supplier.name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items, suppliers]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const info = resolveAdditionalInfo(item);
      const model = String(info.model || '').toLowerCase();
      const brand = String(info.brand || '').toLowerCase();
      const serialNo = String(info.serial_no || info.serialNo || '').toLowerCase();

      const matchesSearch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        String(item.code || '').toLowerCase().includes(keyword) ||
        String(item.category || '').toLowerCase().includes(keyword) ||
        String(item.supplier_name || item.supplier?.name || '').toLowerCase().includes(keyword) ||
        String(item.location || '').toLowerCase().includes(keyword) ||
        model.includes(keyword) ||
        brand.includes(keyword) ||
        serialNo.includes(keyword);

      const matchesCategory =
        categoryFilter === 'all' || String(item.category || '').trim() === categoryFilter;

      const matchesSupplier =
        supplierFilter === 'all' || String(item.supplier_id || '') === supplierFilter;

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      const matchesStock =
        stockStateFilter === 'all' || getStockStateKey(item) === stockStateFilter;

      return matchesSearch && matchesCategory && matchesSupplier && matchesStatus && matchesStock;
    });
  }, [items, search, categoryFilter, supplierFilter, statusFilter, stockStateFilter]);

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setSupplierFilter('all');
    setStatusFilter('all');
    setStockStateFilter('all');
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredItems, currentPage, rowsPerPage]);

  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, -1, totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, -1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages];
  }, [currentPage, totalPages]);

  const pageStart = filteredItems.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const pageEnd = Math.min(currentPage * rowsPerPage, filteredItems.length);

  const modalLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600';
  const modalInputClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const modalSelectClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const modalTextareaClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const totalStockValue = filteredItems.reduce((sum, item) => sum + (item.current_stock * resolveItemPrice(item)), 0);
  const lowStockItems = filteredItems.filter((item) => getStockStateKey(item) === 'low_stock').length;
  const inStockItems = filteredItems.filter((item) => getStockStateKey(item) === 'healthy_stock').length;
  const visibleInventoryColumns = Math.max(
    [
      'stock-inventory-col-item',
      'stock-inventory-col-stock-info',
      'stock-inventory-col-batch',
      'stock-inventory-col-price',
      'stock-inventory-col-status',
      'stock-inventory-col-actions',
    ].filter((key) => isColumnVisible(key)).length,
    1
  );
  const filterInputClass =
    'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      {isElementVisible('stock-inventory-el-header') && (
        <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white/75 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        {showWidgetCloseButtons && (
          <button
            type="button"
            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-header', true); }}
            className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
            title="Hide inventory header"
            aria-label="Hide inventory header"
          >
            x
          </button>
        )}
        <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              Inventory command center
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Inventory Management
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Manage finished goods with richer visibility, cleaner records, and faster item-level decisions.
              </p>
            </div>
            {isElementVisible('stock-inventory-el-btn-add') && (
              <div className="relative inline-flex items-center gap-3">
                {showWidgetCloseButtons && (
                  <button
                    type="button"
                    onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-btn-add', true); }}
                    className="absolute -right-2 -top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                    title="Hide add button"
                    aria-label="Hide add button"
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
                  Add Item
                </button>
                <button
                  type="button"
                  onClick={openImportModal}
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload CSV
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {isElementVisible('stock-inventory-el-header-stat-total-items') && (
              <div className="relative rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-header-stat-total-items', true); }}
                  className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-white/20 text-xs font-bold text-white hover:bg-white/30"
                  title="Hide total items stat"
                  aria-label="Hide total items stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Total Items</p>
              <p className="mt-2 text-3xl font-bold">{items.length}</p>
              <p className="mt-2 text-sm text-white/85">LKR {totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} inventory value</p>
            </div>
            )}
            {isElementVisible('stock-inventory-el-header-stat-low-stock') && (
              <div className="relative rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-header-stat-low-stock', true); }}
                  className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide low stock stat"
                  aria-label="Hide low stock stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Low Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{lowStockItems}</p>
              <p className="mt-2 text-sm text-slate-500">Need replenishment attention</p>
            </div>
            )}
            {isElementVisible('stock-inventory-el-header-stat-healthy-stock') && (
              <div className="relative rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-header-stat-healthy-stock', true); }}
                  className="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  title="Hide healthy stock stat"
                  aria-label="Hide healthy stock stat"
                >
                  x
                </button>
              )}
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Healthy Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{inStockItems}</p>
              <p className="mt-2 text-sm text-slate-500">Above minimum stock threshold</p>
            </div>
            )}
          </div>
        </div>
      </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        <div className="border-b border-orange-100 bg-gradient-to-r from-white via-orange-50/70 to-amber-50/70">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <span className="py-4 px-1 border-b-2 border-orange-500 text-orange-600 font-medium text-sm">
              Store
            </span>
          </nav>
        </div>

        <div className="p-6">
          {isElementVisible('stock-inventory-sec-filters') && (
            <div className="relative mb-6 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
            {showWidgetCloseButtons && (
              <button
                type="button"
                onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-sec-filters', true); }}
                className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                title="Hide filters section"
                aria-label="Hide filters section"
              >
                x
              </button>
            )}
            <div className="border-b border-orange-100 bg-gradient-to-r from-white via-orange-50/70 to-amber-50/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">Filter Store</h4>
                <div className="text-right">
                  <p className="text-xs text-orange-700">
                    Showing {filteredItems.length} of {items.length} loaded items
                  </p>
                  {isBackgroundLoading && totalItemsCount > items.length && (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">
                      Loading in background: {loadedItemsCount.toLocaleString()} / {totalItemsCount.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {isElementVisible('stock-inventory-el-filter-search') && (
                <div className="xl:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Search</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, code, category, supplier, model, brand, serial"
                  className={filterInputClass}
                />
              </div>
              )}
              {isElementVisible('stock-inventory-el-filter-category') && (
                <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={filterInputClass}
                >
                  <option value="all">All Categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {isElementVisible('stock-inventory-el-filter-supplier') && (
                <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supplier</label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className={filterInputClass}
                >
                  <option value="all">All Suppliers</option>
                  {supplierOptions.map(([id, name]) => (
                    <option key={id} value={String(id)}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {isElementVisible('stock-inventory-el-filter-item-status') && (
                <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Item Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className={filterInputClass}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              )}
              {isElementVisible('stock-inventory-el-filter-stock-state') && (
                <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stock State</label>
                <select
                  value={stockStateFilter}
                  onChange={(e) => setStockStateFilter(e.target.value as StockStateFilter)}
                  className={filterInputClass}
                >
                  <option value="all">All</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="healthy_stock">Healthy</option>
                  <option value="over_stock">Overstock</option>
                </select>
              </div>
              )}
              {isElementVisible('stock-inventory-el-btn-reset-filters') && (
                <div className="flex items-end md:col-span-2 lg:col-span-3 xl:col-span-6 xl:justify-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  Reset Filters
                </button>
              </div>
              )}
            </div>
          </div>
          )}

          {/* Stats Cards */}
          {isElementVisible('stock-inventory-el-snapshot-head') && (
            <div className="relative mb-2 flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-2.5">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-snapshot-head', true); }}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title="Hide snapshot header"
                  aria-label="Hide snapshot header"
                >
                  x
                </button>
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Inventory Snapshot</p>
              <p className="text-xs text-orange-700">Tip: click any row to view full item details</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {isElementVisible('stock-inventory-el-stat-total-items') && (
              <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-stat-total-items', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide total items card"
                  aria-label="Hide total items card"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">📦</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {filteredItems.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            )}

            {isElementVisible('stock-inventory-el-stat-low-stock') && (
              <div className="relative overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-stat-low-stock', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50"
                  title="Hide low stock card"
                  aria-label="Hide low stock card"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">⚠️</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Low Stock Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {lowStockItems}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            )}

            {isElementVisible('stock-inventory-el-stat-in-stock') && (
              <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-stat-in-stock', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                  title="Hide in stock card"
                  aria-label="Hide in stock card"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">✅</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        In Stock Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {inStockItems}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            )}

            {isElementVisible('stock-inventory-el-stat-total-value') && (
              <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-el-stat-total-value', true); }}
                  className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 bg-white text-xs font-bold text-blue-600 hover:bg-blue-50"
                  title="Hide total value card"
                  aria-label="Hide total value card"
                >
                  x
                </button>
              )}
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">💰</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Value
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        LKR {totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Items Table */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-sm">No items found in this store</div>
              <button
                onClick={openAddModal}
                className="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Add First Item
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-sm">No items match your filters</div>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            isElementVisible('stock-inventory-sec-table') && (
            <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_16px_55px_-35px_rgba(194,65,12,0.45)]">
              {showWidgetCloseButtons && (
                <button
                  type="button"
                  onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-sec-table', true); }}
                  className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-sm font-bold text-red-600 hover:bg-red-50"
                  title="Hide table section"
                  aria-label="Hide table section"
                >
                  x
                </button>
              )}
              <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
                <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">
                  Finished Goods Inventory
                </h4>
              </div>
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100/80">
                  <tr>
                    {isColumnVisible('stock-inventory-col-item') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Item
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-item', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide item column"
                            aria-label="Hide item column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                    {isColumnVisible('stock-inventory-col-stock-info') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Stock Info
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-stock-info', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide stock info column"
                            aria-label="Hide stock info column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                    {isColumnVisible('stock-inventory-col-batch') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Batch
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-batch', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide batch column"
                            aria-label="Hide batch column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                    {isColumnVisible('stock-inventory-col-price') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Price
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-price', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide price column"
                            aria-label="Hide price column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                    {isColumnVisible('stock-inventory-col-status') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Status
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-status', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide status column"
                            aria-label="Hide status column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                    {isColumnVisible('stock-inventory-col-actions') && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] relative">
                        Actions
                        {showWidgetCloseButtons && (
                          <button
                            type="button"
                            onClick={() => { void handleInventoryVisibilityToggle('stock-inventory-col-actions', true); }}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-[10px] font-bold text-red-600 hover:bg-red-50"
                            title="Hide actions column"
                            aria-label="Hide actions column"
                          >
                            x
                          </button>
                        )}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedItems.map((item) => {
                    const stockStatus = getStockStatus(item);
                    const resolvedPrice = resolveItemPrice(item);
                    const info = resolveAdditionalInfo(item);
                    const batchNo = info.last_batch_no || info.lastBatchNo || '';
                    const labelCode = info.last_label_code || info.lastLabelCode || '';
                    const storeTag = info.store_tag || info.storeTag || '';
                    const stockSource = info.stock_source || info.stockSource || '';
                    const packagingBatchId = info.last_packaging_batch_id || info.lastPackagingBatchId;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => openItemDetails(item)}
                        className="cursor-pointer transition hover:bg-orange-50/45"
                      >
                        {isColumnVisible('stock-inventory-col-item') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                                <span className="text-orange-600 font-medium text-sm">
                                  {item.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {item.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {item.code} • {item.category || 'Uncategorized'}
                              </div>
                            </div>
                          </div>
                        </td>
                        )}
                        {isColumnVisible('stock-inventory-col-stock-info') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {item.current_stock} {item.unit}
                          </div>
                          <div className="text-sm text-gray-500">
                            Min: {item.minimum_stock} {item.unit}
                          </div>
                          {item.location && (
                            <div className="text-xs text-gray-400">
                              {item.location}
                            </div>
                          )}
                        </td>
                        )}
                        {isColumnVisible('stock-inventory-col-batch') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {batchNo || labelCode || (packagingBatchId ? `Batch #${packagingBatchId}` : '-')}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {storeTag && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                {String(storeTag).replace('_', ' ').toUpperCase()}
                              </span>
                            )}
                            {stockSource && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                {String(stockSource).toUpperCase()}
                              </span>
                            )}
                          </div>
                          {packagingBatchId && (
                            <div className="text-xs text-gray-500 mt-1">
                              Batch #{packagingBatchId}
                            </div>
                          )}
                          {activeTab === 'finished_good' && !labelCode && !packagingBatchId && (
                            <div className="text-xs text-amber-600 mt-1">Not synced from packaging yet</div>
                          )}
                        </td>
                        )}
                        {isColumnVisible('stock-inventory-col-price') && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">
                          LKR {resolvedPrice.toFixed(2)}
                        </td>
                        )}
                        {isColumnVisible('stock-inventory-col-status') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${stockStatus.color}`}>
                            {stockStatus.status}
                          </span>
                        </td>
                        )}
                        {isColumnVisible('stock-inventory-col-actions') && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(item);
                            }}
                            className="mr-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(item.id);
                            }}
                            className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-orange-100 bg-orange-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-600">
                Showing {pageStart} to {pageEnd} of {filteredItems.length} items
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rows</label>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                <div className="flex items-center gap-1">
                  {paginationPages.map((page, index) =>
                    page === -1 ? (
                      <span key={`ellipsis-${index}`} className="px-1 text-xs text-slate-500">
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`h-8 min-w-8 rounded-full px-2 text-xs font-semibold transition ${
                          page === currentPage
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'border border-orange-200 bg-white text-orange-700 hover:bg-orange-100'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
            </div>
          ))}
        </div>
      </div>

      {/* Item Details Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_120px_-40px_rgba(16,185,129,0.55)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(110,231,183,0.32),_transparent_45%),linear-gradient(125deg,_rgba(5,150,105,0.95)_0%,_rgba(16,185,129,0.94)_45%,_rgba(52,211,153,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    ⬆️
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Import Inventory from CSV</h3>
                  <p className="mt-2 text-sm text-white/85 sm:text-base">
                    Upload a CSV file to create or update inventory records by item code.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (importing) return;
                    setShowImportModal(false);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleImportCsv} className="space-y-5 px-6 pb-6 sm:px-8 sm:pb-8">
                <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">CSV Template</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Reference format (like your attachment): first column = code, second = name, third = price.
                    Example row: 34014,PIN KICK STARTER PAWL,190.00
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Works with or without header row. Optional 4th column can be current_stock; if missing it becomes 0.
                  </p>
                </section>

                <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Supplier (Optional)</label>
                      <select
                        value={importSupplierId}
                        onChange={(e) => setImportSupplierId(e.target.value)}
                        className="mt-2 block w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                      >
                        <option value="">Use CSV supplier or keep empty</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={String(supplier.id)}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
                        <input
                          type="checkbox"
                          checked={importUseDiscount}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setImportUseDiscount(checked);
                            if (checked) {
                              setImportUseProfit(false);
                            }
                          }}
                          className="h-4 w-4 rounded border-emerald-300 text-emerald-600"
                        />
                        Apply Discount From Document Price
                      </label>
                      <p className="mt-1 text-xs text-emerald-700">
                        With discount: sell_price = document price, unit_price = document price, purchase_price = document price - discount.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800">
                        <input
                          type="checkbox"
                          checked={importUseProfit}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setImportUseProfit(checked);
                            if (checked) {
                              setImportUseDiscount(false);
                            }
                          }}
                          className="h-4 w-4 rounded border-blue-300 text-blue-600"
                        />
                        Apply Profit From Document Price
                      </label>
                      <p className="mt-1 text-xs text-blue-700">
                        With profit: sell_price = document price + profit, unit_price = document price + profit, purchase_price = document price.
                      </p>
                    </div>
                  </div>

                  {importUseDiscount && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Discount Type</label>
                        <select
                          value={importDiscountMode}
                          onChange={(e) => setImportDiscountMode(e.target.value as 'amount' | 'percent')}
                          className="mt-2 block w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                        >
                          <option value="amount">Amount</option>
                          <option value="percent">Percent (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                          Discount {importDiscountMode === 'percent' ? '(%)' : '(LKR)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={importDiscountValue}
                          onChange={(e) => setImportDiscountValue(e.target.value)}
                          className="mt-2 block w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                          placeholder={importDiscountMode === 'percent' ? '10' : '250.00'}
                        />
                      </div>
                    </div>
                  )}

                  {importUseProfit && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Profit Type</label>
                        <select
                          value={importProfitMode}
                          onChange={(e) => setImportProfitMode(e.target.value as 'amount' | 'percent')}
                          className="mt-2 block w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                        >
                          <option value="amount">Amount</option>
                          <option value="percent">Percent (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                          Profit {importProfitMode === 'percent' ? '(%)' : '(LKR)'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={importProfitValue}
                          onChange={(e) => setImportProfitValue(e.target.value)}
                          className="mt-2 block w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                          placeholder={importProfitMode === 'percent' ? '15' : '300.00'}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border-t border-emerald-100 pt-4">
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">CSV File</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="mt-2 block w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm text-gray-800"
                    required
                  />
                  {importFile && (
                    <p className="mt-2 text-xs text-slate-600">
                      Selected: {importFile.name}
                    </p>
                  )}
                  </div>
                </section>

                {importing && (
                  <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-amber-800">
                        {importProgressPhase === 'processing'
                          ? 'Upload complete. Processing inventory rows...'
                          : 'Uploading CSV file...'}
                      </p>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                        {Math.max(0, Math.min(100, Math.round(importProgress)))}%
                      </span>
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-amber-100">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-300 ${
                          importProgressPhase === 'processing' ? 'animate-pulse' : ''
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, importProgress))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-amber-700">
                      {importProgressPhase === 'processing'
                        ? 'Please wait while we validate and save rows on the server.'
                        : 'Keep this dialog open until import completes.'}
                    </p>
                  </section>
                )}

                {importSummary && (
                  <section className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Import Result</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-xs text-slate-500">Created</p>
                        <p className="text-lg font-bold text-emerald-700">{importSummary.created}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-xs text-slate-500">Updated</p>
                        <p className="text-lg font-bold text-blue-700">{importSummary.updated}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-xs text-slate-500">Skipped</p>
                        <p className="text-lg font-bold text-amber-700">{importSummary.skipped}</p>
                      </div>
                      <div className="rounded-xl bg-white p-3 text-center">
                        <p className="text-xs text-slate-500">Failed</p>
                        <p className="text-lg font-bold text-red-700">{importSummary.failed}</p>
                      </div>
                    </div>

                    {importSummary.errors.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Row Errors</p>
                        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-xs text-red-700">
                          {importSummary.errors.map((error, index) => (
                            <p key={`${error.row}-${index}`}>Row {error.row}: {error.message}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-emerald-100 bg-white/95 px-6 py-4 sm:-mx-8 sm:px-8">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    disabled={importing}
                    className="rounded-full border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-emerald-50 disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={importing || !importFile}
                    className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? 'Importing...' : 'Import CSV'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Item Details Modal */}
      {showItemDetailsModal && selectedItemDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_120px_-40px_rgba(194,65,12,0.58)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.36),_transparent_45%),linear-gradient(125deg,_rgba(154,52,18,0.95)_0%,_rgba(234,88,12,0.94)_45%,_rgba(249,115,22,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    🔎
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Item Details</h3>
                  <p className="mt-2 text-sm text-white/85 sm:text-base">
                    {selectedItemDetails.name} • {selectedItemDetails.code}
                  </p>
                </div>
                <button
                  onClick={() => setShowItemDetailsModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5 px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Identity</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Name:</span> {selectedItemDetails.name}</p>
                      <p><span className="font-semibold text-slate-900">Code:</span> {selectedItemDetails.code}</p>
                      <p><span className="font-semibold text-slate-900">Category:</span> {selectedItemDetails.category || 'Uncategorized'}</p>
                      <p><span className="font-semibold text-slate-900">Type:</span> {selectedItemDetails.type === 'raw_material' ? 'Raw Material' : 'Finished Good'}</p>
                      <p><span className="font-semibold text-slate-900">Unit:</span> {selectedItemDetails.unit}</p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Stock and Commercial</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Current Stock:</span> {selectedItemDetails.current_stock} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Minimum Stock:</span> {selectedItemDetails.minimum_stock} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Maximum Stock:</span> {selectedItemDetails.maximum_stock || 0} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Unit Price:</span> LKR {resolveItemPrice(selectedItemDetails).toFixed(2)}</p>
                      {selectedItemDetails.purchase_price !== undefined && (
                        <p><span className="font-semibold text-slate-900">Purchase Price:</span> LKR {toSafeNumber(selectedItemDetails.purchase_price).toFixed(2)}</p>
                      )}
                      {selectedItemDetails.sell_price !== undefined && (
                        <p><span className="font-semibold text-slate-900">Sell Price:</span> LKR {toSafeNumber(selectedItemDetails.sell_price).toFixed(2)}</p>
                      )}
                    </div>
                  </section>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Supplier and Location</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Supplier:</span> {selectedItemDetails.supplier_name || selectedItemDetails.supplier?.name || 'Not assigned'}</p>
                      <p><span className="font-semibold text-slate-900">Location:</span> {selectedItemDetails.location || 'Not set'}</p>
                      <p><span className="font-semibold text-slate-900">Expiry Date:</span> {selectedItemDetails.expiry_date ? new Date(selectedItemDetails.expiry_date).toLocaleDateString() : 'Not specified'}</p>
                      <p><span className="font-semibold text-slate-900">Status:</span> {selectedItemDetails.status}</p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">Description</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {selectedItemDetails.description || 'No description provided for this item.'}
                    </p>
                  </section>
                </div>

                <div className="sticky bottom-0 -mx-6 border-t border-orange-100 bg-white/95 px-6 py-4 text-right sm:-mx-8 sm:px-8">
                  <button
                    onClick={() => setShowItemDetailsModal(false)}
                    className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_120px_-40px_rgba(234,88,12,0.55)]">
            <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.36),_transparent_45%),linear-gradient(125deg,_rgba(194,65,12,0.95)_0%,_rgba(234,88,12,0.94)_45%,_rgba(249,115,22,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    {editingItem ? '✎' : '📦'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {editingItem ? 'Update Inventory Item' : 'Add Item to Store'}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    Capture stock identity, controls, and pricing in one polished workspace built for daily inventory operations.
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
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Item Identity</p>
                    <h4 className="mt-2 text-lg font-semibold text-gray-900">Core information</h4>
                    <p className="mt-1 text-sm text-gray-500">Define item identity and classification for better store-level visibility.</p>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className={modalLabelClass}>Item Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={modalInputClass}
                          placeholder="Enter item name"
                        />
                      </div>

                      <div>
                        <label className={modalLabelClass}>Item Code/SKU *</label>
                        <input
                          type="text"
                          required
                          value={formData.code}
                          onChange={(e) => {
                            setSkuManuallyEdited(true);
                            setFormData({ ...formData, code: e.target.value.toUpperCase() });
                          }}
                          className={modalInputClass}
                          placeholder="Enter unique code"
                        />
                      </div>

                      <div>
                        <label className={modalLabelClass}>Category</label>
                        <input
                          type="text"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className={modalInputClass}
                          placeholder="Enter category"
                        />
                      </div>

                      <div>
                        <label className={modalLabelClass}>Unit *</label>
                        <select
                          required
                          value={formData.unit}
                          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                          className={modalSelectClass}
                        >
                          <option value="">Select unit</option>
                          <option value="pieces">Pieces</option>
                          <option value="kg">Kilograms (kg)</option>
                          <option value="g">Grams (g)</option>
                          <option value="liters">Liters</option>
                          <option value="ml">Milliliters (ml)</option>
                          <option value="bags">Bags</option>
                          <option value="boxes">Boxes</option>
                          <option value="meters">Meters</option>
                          <option value="feet">Feet</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className={modalLabelClass}>Description</label>
                        <textarea
                          rows={4}
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className={modalTextareaClass}
                          placeholder="Enter item description"
                        />
                      </div>
                    </div>
                  </section>

                  <div className="space-y-6">
                    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Stock Controls</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Quantities and status</h4>
                      <div className="mt-5 grid grid-cols-1 gap-4">
                        <div>
                          <label className={modalLabelClass}>Current Stock *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.current_stock}
                            onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Minimum Stock *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.minimum_stock}
                            onChange={(e) => setFormData({ ...formData, minimum_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Maximum Stock</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.maximum_stock}
                            onChange={(e) => setFormData({ ...formData, maximum_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Status</label>
                          <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                            className={modalSelectClass}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Commercial Details</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Pricing and supply</h4>
                      <div className="mt-5 grid grid-cols-1 gap-4">
                        <div>
                          <label className={modalLabelClass}>Unit Price (LKR) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.unit_price}
                            onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Supplier</label>
                          <select
                            value={formData.supplier_id}
                            onChange={(e) => {
                              const selectedSupplier = suppliers.find(s => s.id.toString() === e.target.value);
                              setFormData({
                                ...formData,
                                supplier_id: e.target.value,
                                supplier_name: selectedSupplier ? selectedSupplier.name : ''
                              });
                            }}
                            className={modalSelectClass}
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
                          <label className={modalLabelClass}>Location</label>
                          <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            className={modalInputClass}
                            placeholder="Warehouse location"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Expiry Date</label>
                          <input
                            type="date"
                            value={formData.expiry_date}
                            onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                            className={modalInputClass}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end space-x-3 border-t border-orange-100 bg-white/95 px-6 py-4 sm:-mx-8 sm:px-8">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : (editingItem ? 'Update Item' : 'Add Item')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                Delete Item
              </h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete this item? This action cannot be undone.
              </p>
              <div className="flex justify-center space-x-3 mt-6">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="bg-red-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700"
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

interface InventoryMemoryCacheEntry {
  timestamp: number;
  items: InventoryItem[];
  loadedItemsCount: number;
  totalItemsCount: number;
  isBackgroundLoading: boolean;
}

interface SuppliersMemoryCacheEntry {
  timestamp: number;
  suppliers: any[];
}

const inventoryMemoryCache: Record<string, InventoryMemoryCacheEntry> = {};
let suppliersMemoryCache: SuppliersMemoryCacheEntry | null = null;