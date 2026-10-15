export const THEME_STORAGE_KEY = "fm-theme";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** Resolve stored preference, else OS preference (defaults toward dark). */
export function resolveTheme(stored: string | null | undefined): Theme {
  if (isTheme(stored)) return stored;
  return getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getInitialTheme(): Theme {
  return resolveTheme(readStoredTheme());
}

/** Inline boot script — keep in sync with helpers above. */
export const THEME_BOOT_SCRIPT = `try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var t=(s==="light"||s==="dark")?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.style.colorScheme="dark"}`;
