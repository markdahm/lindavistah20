import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');
const BLOB_FILENAME = 'lv-water-co-data.json';

// GET: Read data
//
// This path must NEVER write. It previously seeded the blob from the bundled
// data/data.json whenever the lookup came back empty or threw — which meant a single
// transient blob failure silently replaced live data with a stale repo snapshot. A read
// that cannot find the data must fail loudly, not invent a replacement.
export async function GET() {
  try {
    // Use Vercel Blob in production
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { blobs } = await list({ prefix: BLOB_FILENAME });

      // Match the exact filename rather than trusting list order.
      const blob = blobs.find((b) => b.pathname === BLOB_FILENAME);

      if (!blob) {
        console.error(`Blob ${BLOB_FILENAME} not found (${blobs.length} matched prefix)`);
        return NextResponse.json(
          { error: 'Data store unavailable', details: 'Data blob not found.' },
          { status: 503 }
        );
      }

      const response = await fetch(blob.url, { cache: 'no-store' });
      if (!response.ok) {
        console.error(`Fetching blob failed: ${response.status}`);
        return NextResponse.json(
          { error: 'Data store unavailable', details: `Blob fetch returned ${response.status}.` },
          { status: 503 }
        );
      }

      return NextResponse.json(await response.json());
    }

    // Local file for development
    const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(fileContent);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading data:', error);
    return NextResponse.json(
      { error: 'Failed to read data' },
      { status: 500 }
    );
  }
}

// POST: Write data
export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Use Vercel Blob in production
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await put(BLOB_FILENAME, JSON.stringify(data, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return NextResponse.json({ success: true });
    }

    // Local file for development
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to write data', details: errorMessage },
      { status: 500 }
    );
  }
}
