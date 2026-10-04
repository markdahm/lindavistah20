'use client';

// The light/dark switch, top right of every page. It used to be a toggle inside Settings;
// moved here 4 October 2026 so it is one tap from anywhere. The login page has no chrome,
// so it is hidden there too.

import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';

export default function ThemeToggle() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  if (pathname === '/login') return null;

  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-theme-toggle
      className="fixed top-3 right-3 md:top-4 md:right-6 z-40 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--card-bg)] border border-[var(--border)] text-[var(--muted)] shadow-sm hover:text-[var(--foreground)] hover:border-[var(--muted)] transition-colors"
    >
      {dark ? (
        // Sun: what you get if you press it
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m12.728 0l-1.414-1.414M7.05 7.05L5.636 5.636M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        // Moon
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
