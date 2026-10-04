'use client';

import { useState, useEffect, useMemo } from 'react';
import type { AppData, Payment, MeterReading, Expense } from '@/lib/types';
import { loadData, saveData, updateExpenses } from '@/lib/data';
import { formatDateLong, formatDollars, removeExpense, upsertExpense } from '@/lib/profitability';
import { getLastSixMonthsUsage, formatShortPeriod } from '@/lib/billing';
import BalanceCard from '@/components/BalanceCard';
import ActivityTable, { ActivityItem } from '@/components/ActivityTable';
import AddPaymentModal from '@/components/AddPaymentModal';
import AddReadingModal from '@/components/AddReadingModal';
import EditActivityModal from '@/components/EditActivityModal';
import ExpenseModal from '@/components/ExpenseModal';

export default function Dashboard() {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>();
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseStatus, setExpenseStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Property filter state
  const [filterPropertyIds, setFilterPropertyIds] = useState<Set<string>>(new Set());

  // Sort state for activity table
  const [sortField, setSortField] = useState<'date' | 'property' | 'type' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAddPayment = async (payment: Payment) => {
    if (!data) return;

    const newData = {
      ...data,
      payments: [...data.payments, payment],
    };

    setData(newData);
    await saveData(newData);
  };

  const handleAddReading = async (reading: MeterReading) => {
    if (!data) return;

    const newData = {
      ...data,
      readings: [...data.readings, reading],
    };

    setData(newData);
    await saveData(newData);
  };

  const handleEditPayment = async (payment: Payment) => {
    if (!data) return;

    const newData = {
      ...data,
      payments: data.payments.map(p => p.id === payment.id ? payment : p),
    };

    setData(newData);
    await saveData(newData);
  };

  const handleEditReading = async (reading: MeterReading) => {
    if (!data) return;

    const newData = {
      ...data,
      readings: data.readings.map(r => r.id === reading.id ? reading : r),
    };

    setData(newData);
    await saveData(newData);
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!data) return;

    const newData = {
      ...data,
      payments: data.payments.filter(p => p.id !== paymentId),
    };

    setData(newData);
    await saveData(newData);
  };

  const handleDeleteReading = async (readingId: string) => {
    if (!data) return;

    const newData = {
      ...data,
      readings: data.readings.filter(r => r.id !== readingId),
    };

    setData(newData);
    await saveData(newData);
  };

  // Expenses save through updateExpenses(), which keeps this page's own expense list and
  // takes payments and readings fresh, and the result is said out loud either way.
  const persistExpenses = async (change: (current: Expense[]) => Expense[], message: string) => {
    if (!data) return;
    setExpenseStatus(null);
    try {
      setData(await updateExpenses(data.expenses, change));
      setExpenseStatus({ ok: true, text: message });
    } catch (err) {
      setExpenseStatus({ ok: false, text: err instanceof Error ? err.message : 'Failed to save the expense' });
    }
  };

  const handleSaveExpense = (expense: Expense) => {
    void persistExpenses(
      (current) => upsertExpense(current, expense),
      `Saved ${expense.category} ${formatDollars(expense.amount)} for ${formatDateLong(expense.paidDate)}`
    );
  };

  const handleDeleteExpense = (id: string) => {
    const gone = data?.expenses?.find((e) => e.id === id);
    void persistExpenses(
      (current) => removeExpense(current, id),
      gone ? `Deleted ${gone.category} ${formatDollars(gone.amount)}` : 'Deleted'
    );
  };

  const openNewExpense = () => {
    setEditingExpense(null);
    setShowExpenseModal(true);
  };

  const openEditModal = (activity: ActivityItem) => {
    if (activity.type === 'expense') {
      setEditingExpense(data?.expenses?.find((e) => e.id === activity.originalId) ?? null);
      setShowExpenseModal(true);
      return;
    }
    setSelectedActivity(activity);
    setShowEditModal(true);
  };

  const openPaymentModal = (propertyId?: string) => {
    setSelectedPropertyId(propertyId);
    setShowPaymentModal(true);
  };

  const openReadingModal = (propertyId?: string) => {
    setSelectedPropertyId(propertyId);
    setShowReadingModal(true);
  };

  const togglePropertyFilter = (propertyId: string) => {
    setFilterPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilterPropertyIds(new Set());
  };

  // Filtered data for activity table
  const filteredReadings = useMemo(() => {
    if (!data || filterPropertyIds.size === 0) return data?.readings || [];
    return data.readings.filter(r => filterPropertyIds.has(r.propertyId));
  }, [data, filterPropertyIds]);

  const filteredPayments = useMemo(() => {
    if (!data || filterPropertyIds.size === 0) return data?.payments || [];
    return data.payments.filter(p => filterPropertyIds.has(p.propertyId));
  }, [data, filterPropertyIds]);

  // Expenses belong to the water company, not a household, so a household filter hides them.
  const filteredExpenses = useMemo(() => {
    if (!data || filterPropertyIds.size > 0) return [];
    return data.expenses ?? [];
  }, [data, filterPropertyIds]);

  // Usage history for selected properties
  const selectedPropertiesUsage = useMemo(() => {
    if (!data || filterPropertyIds.size === 0) return [];
    return Array.from(filterPropertyIds).map(propertyId => {
      const property = data.properties.find(p => p.id === propertyId);
      const usage = getLastSixMonthsUsage(propertyId, data.readings);
      return {
        propertyId,
        propertyName: property?.name || 'Unknown',
        usage,
      };
    });
  }, [data, filterPropertyIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3366AA]"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load data</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if we should show billing reminder (1st-5th of month)
  const today = new Date();
  const dayOfMonth = today.getDate();
  const showBillingReminder = dayOfMonth >= 1 && dayOfMonth <= 5;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:hidden">Dashboard</h1>
        <h1 className="text-2xl font-bold hidden md:block">Account Balances</h1>
      </div>

      {/* Billing Reminder */}
      {showBillingReminder && (
        <div className="mb-6 p-4 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[var(--primary)]/20 rounded-full">
              <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">Billing Reminder</h3>
              <p className="text-[var(--muted)] text-sm mt-1">
                It&apos;s the beginning of the month. Time to log meter readings and generate bills!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {data.properties.map((property) => (
          <BalanceCard
            key={property.id}
            property={property}
            readings={data.readings}
            payments={data.payments}
            settings={data.settings}
            onRecordPayment={() => openPaymentModal(property.id)}
            onLogReading={() => openReadingModal(property.id)}
            onNameClick={() => togglePropertyFilter(property.id)}
            isSelected={filterPropertyIds.has(property.id)}
          />
        ))}
      </div>

      {/* Usage History - Inline when properties selected */}
      {filterPropertyIds.size > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Usage History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {selectedPropertiesUsage.map(({ propertyId, propertyName, usage }) => (
              <div key={propertyId}>
                <h3 className="font-medium mb-3 text-[var(--muted)]">{propertyName}</h3>
                {usage.length > 0 ? (
                  <div className="flex items-end gap-2">
                    {usage.map((item, index) => {
                      const maxUsage = Math.max(...usage.map((h) => h.usage));
                      const heightPercent = maxUsage > 0 ? (item.usage / maxUsage) * 100 : 0;
                      const barHeight = Math.max(heightPercent, 5) * 0.8; // Max 80px
                      const isLast = index === usage.length - 1;

                      return (
                        <div key={item.period} className="flex-1 flex flex-col items-center">
                          <span className="text-xs text-[var(--muted)] mb-1">
                            {(item.usage / 1000).toFixed(1)}k
                          </span>
                          <div
                            className={`w-full rounded-t-lg transition-all ${
                              isLast ? 'bg-[var(--primary)]' : 'bg-[var(--primary)]/40'
                            }`}
                            style={{ height: `${barHeight}px` }}
                          />
                          <span className={`text-xs mt-2 ${isLast ? 'text-[var(--primary)] font-medium' : 'text-[var(--muted)]'}`}>
                            {formatShortPeriod(item.period)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[var(--muted)] text-sm">No usage history available</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity History */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            {filterPropertyIds.size > 0 && (
              <button
                onClick={clearFilters}
                className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-600 hover:bg-red-500/30 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openNewExpense} className="btn-primary text-sm px-3 py-1.5 whitespace-nowrap">
              New Expense
            </button>
            <label className="text-sm text-[var(--muted)] sm:ml-2">Sort by:</label>
            <select
              value={`${sortField}-${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split('-') as ['date' | 'property' | 'type' | 'amount', 'asc' | 'desc'];
                setSortField(field);
                setSortDirection(dir);
              }}
              className="text-sm py-1 px-2"
            >
              <option value="date-desc">Date (Newest)</option>
              <option value="date-asc">Date (Oldest)</option>
              <option value="property-asc">Property (A-Z)</option>
              <option value="property-desc">Property (Z-A)</option>
              <option value="type-asc">Type (Payments first)</option>
              <option value="type-desc">Type (Readings first)</option>
              <option value="amount-desc">Amount (Highest)</option>
              <option value="amount-asc">Amount (Lowest)</option>
            </select>
          </div>
        </div>
        {expenseStatus && (
          <p role="status" className={`text-sm mb-3 ${expenseStatus.ok ? 'text-[var(--muted)]' : 'text-red-600'}`}>
            {expenseStatus.ok ? expenseStatus.text : `Not saved: ${expenseStatus.text}`}
          </p>
        )}
        <ActivityTable
          properties={data.properties}
          readings={filteredReadings}
          payments={filteredPayments}
          expenses={filteredExpenses}
          settings={data.settings}
          onEdit={openEditModal}
          sortField={sortField}
          sortDirection={sortDirection}
          isFiltered={false}
        />
      </div>

      {/* Modals */}
      <AddPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        properties={data.properties}
        selectedPropertyId={selectedPropertyId}
        onSave={handleAddPayment}
      />

      <AddReadingModal
        isOpen={showReadingModal}
        onClose={() => setShowReadingModal(false)}
        properties={data.properties}
        readings={data.readings}
        settings={data.settings}
        selectedPropertyId={selectedPropertyId}
        onSave={handleAddReading}
      />

      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => {
          setShowExpenseModal(false);
          setEditingExpense(null);
        }}
        expense={editingExpense}
        onSave={handleSaveExpense}
        onDelete={handleDeleteExpense}
      />

      <EditActivityModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedActivity(null);
        }}
        activity={selectedActivity}
        properties={data.properties}
        readings={data.readings}
        onSavePayment={handleEditPayment}
        onSaveReading={handleEditReading}
        onDeletePayment={handleDeletePayment}
        onDeleteReading={handleDeleteReading}
        originalPayment={selectedActivity?.type === 'payment'
          ? data.payments.find(p => p.id === selectedActivity.originalId)
          : undefined}
        originalReading={selectedActivity?.type === 'reading'
          ? data.readings.find(r => r.id === selectedActivity.originalId)
          : undefined}
      />
    </div>
  );
}
