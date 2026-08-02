import { NextResponse } from 'next/server';
import { missingAuthConfig } from '@/lib/auth';

// Lets the login page tell the difference between "wrong password" and "this deployment
// is missing its environment variables", instead of leaving Mark guessing.
export async function GET() {
  const missing = missingAuthConfig({
    APP_PASSWORD: process.env.APP_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
  return NextResponse.json({ configured: missing.length === 0, missing });
}
