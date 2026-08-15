'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function PurchasingPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [supplierCount, setSupplierCount] = useState(0);
  const [grnCount, setGrnCount] = useState(0);
  const [postPaymentGrnCount, setPostPaymentGrnCount] = useState(0);
  const router = useRouter();

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

    const fetchStats = async () => {
      try {
        setLoading(true);
        const [suppliersRes, grnRes, postPaymentGrnRes] = await Promise.all([
          axios.get(`${API_URL}/api/stock/suppliers`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1000 },
          }),
          axios.get(`${API_URL}/api/purchasing/grn`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1, page: 1 },
          }),
          axios.get(`${API_URL}/api/purchasing/grn`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 1, page: 1, payment_timing: 'post_payment' },
          }),
        ]);

        const suppliers = suppliersRes.data?.success
          ? (suppliersRes.data?.data?.data || suppliersRes.data?.data || [])
          : [];
        const grnPayload = grnRes.data?.success ? grnRes.data.data : grnRes.data;
        const postPaymentPayload = postPaymentGrnRes.data?.success
          ? postPaymentGrnRes.data.data
          : postPaymentGrnRes.data;

        setSupplierCount(suppliers.length);
        setGrnCount(Number(grnPayload?.total) || 0);
        setPostPaymentGrnCount(Number(postPaymentPayload?.total) || 0);
      } catch (error) {
        console.error('Error loading purchasing stats:', error);
        setSupplierCount(0);
        setGrnCount(0);
        setPostPaymentGrnCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  if (!token || loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Purchasing Dashboard</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Fresh purchasing workspace built with the Manage Stock style.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-cyan-500 rounded-md flex items-center justify-center text-white text-sm font-bold">🚚</div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Suppliers</p>
                <p className="text-lg font-medium text-gray-900">{supplierCount}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center text-white text-sm font-bold">📥</div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total GRNs</p>
                <p className="text-lg font-medium text-gray-900">{grnCount}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-emerald-500 rounded-md flex items-center justify-center text-white text-sm font-bold">💳</div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Post-Payment GRNs</p>
                <p className="text-lg font-medium text-gray-900">{postPaymentGrnCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link
              href="/dashboard/purchasing/grn"
              className="relative block w-full bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg p-4 text-center transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">📥</span>
                <span className="text-sm font-medium text-cyan-900">Direct GRN</span>
              </div>
            </Link>
            <Link
              href="/dashboard/stock/suppliers"
              className="relative block w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-center transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">🚚</span>
                <span className="text-sm font-medium text-blue-900">Manage Suppliers</span>
              </div>
            </Link>
            <Link
              href="/dashboard/accounts/grn-payments"
              className="relative block w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg p-4 text-center transition-colors"
            >
              <div className="flex items-center justify-center">
                <span className="text-2xl mr-2">💳</span>
                <span className="text-sm font-medium text-emerald-900">GRN Payments</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
