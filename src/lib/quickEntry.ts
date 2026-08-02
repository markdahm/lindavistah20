// Parsing for the Quick Entry screen: turn a pasted block of meter readings into
// resolved MeterReading rows, without touching any existing data.
//
// Expected paste, one meter per line:
//
//   2026-07
//   Patin           571615
//   Dahm            307743
//   Alosi           861737
//   Vandeneynde 1  1136770
//   Vandeneynde 2   110705
//
// The leading YYYY-MM line is optional. Blank lines and lines starting with # are
// ignored. Household names are matched loosely (case and punctuation are ignored) so
// "Vandeneynde-1", "vandeneynde 1" and "Vandeneynde Meter 1" all resolve the same way.

import { Property, MeterReading } from './types';

export interface ResolvedEntry {
  propertyId: string;
  propertyName: string;
  meterId: string;
  meterLabel: string;
  readingValue: number;
  previousValue: number | null;
  rawUsage: number;
  usage: number;
  warnings: string[];
}

export interface ParseResult {
  billingPeriod: string;
  periodFromPaste: boolean;
  entries: ResolvedEntry[];
  errors: string[];
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The reading immediately before `period` for this meter. Deliberately ignores anything
 * dated at or after the target period, so entering a back-dated month still computes
 * usage against the correct predecessor rather than the newest row overall.
 */
export function previousReadingFor(
  readings: MeterReading[],
  meterId: string,
  period: string
): MeterReading | null {
  const earlier = readings
    .filter((r) => r.meterId === meterId && r.billingPeriod < period)
    .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod));
  return earlier[0] ?? null;
}

/** Resolve a free-text label like "Vandeneynde 2" to a specific property + meter. */
function resolveLabel(
  label: string,
  properties: Property[]
): { propertyId: string; propertyName: string; meterId: string; meterLabel: string } | string {
  const key = normalize(label);
  if (!key) return `Missing a household name`;

  const matches = properties.filter((p) => key.startsWith(normalize(p.name)));
  if (matches.length === 0) {
    return `No household matches "${label}"`;
  }
  // Longest name wins, so "Vandeneynde" beats a hypothetical "Van".
  matches.sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  const property = matches[0];

  const remainder = key.slice(normalize(property.name).length);

  if (property.meters.length === 0) {
    return `${property.name} has no meters configured`;
  }

  if (property.meters.length === 1) {
    const meter = property.meters[0];
    return {
      propertyId: property.id,
      propertyName: property.name,
      meterId: meter.id,
      meterLabel: meter.label,
    };
  }

  // Several meters: the line has to say which one.
  const digit = remainder.match(/(\d+)/);
  if (!digit) {
    return `${property.name} has ${property.meters.length} meters - add a number, e.g. "${property.name} 1"`;
  }
  const n = parseInt(digit[1], 10);

  const byLabel = property.meters.find((m) => normalize(m.label).includes(String(n)));
  const meter = byLabel ?? property.meters[n - 1];
  if (!meter) {
    return `${property.name} has no meter ${n}`;
  }
  return {
    propertyId: property.id,
    propertyName: property.name,
    meterId: meter.id,
    meterLabel: meter.label,
  };
}

export function parseQuickEntry(
  text: string,
  properties: Property[],
  readings: MeterReading[],
  defaultPeriod: string
): ParseResult {
  const errors: string[] = [];
  const entries: ResolvedEntry[] = [];

  let billingPeriod = defaultPeriod;
  let periodFromPaste = false;

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const bodyLines: string[] = [];
  for (const line of lines) {
    if (PERIOD_RE.test(line)) {
      billingPeriod = line;
      periodFromPaste = true;
    } else {
      bodyLines.push(line);
    }
  }

  const seenMeters = new Set<string>();

  for (const line of bodyLines) {
    const parts = line.split(/\s+/);
    const valueToken = parts[parts.length - 1];
    const label = parts.slice(0, -1).join(' ');

    const cleaned = valueToken.replace(/,/g, '');
    if (!/^\d+$/.test(cleaned)) {
      errors.push(`"${line}" - the last item should be the meter reading, got "${valueToken}"`);
      continue;
    }
    if (!label) {
      errors.push(`"${line}" - no household name before the number`);
      continue;
    }

    const resolved = resolveLabel(label, properties);
    if (typeof resolved === 'string') {
      errors.push(`"${line}" - ${resolved}`);
      continue;
    }

    if (seenMeters.has(resolved.meterId)) {
      errors.push(`${resolved.propertyName} / ${resolved.meterLabel} appears more than once`);
      continue;
    }
    seenMeters.add(resolved.meterId);

    const already = readings.find(
      (r) => r.meterId === resolved.meterId && r.billingPeriod === billingPeriod
    );
    if (already) {
      errors.push(
        `${resolved.propertyName} / ${resolved.meterLabel} already has a reading for ${billingPeriod} (${already.readingValue.toLocaleString()}) - remove it first if you meant to replace it`
      );
      continue;
    }

    const readingValue = parseInt(cleaned, 10);
    const previous = previousReadingFor(readings, resolved.meterId, billingPeriod);
    const previousValue = previous ? previous.readingValue : null;

    const warnings: string[] = [];
    let rawUsage: number;
    if (previousValue === null) {
      rawUsage = 0;
      warnings.push('No earlier reading for this meter, so usage is recorded as 0');
    } else {
      rawUsage = readingValue - previousValue;
      if (rawUsage < 0) {
        warnings.push(
          `Lower than the previous reading (${previousValue.toLocaleString()}) - check the photo`
        );
      } else if (rawUsage * 10 > 200000) {
        warnings.push(`Unusually high: ${(rawUsage * 10).toLocaleString()} gallons`);
      }
    }

    entries.push({
      ...resolved,
      readingValue,
      previousValue,
      rawUsage,
      usage: rawUsage * 10,
      warnings,
    });
  }

  if (bodyLines.length === 0) {
    errors.push('Nothing to add - paste one line per meter, e.g. "Patin 571615"');
  }

  return { billingPeriod, periodFromPaste, entries, errors };
}

/** Convert resolved entries into MeterReading rows ready to append. */
export function toMeterReadings(
  entries: ResolvedEntry[],
  billingPeriod: string,
  readingDate: string,
  newId: () => string
): MeterReading[] {
  return entries.map((e) => ({
    id: newId(),
    meterId: e.meterId,
    propertyId: e.propertyId,
    readingDate,
    billingPeriod,
    readingValue: e.readingValue,
    rawUsage: e.rawUsage,
    usage: e.usage,
  }));
}
