'use client';

// Revenue against expenses, one column per month: a revenue bar beside a stack of the
// expense categories, with the month's net underneath. Plain HTML and CSS, like the
// other charts in this app; colors come from the --chart-* variables in globals.css so the
// dark theme gets its own validated steps rather than a flipped light one.
//
// The key doubles as a filter: tapping a series shows it alone, rescales the axis to it and
// puts its amount under each month in place of the net; tapping it again shows everything.
// Only the plot is filtered. The key keeps every series, and the month detail below the
// chart (and the table on the page) always shows all of them.

import { useState } from 'react';
import type { ExpenseCategory } from '@/lib/types';
import {
  EXPENSE_CATEGORIES,
  axisTicks,
  chartPeak,
  formatAxisMonth,
  formatDollars,
  formatMonthYear,
  formatSignedDollars,
  formatWholeDollars,
  seriesValue,
  type MonthRow,
  type RevenueBasis,
  type SeriesKey,
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
  const [isolated, setIsolated] = useState<SeriesKey | null>(null);

  const series: { key: SeriesKey; label: string; color: string }[] = [
    { key: 'revenue', label: REVENUE_LABEL[basis], color: 'var(--chart-revenue)' },
    ...EXPENSE_CATEGORIES.map((c) => ({ key: c as SeriesKey, label: c as string, color: CATEGORY_COLOR[c] })),
  ];
  const isolatedLabel = isolated ? series.find((s) => s.key === isolated)?.label ?? '' : '';
  const showRevenue = isolated === null || isolated === 'revenue';
  const showExpenses = isolated !== 'revenue';

  const peak = chartPeak(rows, isolated);
  const { top, ticks } = axisTicks(peak);
  const hasAnything = peak > 0;
  const selectedRow = selected ? rows.find((r) => r.period === selected) ?? null : null;

  return (
    <div>
      {/* Legend — identity never rides on color alone. Each item is also the filter. */}
      <div className="flex flex-wrap gap-x-1 gap-y-1 text-xs mb-1" role="group" aria-label="Show one series alone">
        {series.map((s) => {
          const on = isolated === s.key;
          const dimmed = isolated !== null && !on;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              title={on ? 'Show everything' : `Show ${s.label} alone`}
              onClick={() => setIsolated(on ? null : s.key)}
              className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-colors ${
                on
                  ? 'bg-[var(--border)]/60 text-[var(--foreground)] font-medium'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/40'
              } ${dimmed ? 'opacity-50' : ''}`}
            >
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--muted)] mb-3 min-h-[1rem]">
        {isolated ? `Showing ${isolatedLabel} only. Tap it again to show everything.` : ''}
      </p>

      <div className="overflow-x-auto -mx-2 px-2 pt-2">
        <div className="min-w-[640px]">
          <div className="flex">
            {/* Y axis */}
            <div className="relative w-12 h-56 shrink-0 text-[10px] text-[var(--muted)] tabular-nums">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-2 translate-y-1/2"
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
                  const shown = isolated && isolated !== 'revenue' ? [isolated] : [...EXPENSE_CATEGORIES];
                  const stackOrder = shown.filter((c) => row.expenses[c] > 0);
                  const topCategory = stackOrder[stackOrder.length - 1];
                  const month = formatMonthYear(row.period);
                  const summary = isolated
                    ? `${month}: ${isolatedLabel} ${formatDollars(seriesValue(row, isolated))}`
                    : `${month}: ${REVENUE_LABEL[basis].toLowerCase()} ${formatDollars(row.revenue)}, expenses ${formatDollars(row.expenseTotal)}, net ${formatSignedDollars(row.net)}`;
                  return (
                    <button
                      key={row.period}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={summary}
                      title={summary}
                      onClick={() => onSelect(isSelected ? null : row.period)}
                      className={`flex-1 h-full flex items-end justify-center gap-[2px] px-[3px] rounded-t transition-colors ${
                        isSelected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--border)]/40'
                      }`}
                    >
                      {/* Revenue bar */}
                      {showRevenue && (
                        <div className="flex-1 max-w-[24px] h-full flex items-end">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${(row.revenue / top) * 100}%`,
                              background: 'var(--chart-revenue)',
                            }}
                          />
                        </div>
                      )}
                      {/* Expense stack: bottom to top in category order, 2px surface gaps */}
                      {showExpenses && (
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
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Month labels, and under each the net — or the isolated series' amount */}
          <div className="flex">
            <div className="w-12 shrink-0" />
            {rows.map((row) => {
              const isSelected = row.period === selected;
              const value = isolated ? seriesValue(row, isolated) : 0;
              return (
                <div key={row.period} className="flex-1 text-center mt-2 min-w-0">
                  <div className={`flex justify-center whitespace-nowrap text-xs ${isSelected ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}>
                    {formatAxisMonth(row.period)}
                  </div>
                  {isolated ? (
                    <div className="flex justify-center whitespace-nowrap text-[11px] tabular-nums mt-0.5 text-[var(--muted)]">
                      {value === 0 ? '–' : formatWholeDollars(value)}
                    </div>
                  ) : (
                    <div className={`flex justify-center whitespace-nowrap text-[11px] tabular-nums mt-0.5 ${netClass(row.net)}`}>
                      {formatSignedDollars(row.net)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!hasAnything && (
        <p className="text-sm text-[var(--muted)] mt-4">
          {isolated
            ? `Nothing to chart: no ${isolatedLabel} in these months.`
            : `Nothing to chart yet: no ${REVENUE_LABEL[basis].toLowerCase()} revenue and no expenses in these months.`}
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
