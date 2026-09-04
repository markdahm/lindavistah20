// Single place that knows how the data document is read and written.
//
// Both /api/data and /api/readings go through here. When these lived separately, the read
// path grew a write in it — a failed blob lookup reseeded the store from the repo's stale
// data/data.json and destroyed three months of readings. One reader, one writer, and the
// reader cannot write.

import { put, list } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';
import { AppData } from './types';

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');
const BLOB_FILENAME = 'lv-water-co-data.json';

/** The store could not be read. Never means "the store is empty". */
export class StoreUnavailableError extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = 'StoreUnavailableError';
  }
}

/**
 * Read the current document. Throws StoreUnavailableError if it cannot be reached —
 * callers must surface that, never substitute a default.
 */
export async function readStore(): Promise<AppData> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { blobs } = await list({ prefix: BLOB_FILENAME });

    // Match the exact filename rather than trusting list order.
    const blob = blobs.find((b) => b.pathname === BLOB_FILENAME);
    if (!blob) {
      console.error(`Blob ${BLOB_FILENAME} not found (${blobs.length} matched prefix)`);
      throw new StoreUnavailableError('Data blob not found.');
    }

    const response = await fetch(blob.url, { cache: 'no-store' });
    if (!response.ok) {
      console.error(`Fetching blob failed: ${response.status}`);
      throw new StoreUnavailableError(`Blob fetch returned ${response.status}.`);
    }

    return (await response.json()) as AppData;
  }

  // Local development only. data/data.json is deliberately untracked — it holds real
  // billing data, and a stale copy in the repo is what reseeded and destroyed the live
  // store in August 2026. Seed it yourself; nothing here falls back to a bundled file.
  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(fileContent) as AppData;
  } catch (e) {
    const why = (e as NodeJS.ErrnoException)?.code === 'ENOENT'
      ? 'data/data.json does not exist. Copy data/data.example.json to data/data.json, '
        + 'or pull the live document with GET /api/data.'
      : `data/data.json could not be read: ${(e as Error).message}`;
    console.error(`store: ${why}`);
    throw new StoreUnavailableError(why);
  }
}

/** Replace the whole document. Only ever called from a write path. */
export async function writeStore(data: AppData): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(BLOB_FILENAME, JSON.stringify(data, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
