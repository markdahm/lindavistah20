import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { promises as fs } from 'fs';
import { createHash, timingSafeEqual } from 'crypto';
import path from 'path';
import initialData from '../../../../data/data.json';

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');
const BLOB_FILENAME = 'lv-water-co-data.json';

// Writes require the shared secret in an x-api-key header. Reads stay open because the
// browser app loads data on page render and has nowhere safe to hold a credential.
function isAuthorized(request: Request): boolean {
  const expected = process.env.LV_API_SECRET;

  // Fail closed. With no secret configured there is no way to authorize a write, so a
  // missing environment variable locks the endpoint rather than leaving it open.
  if (!expected) return false;

  const provided = request.headers.get('x-api-key');
  if (!provided) return false;

  // Hash both sides first so the fixed-length digests can be compared in constant time
  // without leaking the secret's length.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// GET: Read data
export async function GET() {
  try {
    // Use Vercel Blob in production
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        // List blobs to find our data file
        const { blobs } = await list({ prefix: BLOB_FILENAME });

        if (blobs.length > 0) {
          // Fetch the existing blob
          const response = await fetch(blobs[0].url, { cache: 'no-store' });
          if (response.ok) {
            const data = await response.json();
            return NextResponse.json(data);
          }
        }
      } catch (e) {
        console.error('Error listing blobs:', e);
      }

      // Initialize blob with bundled initial data if it doesn't exist
      await put(BLOB_FILENAME, JSON.stringify(initialData, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return NextResponse.json(initialData);
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
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
