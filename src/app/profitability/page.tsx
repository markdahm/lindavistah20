'use client';

// Profitability: what the company took in against what it paid out, the last 13 months.
//
// Revenue has two readings and the page shows one at a time:
//   Received — payments by the month they arrived (the default; matches how expenses are
//              placed, by the month they were paid).
//   Billed   — invoice totals by billing period, the same arithmetic as the Invoices page.
// Expenses are the `expenses` array on the document, entered on the Entry tab.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AppData } from '@/lib/types';
import { loadData } from '@/lib/data';
import {
  EXPENSE_CATEGORIES,
  DEFAULT_MONTHS,
  currentPeriod,
  formatDollars,
  formatMonthYear,
  formatSignedDollars,
  profitabilityInput,
  profitabilityRows,
  totals,
  type RevenueBasis,
} from '@/lib/profitability';
import ProfitabilityChart, { REVENUE_LABEL, netClass } from '@/components/ProfitabilityChart';

const BASIS_HELP: Record<RevenueBasis, string> = {
  received: 'Payments, in the month they were received.',
  billed: 'Invoice totals, in the month of the billing period (the month the water was used).',
};

export default function ProfitabilityPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [basis, setBasis] = useState<RevenueBasis>('received');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const endPeriod = currentPeriod();

  const rows = useMemo(
    () => (data ? profitabilityRows(profitabilityInput(data), basis, endPeriod, DEFAULT_MONTHS) : []),
    [data, basis, endPeriod]
  );
  const sums = useMemo(() => totals(rows), [rows]);

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
          <button onClick={() => window.location.reload()} className="mt-4 btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const windowLabel = `${formatMonthYear(rows[0].period)} to ${formatMonthYear(rows[rows.length - 1].period)}`;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profitability</h1>
        <p className="text-sm text-[var(--muted)] mt-1">{windowLabel}, {rows.length} months</p>
      </div>

      {/* Totals over the window */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-[var(--muted)]">{REVENUE_LABEL[basis]}</p>
          <p className="text-2xl font-semibold mt-1">{formatDollars(sums.revenue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Expenses</p>
          <p className="text-2xl font-semibold mt-1">{formatDollars(sums.expenseTotal)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-[var(--muted)]">Net</p>
          <p className={`text-2xl font-semibold mt-1 ${netClass(sums.net)}`}>{formatSignedDollars(sums.net)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Revenue and Expenses by Month</h2>
            <p className="text-sm text-[var(--muted)]">{BASIS_HELP[basis]} Tap a month for its numbers.</p>
          </div>
          <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 self-start" role="group" aria-label="Revenue basis">
            {(['received', 'billed'] as RevenueBasis[]).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={basis === b}
                onClick={() => setBasis(b)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  basis === b ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {REVENUE_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <ProfitabilityChart rows={rows} basis={basis} selected={selected} onSelect={setSelected} />
      </div>

      {/* Month by month */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Month by Month</h2>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm tabular-nums min-w-[640px]">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 px-3 font-medium text-right">{REVENUE_LABEL[basis]}</th>
                {EXPENSE_CATEGORIES.map((c) => (
                  <th key={c} className="py-2 px-3 font-medium text-right">
                    {c}
                  </th>
                ))}
                <th className="py-2 px-3 font-medium text-right">Expenses</th>
                <th className="py-2 pl-3 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => (
                <tr
                  key={row.period}
                  className={`border-b border-[var(--border)] last:border-b-0 ${row.period === selected ? 'bg-[var(--primary)]/10' : ''}`}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">{formatMonthYear(row.period)}</td>
                  <td className="py-2 px-3 text-right">{formatDollars(row.revenue)}</td>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <td key={c} className={`py-2 px-3 text-right ${row.expenses[c] === 0 ? 'text-[var(--muted)]' : ''}`}>
                      {row.expenses[c] === 0 ? '–' : formatDollars(row.expenses[c])}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right">{formatDollars(row.expenseTotal)}</td>
                  <td className={`py-2 pl-3 text-right font-medium ${netClass(row.net)}`}>{formatSignedDollars(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right">{formatDollars(sums.revenue)}</td>
                {EXPENSE_CATEGORIES.map((c) => (
                  <td key={c} className="py-2 px-3 text-right">
                    {formatDollars(sums.expenses[c])}
                  </td>
                ))}
                <td className="py-2 px-3 text-right">{formatDollars(sums.expenseTotal)}</td>
                <td className={`py-2 pl-3 text-right ${netClass(sums.net)}`}>{formatSignedDollars(sums.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Expenses are entered on the{' '}
        <Link href="/quick-entry" className="text-[var(--primary)] font-medium hover:underline">
          Entry tab
        </Link>
        , under the meter readings.
      </p>
    </div>
  );
}
