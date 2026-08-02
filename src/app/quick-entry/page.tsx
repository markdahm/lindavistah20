'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppData } from '@/lib/types';
import { loadData, saveData, generateId, getTodayString } from '@/lib/data';
import { getCurrentBillingPeriod } from '@/lib/billing';
import { parseQuickEntry, toMeterReadings } from '@/lib/quickEntry';

const PLACEHOLDER = `2026-07
Patin           571615
Dahm            307743
Alosi           861737
Vandeneynde 1  1136770
Vandeneynde 2   110705`;

export default function QuickEntryPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [readingDate, setReadingDate] = useState(getTodayString());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load data');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => {
    if (!data || !text.trim()) return null;
    return parseQuickEntry(text, data.properties, data.readings, getCurrentBillingPeriod());
  }, [data, text]);

  const canSave =
    !!result && result.errors.length === 0 && result.entries.length > 0 && !saving;

  const handleSave = async () => {
    if (!result || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Re-read immediately before writing. The API replaces the whole document, so this
      // narrows the window in which another change could be overwritten.
      const current = await loadData();

      const clash = current.readings.find((r) =>
        result.entries.some(
          (e) => e.meterId === r.meterId && r.billingPeriod === result.billingPeriod
        )
      );
      if (clash) {
        throw new Error(
          `A reading for ${result.billingPeriod} was added by someone else while this page was open. Reload and check before saving.`
        );
      }

      const additions = toMeterReadings(
        result.entries,
        result.billingPeriod,
        readingDate,
        generateId
      );

      await saveData({ ...current, readings: [...current.readings, ...additions] });

      setSavedCount(additions.length);
      setText('');
      setData(await loadData());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Quick Entry</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Paste one line per meter. Readings are added to the existing history &mdash; nothing
        else is changed or replaced.
      </p>

      {loadError && (
        <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200">
          <p className="font-semibold">Could not load current data</p>
          <p className="text-sm">{loadError}</p>
        </div>
      )}

      {savedCount !== null && (
        <div className="mb-4 p-4 rounded-lg bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-200">
          <p className="font-semibold">
            Added {savedCount} reading{savedCount === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <label htmlFor="quick-entry-text" className="block text-sm font-medium text-[var(--foreground)] mb-2">
        Readings
      </label>
      <textarea
        id="quick-entry-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSavedCount(null);
          setSaveError(null);
        }}
        placeholder={PLACEHOLDER}
        rows={8}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full px-3 py-3 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--foreground)] font-mono text-base leading-relaxed"
      />

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="quick-entry-date" className="block text-sm font-medium text-[var(--foreground)] mb-1">
            Reading date
          </label>
          <input
            id="quick-entry-date"
            type="date"
            value={readingDate}
            onChange={(e) => setReadingDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-[var(--foreground)]"
          />
        </div>
        {result && (
          <div className="text-sm text-[var(--muted)] pb-2">
            Billing period{' '}
            <span className="font-semibold text-[var(--foreground)]">{result.billingPeriod}</span>
            {!result.periodFromPaste && ' (default — add a YYYY-MM line to change it)'}
          </div>
        )}
      </div>

      {result && result.errors.length > 0 && (
        <div className="mt-4 p-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200">
          <p className="font-semibold mb-1">Fix these before saving</p>
          <ul className="text-sm list-disc list-inside space-y-1">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result && result.entries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            About to add {result.entries.length} reading{result.entries.length === 1 ? '' : 's'}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--border)]">
                <tr>
                  <th className="text-left px-2 sm:px-3 py-2 font-semibold text-[var(--foreground)]">Household</th>
                  <th className="hidden sm:table-cell text-left px-3 py-2 font-semibold text-[var(--foreground)]">Meter</th>
                  <th className="text-right px-2 sm:px-3 py-2 font-semibold text-[var(--foreground)]">Reading</th>
                  <th className="hidden sm:table-cell text-right px-3 py-2 font-semibold text-[var(--foreground)]">Previous</th>
                  <th className="text-right px-2 sm:px-3 py-2 font-semibold text-[var(--foreground)]">Gallons</th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((e) => (
                  <tr key={e.meterId} className="border-t border-[var(--border)]">
                    <td className="px-2 sm:px-3 py-2 text-[var(--foreground)]">
                      {e.propertyName}
                      {/* Meter has its own column from sm up; inline it on narrow screens. */}
                      <span className="sm:hidden text-[var(--muted)]"> · {e.meterLabel}</span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-[var(--muted)]">{e.meterLabel}</td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-[var(--foreground)]">
                      {e.readingValue.toLocaleString()}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                      {e.previousValue === null ? '—' : e.previousValue.toLocaleString()}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right tabular-nums font-semibold text-[var(--foreground)]">
                      {e.usage.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.entries.some((e) => e.warnings.length > 0) && (
            <div className="mt-3 p-4 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">Worth checking</p>
              <ul className="text-sm list-disc list-inside space-y-1">
                {result.entries.flatMap((e) =>
                  e.warnings.map((w, i) => (
                    <li key={`${e.meterId}-${i}`}>
                      {e.propertyName} / {e.meterLabel}: {w}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {saveError && (
        <div className="mt-4 p-4 rounded-lg bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200">
          <p className="font-semibold">Could not save</p>
          <p className="text-sm">{saveError}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="mt-6 w-full md:w-auto px-6 py-3 rounded-lg bg-[var(--primary)] text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Adding…' : 'Add readings'}
      </button>
    </div>
  );
}
