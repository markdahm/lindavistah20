import { NextResponse } from 'next/server';
import { readStore, writeStore, StoreUnavailableError } from '@/lib/store';

// GET: Read data
//
// This path must NEVER write. It previously seeded the blob from the bundled
// data/data.json whenever the lookup came back empty or threw — which meant a single
// transient blob failure silently replaced live data with a stale repo snapshot. A read
// that cannot find the data must fail loudly, not invent a replacement.
export async function GET() {
  try {
    return NextResponse.json(await readStore());
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json(
        { error: 'Data store unavailable', details: error.detail },
        { status: 503 }
      );
    }
    console.error('Error reading data:', error);
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}

// POST: Replace the whole document.
//
// This is the blunt instrument — it overwrites everything, and a bad payload takes out
// every reading, invoice and payment. Prefer POST /api/readings, which appends. Use this
// only for a full restore or a correction that has to remove existing rows.
export async function POST(request: Request) {
  try {
    const data = await request.json();
    await writeStore(data);
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
