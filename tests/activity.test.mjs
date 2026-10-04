// Tests for the Dashboard's Recent Activity (src/lib/activity.ts), the expense list helpers
// (src/lib/profitability.ts) and getTodayString (src/lib/data.ts).
//
// Run with `npm test`. Same resolve hook as profitability.test.mjs: node runs the .ts
// source by stripping types and cannot resolve an extensionless relative import itself.

// Pin the zone before any Date exists: getTodayString's bug only shows where local and UTC
// disagree about the date, which in California is every evening.
process.env.TZ = 'America/Los_Angeles';

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

const { expenseActivity, compareActivities, COMPANY_LABEL } = await import('../src/lib/activity.ts');
const { upsertExpense, removeExpense } = await import('../src/lib/profitability.ts');
const { getTodayString } = await import('../src/lib/data.ts');

const expense = (id, category, paidDate, amount, notes = '') => ({ id, category, paidDate, amount, notes });
const item = (type, date, amount, propertyName = 'Dahm') => ({
  id: `${type}-${date}-${amount}`, originalId: 'x', date, type, propertyId: 'p', propertyName, description: '', amount,
});

test('expenseActivity: dated when paid, filed under the company, category and notes as the description', () => {
  const a = expenseActivity(expense('e1', 'Repairs', '2026-08-05', 2033.14, 'Chappell, Pump and valve replacement'));
  assert.equal(a.id, 'expense-e1');
  assert.equal(a.originalId, 'e1');
  assert.equal(a.type, 'expense');
  assert.equal(a.date, '2026-08-05');
  assert.equal(a.amount, 2033.14);
  assert.equal(a.propertyName, COMPANY_LABEL);
  assert.equal(a.propertyId, '');
  assert.equal(a.description, 'Repairs · Chappell, Pump and valve replacement');
  assert.equal(expenseActivity(expense('e2', 'PG&E', '2026-09-23', 198.83)).description, 'PG&E');
});

test('compareActivities sorts by type as payment, expense, reading so both menu labels stay true', () => {
  const list = [item('reading', '2026-09-01', 0), item('expense', '2026-09-02', 50), item('payment', '2026-09-03', 50)];
  const asc = [...list].sort((a, b) => compareActivities(a, b, 'type')).map((i) => i.type);
  assert.deepEqual(asc, ['payment', 'expense', 'reading'], '"Type (Payments first)"');
  const desc = [...list].sort((a, b) => -compareActivities(a, b, 'type')).map((i) => i.type);
  assert.deepEqual(desc, ['reading', 'expense', 'payment'], '"Type (Readings first)"');
});

test('compareActivities by date, property and amount', () => {
  const older = item('expense', '2026-08-05', 2033.14, 'Company');
  const newer = item('payment', '2026-09-21', 141.29, 'Alosi');
  assert.ok(compareActivities(older, newer, 'date') < 0);
  assert.ok(compareActivities(older, newer, 'property') > 0, 'Alosi before Company');
  assert.ok(compareActivities(older, newer, 'amount') > 0, 'the $2,033 expense is the larger amount');
});

test('upsertExpense replaces by id or adds; removeExpense drops by id', () => {
  const list = [expense('a', 'PG&E', '2026-09-23', 198.83), expense('b', 'Repairs', '2026-08-10', 2300)];
  const edited = upsertExpense(list, expense('b', 'Repairs', '2026-08-10', 2350, 'corrected'));
  assert.equal(edited.length, 2);
  assert.equal(edited[1].amount, 2350);
  assert.equal(list[1].amount, 2300, 'the original list is not changed');
  const added = upsertExpense(list, expense('c', 'Water Tax', '2026-10-04', 45));
  assert.deepEqual(added.map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(removeExpense(list, 'a').map((e) => e.id), ['b']);
  assert.equal(removeExpense(list, 'zzz').length, 2);
});

test('getTodayString is the local date, including in the evening when UTC has moved on', () => {
  assert.equal(getTodayString(new Date(2026, 9, 4, 22, 30)), '2026-10-04', '10:30 PM on 4 October in California');
  assert.equal(getTodayString(new Date(2026, 9, 4, 0, 5)), '2026-10-04', 'just after midnight');
  assert.equal(getTodayString(new Date(2026, 11, 31, 23, 59)), '2026-12-31', 'New Year\'s Eve, not New Year\'s Day');
  assert.match(getTodayString(), /^\d{4}-\d{2}-\d{2}$/);
});
