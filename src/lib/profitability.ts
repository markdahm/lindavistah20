// Profitability: revenue against expenses, month by month.
//
// Pure functions only — no React, no fetch, no Date.now() except in currentPeriod(), which
// takes the clock as an argument so a test can pin it. Everything the Profitability page
// shows is computed here so it can be proved by tests/profitability.test.mjs rather than by
// reading the screen.
//
// Months are handled as 'YYYY-MM' strings and dates as 'YYYY-MM-DD' strings, sliced rather
// than parsed through Date — a Date built from '2026-03-01' is UTC midnight, which is the
// evening of 28 February in California, and would file a first-of-the-month payment under
// the wrong month.

import type {
  AppData,
  Expense,
  ExpenseCategory,
  MeterReading,
  Payment,
  Property,
  BillingSettings,
} from './types';
import { calculateBill, getUsageForPeriod } from './billing';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'PG&E',
  'Property Tax',
  'Water Tax',
  'Other',
] as const;

/**
 * Which number counts as the month's revenue.
 *  - received: payments, by the date they were received (cash basis).
 *  - billed: invoice totals, by billing period — the same rule the Invoices page uses
 *    (every property with usage > 0 for that period is billed calculateBill(usage)).
 */
export type RevenueBasis = 'received' | 'billed';

export const DEFAULT_MONTHS = 13;

export interface MonthRow {
  /** 'YYYY-MM' */
  period: string;
  revenue: number;
  expenses: Record<ExpenseCategory, number>;
  expenseTotal: number;
  net: number;
}

export interface Totals {
  revenue: number;
  expenses: Record<ExpenseCategory, number>;
  expenseTotal: number;
  net: number;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isPeriod(s: string): boolean {
  return PERIOD_RE.test(s);
}

export function isDateString(s: string): boolean {
  return DATE_RE.test(s);
}

/** Move a 'YYYY-MM' period by delta months (negative goes back). */
export function shiftPeriod(period: string, delta: number): string {
  if (!isPeriod(period)) throw new Error(`not a period: ${period}`);
  const [y, m] = period.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const ny = Math.floor(index / 12);
  const nm = index - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** The n periods ending at `end`, oldest first. */
export function lastNMonths(end: string, n: number): string[] {
  if (n < 1) return [];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftPeriod(end, -i));
  return out;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM'. Returns null for anything that is not a date string. */
export function monthOf(date: string): string | null {
  return isDateString(date) ? date.slice(0, 7) : null;
}

/** The calendar month the clock is in, in the local time zone. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function emptyByCategory(): Record<ExpenseCategory, number> {
  return { 'PG&E': 0, 'Property Tax': 0, 'Water Tax': 0, Other: 0 };
}

/** Payments summed by the month they were received. */
export function receivedByMonth(payments: Payment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) {
    const period = monthOf(p.receivedDate);
    if (!period) continue;
    out.set(period, (out.get(period) ?? 0) + p.amount);
  }
  return out;
}

/**
 * Invoice totals by billing period. Mirrors the Invoices page: a property is billed for a
 * period only when its usage for that period is above zero, and the bill is
 * calculateBill(usage).totalAmount — fixed fee plus tiered usage.
 */
export function billedByPeriod(
  properties: Property[],
  readings: MeterReading[],
  settings: BillingSettings
): Map<string, number> {
  const periods = new Set(readings.map((r) => r.billingPeriod));
  const out = new Map<string, number>();
  for (const period of periods) {
    let total = 0;
    for (const property of properties) {
      const usage = getUsageForPeriod(property.id, period, readings);
      if (usage <= 0) continue;
      total += calculateBill(usage, settings).totalAmount;
    }
    out.set(period, total);
  }
  return out;
}

/** Expenses summed by category for the month they were paid. */
export function expensesByMonth(expenses: Expense[]): Map<string, Record<ExpenseCategory, number>> {
  const out = new Map<string, Record<ExpenseCategory, number>>();
  for (const e of expenses) {
    const period = monthOf(e.paidDate);
    if (!period) continue;
    const row = out.get(period) ?? emptyByCategory();
    const category: ExpenseCategory = EXPENSE_CATEGORIES.includes(e.category) ? e.category : 'Other';
    row[category] += e.amount;
    out.set(period, row);
  }
  return out;
}

export interface ProfitabilityInput {
  properties: Property[];
  readings: MeterReading[];
  payments: Payment[];
  expenses: Expense[];
  settings: BillingSettings;
}

/** Pull the inputs out of a stored document. An old document has no `expenses` key. */
export function profitabilityInput(data: AppData): ProfitabilityInput {
  return {
    properties: data.properties,
    readings: data.readings,
    payments: data.payments,
    expenses: data.expenses ?? [],
    settings: data.settings,
  };
}

/**
 * One row per month for the `months` months ending at `endPeriod`, oldest first. Every month
 * in the window is present, with zeros where nothing happened, so the chart has a column
 * for each.
 */
export function profitabilityRows(
  input: ProfitabilityInput,
  basis: RevenueBasis,
  endPeriod: string,
  months: number = DEFAULT_MONTHS
): MonthRow[] {
  const revenue =
    basis === 'received'
      ? receivedByMonth(input.payments)
      : billedByPeriod(input.properties, input.readings, input.settings);
  const spent = expensesByMonth(input.expenses);

  return lastNMonths(endPeriod, months).map((period) => {
    const expenses = spent.get(period) ?? emptyByCategory();
    const expenseTotal = EXPENSE_CATEGORIES.reduce((sum, c) => sum + expenses[c], 0);
    const rev = revenue.get(period) ?? 0;
    return { period, revenue: rev, expenses, expenseTotal, net: rev - expenseTotal };
  });
}

export function totals(rows: MonthRow[]): Totals {
  const expenses = emptyByCategory();
  let revenue = 0;
  for (const row of rows) {
    revenue += row.revenue;
    for (const c of EXPENSE_CATEGORIES) expenses[c] += row.expenses[c];
  }
  const expenseTotal = EXPENSE_CATEGORIES.reduce((sum, c) => sum + expenses[c], 0);
  return { revenue, expenses, expenseTotal, net: revenue - expenseTotal };
}

/**
 * A clean axis for the chart: the smallest 1/2/5 × 10^k step that covers `max` in at most
 * five ticks above zero. Returns the ticks from 0 up to and including the top.
 */
export function axisTicks(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)) - 1);
  for (const unit of [1, 2, 5, 10, 20, 50, 100]) {
    const step = unit * magnitude;
    if (Math.ceil(max / step) <= 5) {
      const top = Math.ceil(max / step) * step;
      const ticks: number[] = [];
      for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
      return { top, ticks };
    }
  }
  // Unreachable: step 100*magnitude = 10^(k+1) > max, so one tick always suffices by then.
  return { top: max, ticks: [0, max] };
}

/** What is wrong with an expense as typed, or an empty list if it is sound. */
export function validateExpense(e: {
  category: string;
  paidDate: string;
  amount: number;
}): string[] {
  const problems: string[] = [];
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(e.category)) {
    problems.push(`Category must be one of ${EXPENSE_CATEGORIES.join(', ')}.`);
  }
  if (!isDateString(e.paidDate)) problems.push('Date paid must be a real date (YYYY-MM-DD).');
  if (!Number.isFinite(e.amount) || e.amount <= 0) problems.push('Amount must be more than zero.');
  return problems;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Oct 2026' */
export function formatMonthYear(period: string): string {
  if (!isPeriod(period)) return period;
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** 'Oct', or "Jan '26" when the year turns so a 13-month axis reads unambiguously. */
export function formatAxisMonth(period: string): string {
  if (!isPeriod(period)) return period;
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `Jan '${String(y).slice(2)}` : MONTHS_SHORT[m - 1];
}

/** Whole dollars with a sign: '+$312', '-$1,204', '$0'. */
export function formatSignedDollars(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return '$0';
  const sign = rounded > 0 ? '+' : '-';
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

/**
 * 'Oct 4, 2026' from 'YYYY-MM-DD', by slicing. `new Date('2026-10-04')` is UTC midnight,
 * which toLocaleDateString renders as 3 October in California.
 */
export function formatDateLong(date: string): string {
  if (!isDateString(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** '$1,234.56' or '-$1,234.56'. */
export function formatDollars(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
