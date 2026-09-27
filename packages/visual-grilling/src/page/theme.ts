// The page theme: dark by default, light from the toggle. The choice sits on
// <html data-theme> (the CSS tokens key off it) and is remembered per browser.
// Blocks redraw when data-theme changes (app.ts watches it).

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'visual-grilling-theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  if (theme === currentTheme()) return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/** Applies the remembered theme (dark when none) before the first render. */
export function initTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: dark.
  }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
}
