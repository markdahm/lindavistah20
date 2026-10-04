// The Dashboard's Recent Activity: payments, meter readings and expenses in one list.
//
// Pure functions only, so tests/activity.test.mjs can prove them. ActivityTable builds
// payment and reading items itself (they need the property names and billing settings);
// expenses come from expenseActivity() here, because they belong to no household.

import type { Expense } from './types';

export type ActivityKind = 'payment' | 'reading' | 'expense';

export interface ActivityItem {
  id: string;
  originalId: string;
  date: string;
  type: ActivityKind;
  propertyId: string;
  propertyName: string;
  description: string;
  /** Payments: money in. Expenses: money out, stored positive. */
  amount?: number;
  usage?: number;
  readingValue?: number;
  cost?: number;
  runningBalance?: number;
}

export type ActivitySortField = 'date' | 'property' | 'type' | 'amount';

/** What the Property column says for an expense: it is the water company's, not a household's. */
export const COMPANY_LABEL = 'Company';

export function expenseActivity(e: Expense): ActivityItem {
  return {
    id: `expense-${e.id}`,
    originalId: e.id,
    date: e.paidDate,
    type: 'expense',
    propertyId: '',
    propertyName: COMPANY_LABEL,
    description: e.notes ? `${e.category} · ${e.notes}` : e.category,
    amount: e.amount,
  };
}

// "Type (Payments first)" ascending, "Type (Readings first)" descending, expenses between,
// so neither menu label becomes untrue now that there is a third type.
const TYPE_RANK: Record<ActivityKind, number> = { payment: 0, expense: 1, reading: 2 };

/** Ascending comparison on one field; the caller flips it for descending. */
export function compareActivities(a: ActivityItem, b: ActivityItem, field: ActivitySortField): number {
  switch (field) {
    case 'date':
      return a.date.localeCompare(b.date);
    case 'property':
      return a.propertyName.localeCompare(b.propertyName);
    case 'type':
      return TYPE_RANK[a.type] - TYPE_RANK[b.type];
    case 'amount':
      return (a.amount || a.usage || 0) - (b.amount || b.usage || 0);
  }
}
