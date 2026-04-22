import { THEME_MODES, type ThemeMode } from "@newsportal/config";

export const ADMIN_THEME_STORAGE_KEY = "newsportal-admin-theme";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return THEME_MODES.includes(String(value ?? "") as ThemeMode);
}

export function readThemePreference(value: string | null | undefined): ThemeMode {
  return isThemeMode(value) ? value : "system";
}

export function resolveEffectiveTheme(
  preference: ThemeMode,
  prefersDark: boolean
): "light" | "dark" {
  if (preference === "dark") {
    return "dark";
  }
  if (preference === "light") {
    return "light";
  }
  return prefersDark ? "dark" : "light";
}

export function applyThemePreference(
  root: HTMLElement,
  preference: ThemeMode,
  prefersDark: boolean
): "light" | "dark" {
  const effectiveTheme = resolveEffectiveTheme(preference, prefersDark);
  root.dataset.themePreference = preference;
  root.dataset.theme = effectiveTheme;
  root.classList.toggle("dark", effectiveTheme === "dark");
  root.style.colorScheme = effectiveTheme;
  return effectiveTheme;
}
