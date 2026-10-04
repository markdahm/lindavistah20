'use client';

// Expense entry: the Add Expense button, the list of what has been entered, and the form.
// Lives on the Entry tab beside the meter readings. The Profitability tab only reads.
//
// Saving re-reads the document first and writes it back with only `expenses` replaced,
// the same habit as the readings entry above it: the API replaces the whole document, so
// writing a copy loaded minutes ago could drop a reading added since.

import { useState } from 'react';
import type { AppData, Expense } from '@/lib/types';
import { loadData, saveData } from '@/lib/data';
import { formatDateLong, formatDollars } from '@/lib/profitability';
import ExpenseModal from './ExpenseModal';
import { CATEGORY_COLOR } from './ProfitabilityChart';

interface Props {
  data: AppData;
  /** Called with the freshly re-read document after a successful save. */
  onData: (data: AppData) => void;
}

export default function ExpensesCard({ data, onData }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const expenses = [...(data.expenses ?? [])].sort((a, b) => b.paidDate.localeCompare(a.paidDate));

  const persist = async (change: (current: Expense[]) => Expense[], message: string) => {
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const current = await loadData();
      await saveData({ ...current, expenses: change(current.expenses ?? []) });
      onData(await loadData());
      setSavedMessage(message);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (expense: Expense) => {
    void persist(
      (current) =>
        current.some((e) => e.id === expense.id)
          ? current.map((e) => (e.id === expense.id ? expense : e))
          : [...current, expense],
      `Saved ${expense.category} ${formatDollars(expense.amount)} for ${formatDateLong(expense.paidDate)}`
    );
  };

  const handleDelete = (id: string) => {
    const gone = expenses.find((e) => e.id === id);
    void persist(
      (current) => current.filter((e) => e.id !== id),
      gone ? `Deleted ${gone.category} ${formatDollars(gone.amount)}` : 'Deleted'
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold">Expenses</h2>
          <p className="text-sm text-[var(--muted)]">
            PG&amp;E, property tax and water tax, as they are paid. They show on the Profitability tab.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          disabled={saving}
          className="btn-primary whitespace-nowrap disabled:opacity-40"
        >
          Add Expense
        </button>
      </div>

      {savedMessage && (
        <div className="my-3 p-3 rounded-lg bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200 text-sm font-medium">
          {savedMessage}
        </div>
      )}
      {saveError && (
        <div className="my-3 p-3 rounded-lg bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 text-sm">
          <p className="font-semibold">Could not save</p>
          <p>{saveError}. The list shows what the store still holds.</p>
        </div>
      )}

      {expenses.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-4">
          No expenses recorded yet. Add each PG&amp;E bill, property tax installment and water tax payment as you pay it.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] mt-2">
          {expenses.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(e);
                  setShowModal(true);
                }}
                className="w-full flex items-center gap-3 py-3 text-left hover:bg-[var(--border)]/40 rounded-lg px-2 -mx-2 transition-colors"
                aria-label={`Edit ${e.category} expense of ${formatDollars(e.amount)} paid ${formatDateLong(e.paidDate)}`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ background: CATEGORY_COLOR[e.category] ?? CATEGORY_COLOR.Other }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{e.category}</span>
                  <span className="block text-sm text-[var(--muted)] truncate">
                    {formatDateLong(e.paidDate)}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatDollars(e.amount)}</span>
                <svg className="w-4 h-4 text-[var(--muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ExpenseModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        expense={editing}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
