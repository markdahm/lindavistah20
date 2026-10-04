// Tests for src/lib/profitability.ts — the arithmetic behind the Profitability page.
//
// Run with `npm test` (node --test). Node runs the .ts source directly by stripping types;
// the one thing it cannot do is resolve `./billing` without an extension, so the resolve
// hook below adds `.ts` to extensionless relative imports. Type-only imports in the lib are
// written `import type`, which the stripper erases — a plain `import { Payment }` from a
// file that exports only interfaces would be a SyntaxError at run time.

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const lib = await import('../src/lib/profitability.ts');
const {
  EXPENSE_CATEGORIES,
  shiftPeriod,
  lastNMonths,
  monthOf,
  currentPeriod,
  receivedByMonth,
  billedByPeriod,
  expensesByMonth,
  profitabilityInput,
  profitabilityRows,
  totals,
  axisTicks,
  validateExpense,
  formatAxisMonth,
  formatMonthYear,
  formatSignedDollars,
  formatWholeDollars,
  formatDollars,
  formatDateLong,
  seriesValue,
  chartPeak,
  DEFAULT_MONTHS,
} = lib;

const settings = {
  fixedMonthlyFee: 15,
  tier1Limit: 15000,
  tier1RatePerThousand: 3,
  tier2Limit: 25000,
  tier2RatePerThousand: 3.9,
  tier3Limit: 50000,
  tier3RatePerThousand: 4.9,
};

const properties = [
  { id: 'a', name: 'A', address: '', balanceAdjustment: 0, meters: [] },
  { id: 'b', name: 'B', address: '', balanceAdjustment: 0, meters: [] },
];

const reading = (propertyId, billingPeriod, usage) => ({
  id: `${propertyId}-${billingPeriod}`,
  meterId: 'm',
  propertyId,
  readingDate: `${billingPeriod}-28`,
  billingPeriod,
  readingValue: 0,
  rawUsage: usage,
  usage,
});

const payment = (propertyId, receivedDate, amount) => ({ id: `${propertyId}-${receivedDate}`, propertyId, amount, receivedDate, notes: '' });
const expense = (category, paidDate, amount) => ({ id: `${category}-${paidDate}`, category, paidDate, amount, notes: '' });

test('shiftPeriod crosses year boundaries in both directions', () => {
  assert.equal(shiftPeriod('2026-10', -12), '2025-10');
  assert.equal(shiftPeriod('2026-01', -1), '2025-12');
  assert.equal(shiftPeriod('2025-12', 1), '2026-01');
  assert.equal(shiftPeriod('2026-10', 0), '2026-10');
  assert.throws(() => shiftPeriod('2026-13', 0));
});

test('lastNMonths gives 13 months ending at the end period, oldest first', () => {
  const months = lastNMonths('2026-10', 13);
  assert.equal(months.length, 13);
  assert.equal(months[0], '2025-10');
  assert.equal(months[12], '2026-10');
  assert.deepEqual(months.slice(2, 5), ['2025-12', '2026-01', '2026-02']);
  assert.deepEqual(lastNMonths('2026-10', 0), []);
});

test('monthOf slices the date string and never goes through Date', () => {
  // A UTC parse of 2026-03-01 is 28 Feb in California; slicing must not care.
  assert.equal(monthOf('2026-03-01'), '2026-03');
  assert.equal(monthOf('2026-12-31'), '2026-12');
  assert.equal(monthOf('not a date'), null);
  assert.equal(monthOf('2026-3-1'), null);
  assert.equal(monthOf(''), null);
});

test('currentPeriod reads the local calendar month off the clock it is given', () => {
  assert.equal(currentPeriod(new Date(2026, 9, 4, 9, 0, 0)), '2026-10');
  assert.equal(currentPeriod(new Date(2026, 0, 1, 0, 0, 0)), '2026-01');
});

test('receivedByMonth sums payments by the month received across properties', () => {
  const map = receivedByMonth([
    payment('a', '2026-09-03', 50),
    payment('b', '2026-09-30', 262.44),
    payment('a', '2026-10-01', 50),
    payment('b', 'garbage', 999),
  ]);
  assert.equal(map.get('2026-09'), 312.44);
  assert.equal(map.get('2026-10'), 50);
  assert.equal(map.size, 2, 'an unparseable date is dropped, not filed anywhere');
});

test('billedByPeriod follows the Invoices page: usage > 0 is billed fixed fee plus tiers, zero usage is not billed', () => {
  const readings = [
    reading('a', '2026-08', 10000), // 15 + 30 = 45
    reading('b', '2026-08', 20000), // 15 + 45 + 19.5 = 79.5
    reading('a', '2026-09', 0), // not billed at all — no fixed fee either
    reading('b', '2026-09', 1000), // 15 + 3 = 18
  ];
  const map = billedByPeriod(properties, readings, settings);
  assert.equal(map.get('2026-08'), 124.5);
  assert.equal(map.get('2026-09'), 18);
});

test('billedByPeriod sums several meters of one property before tiering', () => {
  // Two meters on one property in one period: 8000 + 8000 is tiered as 16000, not twice 8000.
  const readings = [
    { ...reading('a', '2026-08', 8000), id: 'm1', meterId: 'm1' },
    { ...reading('a', '2026-08', 8000), id: 'm2', meterId: 'm2' },
  ];
  const map = billedByPeriod(properties, readings, settings);
  // 15 + 15000/1000*3 + 1000/1000*3.9 = 15 + 45 + 3.9
  assert.equal(Math.round(map.get('2026-08') * 100) / 100, 63.9);
});

test('expensesByMonth stacks by category in the month paid and folds unknown categories into Other', () => {
  const map = expensesByMonth([
    expense('PG&E', '2026-09-12', 120.5),
    expense('PG&E', '2026-09-28', 10),
    expense('Property Tax', '2026-09-30', 800),
    expense('Water Tax', '2026-10-02', 45),
    expense('Repairs', '2026-10-03', 1454.14),
    expense('Mystery', '2026-10-02', 5),
  ]);
  assert.deepEqual(map.get('2026-09'), { 'PG&E': 130.5, 'Property Tax': 800, 'Water Tax': 0, Repairs: 0, Other: 0 });
  assert.deepEqual(map.get('2026-10'), { 'PG&E': 0, 'Property Tax': 0, 'Water Tax': 45, Repairs: 1454.14, Other: 5 });
});

test('profitabilityInput reads an old document with no expenses key as empty', () => {
  const input = profitabilityInput({ properties, readings: [], payments: [], invoices: [], neighbors: [], settings });
  assert.deepEqual(input.expenses, []);
});

test('profitabilityRows: every month present, revenue by basis, net = revenue - expenses', () => {
  const input = {
    properties,
    readings: [reading('a', '2026-08', 10000), reading('b', '2026-08', 20000)],
    payments: [payment('a', '2026-09-03', 50), payment('b', '2026-09-03', 100)],
    expenses: [expense('PG&E', '2026-09-12', 30), expense('Water Tax', '2026-08-15', 20)],
    settings,
  };

  const received = profitabilityRows(input, 'received', '2026-10', 13);
  assert.equal(received.length, 13);
  assert.equal(received[0].period, '2025-10');
  assert.equal(received[12].period, '2026-10');
  const sep = received.find((r) => r.period === '2026-09');
  assert.equal(sep.revenue, 150);
  assert.equal(sep.expenseTotal, 30);
  assert.equal(sep.net, 120);
  const aug = received.find((r) => r.period === '2026-08');
  assert.equal(aug.revenue, 0, 'received basis: nothing was received in August');
  assert.equal(aug.net, -20);
  const empty = received.find((r) => r.period === '2026-02');
  assert.deepEqual(empty, { period: '2026-02', revenue: 0, expenses: { 'PG&E': 0, 'Property Tax': 0, 'Water Tax': 0, Repairs: 0, Other: 0 }, expenseTotal: 0, net: 0 });

  const billed = profitabilityRows(input, 'billed', '2026-10', 13);
  const augB = billed.find((r) => r.period === '2026-08');
  assert.equal(augB.revenue, 124.5, 'billed basis: the August period is billed in August');
  assert.equal(augB.net, 104.5);
  const sepB = billed.find((r) => r.period === '2026-09');
  assert.equal(sepB.revenue, 0);
});

test('profitabilityRows leaves out anything before the window', () => {
  const input = {
    properties,
    readings: [],
    payments: [payment('a', '2025-09-30', 1000), payment('a', '2025-10-01', 1)],
    expenses: [expense('Other', '2025-09-30', 500)],
    settings,
  };
  const rows = profitabilityRows(input, 'received', '2026-10', 13);
  const sum = totals(rows);
  assert.equal(sum.revenue, 1, 'the September 2025 payment is outside 13 months ending Oct 2026');
  assert.equal(sum.expenseTotal, 0);
});

test('totals adds the rows and the categories', () => {
  const rows = profitabilityRows(
    {
      properties,
      readings: [],
      payments: [payment('a', '2026-09-03', 50), payment('b', '2026-10-03', 100)],
      expenses: [expense('PG&E', '2026-09-12', 30), expense('PG&E', '2026-10-12', 35), expense('Property Tax', '2026-10-01', 400)],
      settings,
    },
    'received',
    '2026-10',
    13
  );
  const sum = totals(rows);
  assert.equal(sum.revenue, 150);
  assert.equal(sum.expenses['PG&E'], 65);
  assert.equal(sum.expenses['Property Tax'], 400);
  assert.equal(sum.expenseTotal, 465);
  assert.equal(sum.net, -315);
});

test('the default window is 15 months: August 2025 to October 2026', () => {
  assert.equal(DEFAULT_MONTHS, 15);
  const rows = profitabilityRows({ properties, readings: [], payments: [], expenses: [], settings }, 'received', '2026-10');
  assert.equal(rows.length, 15);
  assert.equal(rows[0].period, '2025-08');
  assert.equal(rows[14].period, '2026-10');
});

test('seriesValue and chartPeak: isolating one series scales the chart to that series alone', () => {
  const rows = profitabilityRows(
    {
      properties,
      readings: [],
      payments: [payment('a', '2026-08-03', 300), payment('a', '2026-09-03', 50)],
      expenses: [
        expense('Repairs', '2026-08-05', 4333.14),
        expense('PG&E', '2026-08-20', 281.05),
        expense('Property Tax', '2026-09-02', 62.1),
      ],
      settings,
    },
    'received',
    '2026-10',
    3
  );
  const aug = rows.find((r) => r.period === '2026-08');
  assert.equal(seriesValue(aug, 'revenue'), 300);
  assert.equal(seriesValue(aug, 'Repairs'), 4333.14);
  assert.equal(seriesValue(aug, 'Water Tax'), 0);
  // Everything showing: the tallest revenue bar or expense stack in any month.
  assert.equal(Math.round(chartPeak(rows) * 100) / 100, 4614.19);
  assert.equal(chartPeak(rows, null), chartPeak(rows));
  // One series alone: only that series counts.
  assert.equal(chartPeak(rows, 'revenue'), 300);
  assert.equal(chartPeak(rows, 'Property Tax'), 62.1);
  assert.equal(chartPeak(rows, 'Other'), 0);
});

test('formatWholeDollars rounds to whole dollars with no sign', () => {
  assert.equal(formatWholeDollars(4333.14), '$4,333');
  assert.equal(formatWholeDollars(62.5), '$63');
  assert.equal(formatWholeDollars(0), '$0');
});

test('axisTicks picks a clean 1/2/5 step with at most five ticks above zero', () => {
  assert.deepEqual(axisTicks(0), { top: 1, ticks: [0, 1] });
  assert.deepEqual(axisTicks(312.44), { top: 400, ticks: [0, 100, 200, 300, 400] });
  assert.deepEqual(axisTicks(950), { top: 1000, ticks: [0, 200, 400, 600, 800, 1000] });
  assert.deepEqual(axisTicks(1234), { top: 1500, ticks: [0, 500, 1000, 1500] });
  assert.deepEqual(axisTicks(4800), { top: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] });
  for (const max of [1, 7, 49, 99, 101, 777, 9999, 123456]) {
    const { top, ticks } = axisTicks(max);
    assert.ok(top >= max, `top ${top} covers ${max}`);
    assert.ok(ticks.length >= 2 && ticks.length <= 6, `${max} -> ${ticks.length} ticks`);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], top);
  }
});

test('validateExpense names each problem and passes a sound expense', () => {
  assert.deepEqual(validateExpense({ category: 'PG&E', paidDate: '2026-10-04', amount: 12.5 }), []);
  assert.deepEqual(validateExpense({ category: 'Repairs', paidDate: '2026-08-05', amount: 2033.14 }), []);
  const bad = validateExpense({ category: 'Rent', paidDate: '10/04/2026', amount: 0 });
  assert.equal(bad.length, 3);
  assert.match(bad[0], /Category/);
  assert.match(bad[1], /Date paid/);
  assert.match(bad[2], /Amount/);
  assert.equal(validateExpense({ category: 'Other', paidDate: '2026-10-04', amount: NaN }).length, 1);
  assert.equal(validateExpense({ category: 'Other', paidDate: '2026-10-04', amount: -5 }).length, 1);
});

test('EXPENSE_CATEGORIES is the fixed stacking order', () => {
  assert.deepEqual([...EXPENSE_CATEGORIES], ['PG&E', 'Property Tax', 'Water Tax', 'Repairs', 'Other']);
});

test('formatting', () => {
  assert.equal(formatMonthYear('2026-10'), 'Oct 2026');
  assert.equal(formatAxisMonth('2026-10'), 'Oct');
  assert.equal(formatAxisMonth('2026-01'), "Jan '26");
  assert.equal(formatSignedDollars(312.4), '+$312');
  assert.equal(formatSignedDollars(-1203.6), '-$1,204');
  assert.equal(formatSignedDollars(0.2), '$0');
  assert.equal(formatDollars(1234.5), '$1,234.50');
  assert.equal(formatDollars(-0.5), '-$0.50');
  assert.equal(formatDateLong('2026-10-04'), 'Oct 4, 2026');
  assert.equal(formatDateLong('2026-01-31'), 'Jan 31, 2026');
  assert.equal(formatDateLong('junk'), 'junk');
});
