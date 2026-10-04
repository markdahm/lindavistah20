'use client';

import { useMemo, useState } from 'react';
import type { Property, MeterReading, Payment, BillingSettings, Expense } from '@/lib/types';
import { formatDate } from '@/lib/data';
import { formatCurrency, calculateBill } from '@/lib/billing';
import { compareActivities, expenseActivity, type ActivityItem, type ActivitySortField } from '@/lib/activity';

export type { ActivityItem } from '@/lib/activity';
export type SortField = ActivitySortField;
export type SortDirection = 'asc' | 'desc';

// Badge style per type. Expenses are money out of the water company, not tied to a household.
const TYPE_BADGE = {
  payment: { label: 'Payment', className: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  reading: { label: 'Reading', className: 'bg-[var(--primary)]/20 text-[var(--primary)]' },
  expense: { label: 'Expense', className: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
} as const;

interface ActivityTableProps {
  properties: Property[];
  readings: MeterReading[];
  payments: Payment[];
  /** Water-company expenses to list beside payments and readings. Omit to leave them out. */
  expenses?: Expense[];
  settings?: BillingSettings;
  onEdit?: (activity: ActivityItem) => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  initialBalance?: number;
  isFiltered?: boolean;
}

export default function ActivityTable({
  properties,
  readings,
  payments,
  expenses,
  settings,
  onEdit,
  sortField: externalSortField,
  sortDirection: externalSortDirection,
  initialBalance = 0,
  isFiltered = false,
}: ActivityTableProps) {
  const [internalSortField, setInternalSortField] = useState<SortField>('date');
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>('desc');

  // Use external props if provided, otherwise use internal state
  const sortField = externalSortField ?? internalSortField;
  const sortDirection = externalSortDirection ?? internalSortDirection;

  const propertyMap = useMemo(() => {
    return new Map(properties.map(p => [p.id, p.name]));
  }, [properties]);

  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    // Add payments
    for (const payment of payments) {
      items.push({
        id: `payment-${payment.id}`,
        originalId: payment.id,
        date: payment.receivedDate,
        type: 'payment',
        propertyId: payment.propertyId,
        propertyName: propertyMap.get(payment.propertyId) || 'Unknown',
        description: payment.notes || 'Payment received',
        amount: payment.amount,
      });
    }

    // Add readings
    for (const reading of readings) {
      const cost = settings ? calculateBill(Math.max(0, reading.usage), settings).totalAmount : undefined;
      items.push({
        id: `reading-${reading.id}`,
        originalId: reading.id,
        date: reading.readingDate,
        type: 'reading',
        propertyId: reading.propertyId,
        propertyName: propertyMap.get(reading.propertyId) || 'Unknown',
        description: `Meter reading: ${reading.readingValue.toLocaleString()}`,
        usage: reading.usage,
        readingValue: reading.readingValue,
        cost,
      });
    }

    // Add expenses
    for (const expense of expenses ?? []) {
      items.push(expenseActivity(expense));
    }

    // Sort by date first
    items.sort((a, b) => a.date.localeCompare(b.date));

    // Now apply secondary sorting if specified
    items.sort((a, b) => {
      const comparison = compareActivities(a, b, sortField);
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Calculate running balance AFTER sorting - based on chronological order
    if (isFiltered) {
      // First, create a chronological copy for balance calculation
      const chronologicalItems = [...items].sort((a, b) => a.date.localeCompare(b.date));
      let runningBalance = initialBalance;
      const balanceMap = new Map<string, number>();
      
      for (const item of chronologicalItems) {
        if (item.type === 'payment') {
          runningBalance -= item.amount!;
        } else if (item.type === 'reading') {
          runningBalance += item.cost || 0;
        }
        // An expense is the company's, not the household's: it never moves a balance.
        balanceMap.set(item.id, runningBalance);
      }
      
      // Apply balances to original items
      for (const item of items) {
        item.runningBalance = balanceMap.get(item.id);
      }
    }

    return items;
  }, [payments, readings, expenses, propertyMap, settings, sortField, sortDirection, initialBalance, isFiltered]);

  const handleSort = (field: SortField) => {
    // Only allow internal sorting if not externally controlled
    if (externalSortField !== undefined) return;

    if (internalSortField === field) {
      setInternalSortDirection(internalSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setInternalSortField(field);
      setInternalSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // Mobile card view
  const MobileActivityList = () => (
    <div className="md:hidden space-y-3">
      {activities.slice(0, 20).map((activity) => (
        <div key={activity.id} className="card">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">{activity.propertyName}</p>
              <p className="text-sm text-[var(--muted)]">{formatDate(activity.date)}</p>
            </div>
            <div className="text-right">
              {activity.type === 'payment' ? (
                <p className="text-green-500 font-semibold">
                  +{formatCurrency(activity.amount!)}
                </p>
              ) : activity.type === 'expense' ? (
                <p className="text-red-500 font-semibold">
                  -{formatCurrency(activity.amount!)}
                </p>
              ) : (
                <div>
                  <p className="text-[var(--primary)] font-semibold">
                    {activity.usage?.toLocaleString()} gal
                  </p>
                  {activity.cost !== undefined && (
                    <p className="text-red-500 text-sm">
                      {formatCurrency(activity.cost)}
                    </p>
                  )}
                </div>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[activity.type].className}`}>
                {TYPE_BADGE[activity.type].label}
              </span>
            </div>
          </div>
          {activity.description && (activity.type === 'expense' || (activity.type === 'payment' && activity.description !== 'Payment received')) && (
            <p className="text-sm text-[var(--muted)] mt-2">{activity.description}</p>
          )}
          {onEdit && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <button
                onClick={() => onEdit(activity)}
                className="text-sm text-[var(--primary)] hover:text-[var(--primary)]/80 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // Desktop table view
  const DesktopActivityTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th
              className="cursor-pointer hover:text-[var(--foreground)]"
              onClick={() => handleSort('date')}
            >
              Date <SortIcon field="date" />
            </th>
            <th
              className="cursor-pointer hover:text-[var(--foreground)]"
              onClick={() => handleSort('property')}
            >
              Property <SortIcon field="property" />
            </th>
            <th
              className="cursor-pointer hover:text-[var(--foreground)]"
              onClick={() => handleSort('type')}
            >
              Type <SortIcon field="type" />
            </th>
            <th>Description</th>
            <th
              className="cursor-pointer hover:text-[var(--foreground)] text-right"
              onClick={() => handleSort('amount')}
            >
              Amount <SortIcon field="amount" />
            </th>
            {onEdit && <th className="w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {activities.slice(0, 50).map((activity) => (
            <tr key={activity.id}>
              <td>{formatDate(activity.date)}</td>
              <td>{activity.propertyName}</td>
              <td>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_BADGE[activity.type].className}`}>
                  {TYPE_BADGE[activity.type].label}
                </span>
              </td>
              <td className="text-[var(--muted)]">{activity.description}</td>
              <td className="text-right font-medium">
                {activity.type === 'payment' ? (
                  <span className="text-green-500">+{formatCurrency(activity.amount!)}</span>
                ) : activity.type === 'expense' ? (
                  <span className="text-red-500">-{formatCurrency(activity.amount!)}</span>
                ) : (
                  <div>
                    <span className="text-[var(--primary)]">{activity.usage?.toLocaleString()} gal</span>
                    {activity.cost !== undefined && (
                      <span className="text-red-500 ml-2 text-sm">({formatCurrency(activity.cost)})</span>
                    )}
                  </div>
                )}
              </td>
              {onEdit && (
                <td className="text-right">
                  <button
                    onClick={() => onEdit(activity)}
                    className="p-1 text-[var(--muted)] hover:text-[var(--primary)] transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <MobileActivityList />
      <DesktopActivityTable />
    </div>
  );
}
