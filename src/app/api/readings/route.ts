import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readStore, writeStore, StoreUnavailableError } from '@/lib/store';
import { parseQuickEntry, toMeterReadings, ResolvedEntry } from '@/lib/quickEntry';
import { getCurrentBillingPeriod } from '@/lib/billing';

// POST /api/readings — append month readings without replacing the document.
//
// Body:
//   text         required, the same block pasted into Quick Entry
//   readingDate  optional, YYYY-MM-DD, defaults to today
//   dryRun       optional, true returns the preview and writes nothing
//
// Deliberately shares parseQuickEntry with the Quick Entry screen, so the API cannot
// drift from the UI and inherits every guard it has: unknown household, ambiguous meter,
// duplicate line, non-numeric value, and a meter that already has a reading for the
// period. That last one also makes a retry safe — a repeat call is refused rather than
// double-writing.
//
// /api/data replaces the whole document; this route never does. Prefer it.

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function preview(entries: ResolvedEntry[]) {
  return entries.map((e) => ({
    property: e.propertyName,
    meter: e.meterLabel,
    readingValue: e.readingValue,
    previousValue: e.previousValue,
    usage: e.usage,
    warnings: e.warnings,
  }));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const text = typeof b.text === 'string' ? b.text : '';
  const dryRun = b.dryRun === true;

  if (!text.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Provide `text`: one line per meter, e.g. "Patin 577220".' },
      { status: 400 }
    );
  }

  let readingDate = today();
  if (typeof b.readingDate === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.readingDate)) {
      return NextResponse.json(
        { ok: false, error: '`readingDate` must be YYYY-MM-DD.' },
        { status: 400 }
      );
    }
    readingDate = b.readingDate;
  }

  let data;
  try {
    data = await readStore();
  } catch (e) {
    const detail = e instanceof StoreUnavailableError ? e.detail : 'Unknown error';
    console.error('readings: could not read store:', detail);
    return NextResponse.json(
      { ok: false, error: 'Data store unavailable', details: detail },
      { status: 503 }
    );
  }

  const parsed = parseQuickEntry(
    text,
    data.properties,
    data.readings,
    getCurrentBillingPeriod()
  );

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { ok: false, billingPeriod: parsed.billingPeriod, errors: parsed.errors },
      { status: 400 }
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      billingPeriod: parsed.billingPeriod,
      wouldAdd: parsed.entries.length,
      entries: preview(parsed.entries),
    });
  }

  // Re-read and re-validate immediately before writing, so a reading added since the
  // first read is caught rather than overwritten.
  let fresh;
  try {
    fresh = await readStore();
  } catch (e) {
    const detail = e instanceof StoreUnavailableError ? e.detail : 'Unknown error';
    return NextResponse.json(
      { ok: false, error: 'Data store unavailable', details: detail },
      { status: 503 }
    );
  }

  const recheck = parseQuickEntry(
    text,
    fresh.properties,
    fresh.readings,
    getCurrentBillingPeriod()
  );
  if (recheck.errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'The data changed while this request was in flight.',
        billingPeriod: recheck.billingPeriod,
        errors: recheck.errors,
      },
      { status: 409 }
    );
  }

  const additions = toMeterReadings(
    recheck.entries,
    recheck.billingPeriod,
    readingDate,
    randomUUID
  );

  try {
    await writeStore({ ...fresh, readings: [...fresh.readings, ...additions] });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Unknown error';
    console.error('readings: write failed:', detail);
    return NextResponse.json(
      { ok: false, error: 'Failed to save', details: detail },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    billingPeriod: recheck.billingPeriod,
    readingDate,
    added: additions.length,
    totalReadings: fresh.readings.length + additions.length,
    entries: preview(recheck.entries),
  });
}
