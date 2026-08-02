import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  safeEqual,
  missingAuthConfig,
} from '@/lib/auth';

export async function POST(request: Request) {
  const missing = missingAuthConfig({
    APP_PASSWORD: process.env.APP_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Server auth is not configured: ${missing.join(', ')} not set.` },
      { status: 503 }
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!safeEqual(password, process.env.APP_PASSWORD as string)) {
    // Deliberately vague, and slow enough to make guessing tedious.
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const token = await createSessionToken(process.env.SESSION_SECRET as string);

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
