// Data loading and saving utilities

import { AppData } from './types';

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
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}
