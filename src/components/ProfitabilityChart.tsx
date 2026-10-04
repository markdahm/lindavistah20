'use client';

// Revenue against expenses, one column per month: a revenue bar beside a stack of the
// expense categories, with the month's net underneath. Plain HTML and CSS, like the
// other charts in this app; colors come from the --chart-* variables in globals.css so the
// dark theme gets its own validated steps rather than a flipped light one.

import type { ExpenseCategory } from '@/lib/types';
import {
  EXPENSE_CATEGORIES,
  axisTicks,
  formatAxisMonth,
  formatDollars,
  formatMonthYear,
  formatSignedDollars,
  type MonthRow,
  type RevenueBasis,
} from '@/lib/profitability';

export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  'PG&E': 'var(--chart-pge)',
  'Property Tax': 'var(--chart-property-tax)',
  'Water Tax': 'var(--chart-water-tax)',
  Repairs: 'var(--chart-repairs)',
  Other: 'var(--chart-other)',
};

export const REVENUE_LABEL: Record<RevenueBasis, string> = {
  received: 'Received',
  billed: 'Billed',
};

interface Props {
  rows: MonthRow[];
  basis: RevenueBasis;
  selected: string | null;
  onSelect: (period: string | null) => void;
}

function axisLabel(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export function netClass(net: number): string {
  if (net > 0) return 'text-[var(--net-positive)]';
  if (net < 0) return 'text-[var(--net-negative)]';
  return 'text-[var(--muted)]';
}

export default function ProfitabilityChart({ rows, basis, selected, onSelect }: Props) {
  const peak = rows.reduce((m, r) => Math.max(m, r.revenue, r.expenseTotal), 0);
  const { top, ticks } = axisTicks(peak);
  const hasAnything = peak > 0;
  const selectedRow = selected ? rows.find((r) => r.period === selected) ?? null : null;

  return (
    <div>
      {/* Legend — identity never rides on color alone */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)] mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--chart-revenue)' }} />
          {REVENUE_LABEL[basis]}
        </span>
        {EXPENSE_CATEGORIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: CATEGORY_COLOR[c] }} />
            {c}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <div className="min-w-[640px]">
          <div className="flex">
            {/* Y axis */}
            <div className="relative w-12 h-56 shrink-0 text-[10px] text-[var(--muted)] tabular-nums">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-2 -translate-y-1/2"
                  style={{ bottom: `${(t / top) * 100}%` }}
                >
                  {axisLabel(t)}
                </span>
              ))}
            </div>

            {/* Plot */}
            <div className="relative flex-1 h-56">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute left-0 right-0 h-px"
                  style={{
                    bottom: `${(t / top) * 100}%`,
                    background: t === 0 ? 'var(--border)' : 'var(--chart-grid)',
                  }}
                />
              ))}
              <div className="absolute inset-0 flex">
                {rows.map((row) => {
                  const isSelected = row.period === selected;
                  const stackOrder = [...EXPENSE_CATEGORIES].filter((c) => row.expenses[c] > 0);
                  const topCategory = stackOrder[stackOrder.length - 1];
                  return (
                    <button
                      key={row.period}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${formatMonthYear(row.period)}: ${REVENUE_LABEL[basis].toLowerCase()} ${formatDollars(row.revenue)}, expenses ${formatDollars(row.expenseTotal)}, net ${formatSignedDollars(row.net)}`}
                      title={`${formatMonthYear(row.period)} · ${REVENUE_LABEL[basis]} ${formatDollars(row.revenue)} · Expenses ${formatDollars(row.expenseTotal)} · Net ${formatSignedDollars(row.net)}`}
                      onClick={() => onSelect(isSelected ? null : row.period)}
                      className={`flex-1 h-full flex items-end justify-center gap-[2px] px-[3px] rounded-t transition-colors ${
                        isSelected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--border)]/40'
                      }`}
                    >
                      {/* Revenue bar */}
                      <div className="flex-1 max-w-[24px] h-full flex items-end">
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${(row.revenue / top) * 100}%`,
                            background: 'var(--chart-revenue)',
                          }}
                        />
                      </div>
                      {/* Expense stack: bottom to top in category order, 2px surface gaps */}
                      <div className="flex-1 max-w-[24px] h-full flex flex-col-reverse">
                        {stackOrder.map((c, i) => (
                          <div
                            key={c}
                            className={c === topCategory ? 'w-full rounded-t' : 'w-full'}
                            style={{
                              height: `${(row.expenses[c] / top) * 100}%`,
                              background: CATEGORY_COLOR[c],
                              boxSizing: 'border-box',
                              borderTop: i < stackOrder.length - 1 ? '2px solid var(--card-bg)' : undefined,
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Month and net labels */}
          <div className="flex">
            <div className="w-12 shrink-0" />
            {rows.map((row) => {
              const isSelected = row.period === selected;
              return (
                <div key={row.period} className="flex-1 text-center mt-2 min-w-0">
                  <div className={`text-xs ${isSelected ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}>
                    {formatAxisMonth(row.period)}
                  </div>
                  <div className={`text-[11px] tabular-nums mt-0.5 ${netClass(row.net)}`}>
                    {formatSignedDollars(row.net)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!hasAnything && (
        <p className="text-sm text-[var(--muted)] mt-4">
          Nothing to chart yet: no {REVENUE_LABEL[basis].toLowerCase()} revenue and no expenses in these months.
        </p>
      )}

      {selectedRow && (
        <div className="mt-4 p-3 rounded-lg border border-[var(--border)] text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold">{formatMonthYear(selectedRow.period)}</span>
            <span className={`font-semibold tabular-nums ${netClass(selectedRow.net)}`}>
              Net {formatSignedDollars(selectedRow.net)}
            </span>
          </div>
          <div className="mt-1 text-[var(--muted)] tabular-nums">
            {REVENUE_LABEL[basis]} {formatDollars(selectedRow.revenue)} · Expenses {formatDollars(selectedRow.expenseTotal)}
            {selectedRow.expenseTotal > 0 && (
              <>
                {' '}(
                {EXPENSE_CATEGORIES.filter((c) => selectedRow.expenses[c] > 0)
                  .map((c) => `${c} ${formatDollars(selectedRow.expenses[c])}`)
                  .join(', ')}
                )
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
