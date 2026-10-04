// Data loading and saving utilities

import type { AppData, Expense } from './types';

// For development: load from local JSON file
// For production: will use GitHub API

export async function loadData(): Promise<AppData> {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new Error('Failed to load data');
  }
  return response.json();
}

export async function saveData(data: AppData): Promise<void> {
  const response = await fetch('/api/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    let details = '';
    try {
      const body = await response.json();
      details = body.details || body.error || '';
    } catch {}
    throw new Error(details ? `Failed to save data: ${details}` : 'Failed to save data');
  }
}

// Generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Date formatting helpers
export function formatDate(dateString: string): string {
  // A bare YYYY-MM-DD parses as UTC midnight, which is the evening before in California,
  // so every payment and reading date showed one day early. Build those as local dates.
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const date = bare
    ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))
    : new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Today as YYYY-MM-DD in the local time zone. toISOString() is UTC, which in California is
// already tomorrow from 5 PM (4 PM in winter), so an evening entry defaulted to the wrong day.
export function getTodayString(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * Change the expenses list and save; returns the document as saved.
 *
 * The expenses come from the page (`local`), everything else from a fresh read. The live
 * store is a blob behind a CDN that has lagged a write by about 90 seconds (4 October 2026),
 * so a fresh read can be missing an expense this page saved a moment ago: rebuilding the list
 * from it would drop that expense on the next save. The page itself always holds its own
 * latest saves. Payments and readings are taken fresh so a page left open does not put back
 * ones changed elsewhere. The cost: an expense added in another tab since this page loaded
 * is overwritten, so reload before editing expenses in two places at once.
 * Returns what was written rather than re-reading it, for the same lag.
 */
export async function updateExpenses(
  local: Expense[] | undefined,
  change: (current: Expense[]) => Expense[]
): Promise<AppData> {
  const current = await loadData();
  const next = { ...current, expenses: change(local ?? current.expenses ?? []) };
  await saveData(next);
  return next;
}
