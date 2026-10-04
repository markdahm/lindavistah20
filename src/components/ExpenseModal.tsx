'use client';

// Add or edit one expense. With an `expense` prop it edits (and offers Delete); without
// one it adds. Validation is validateExpense() from the lib, so the rules are tested.

import { useState } from 'react';
import Modal from './Modal';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { generateId, getTodayString } from '@/lib/data';
import { EXPENSE_CATEGORIES, validateExpense } from '@/lib/profitability';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense?: Expense | null;
  onSave: (expense: Expense) => void;
  onDelete?: (id: string) => void;
}

export default function ExpenseModal({ isOpen, onClose, expense, onSave, onDelete }: ExpenseModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'}>
      {/* Keyed on the expense so each open starts a fresh form from props; the Modal
          unmounts its children when closed, so a reopened "add" is fresh too. */}
      {isOpen && <ExpenseForm key={expense?.id ?? 'new'} expense={expense ?? null} onClose={onClose} onSave={onSave} onDelete={onDelete} />}
    </Modal>
  );
}

function ExpenseForm({
  expense,
  onClose,
  onSave,
  onDelete,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSave: (expense: Expense) => void;
  onDelete?: (id: string) => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'PG&E');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [paidDate, setPaidDate] = useState(expense?.paidDate ?? getTodayString());
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [problems, setProblems] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    const found = validateExpense({ category, paidDate, amount: parsed });
    if (found.length > 0) {
      setProblems(found);
      return;
    }
    onSave({
      id: expense?.id ?? generateId(),
      category,
      paidDate,
      amount: Math.round(parsed * 100) / 100,
      notes: notes.trim(),
    });
    onClose();
  };

  const handleDelete = () => {
    if (!expense || !onDelete) return;
    if (!window.confirm(`Delete this ${expense.category} expense of $${expense.amount.toFixed(2)}?`)) return;
    onDelete(expense.id);
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} required>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Amount</label>
        <div className="relative w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full"
            style={{ paddingLeft: '1.75rem' }}
            placeholder="0.00"
            required
            inputMode="decimal"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Date Paid</label>
        <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
        <p className="text-xs text-[var(--muted)] mt-1">The expense counts in the month it was paid.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., Sept statement, 2nd installment"
        />
      </div>

      {problems.length > 0 && (
        <ul className="text-sm text-red-600 list-disc pl-5 space-y-1">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-3 pt-4">
        {expense && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-500/10 transition-colors"
          >
            Delete
          </button>
        )}
        <button type="button" onClick={onClose} className="flex-1 btn-secondary">
          Cancel
        </button>
        <button type="submit" className="flex-1 btn-primary">
          {expense ? 'Save Changes' : 'Save Expense'}
        </button>
      </div>
    </form>
  );
}
