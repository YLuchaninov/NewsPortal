import { useEffect, useState } from "react";
import type { ThemeMode } from "@newsportal/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@newsportal/ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import {
  ADMIN_THEME_STORAGE_KEY,
  applyThemePreference,
  isThemeMode,
  readThemePreference,
} from "./admin-theme";

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  hint: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Light",
    hint: "Bright operator surfaces",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    hint: "Focused console mode",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    hint: "Follow device preference",
    icon: Monitor,
  },
];

function resolveBrowserPreference(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  return readThemePreference(window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
}

function applyBrowserTheme(next: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyThemePreference(document.documentElement, next, prefersDark);
}

export function AdminThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("system");

  useEffect(() => {
    const next = resolveBrowserPreference();
    setTheme(next);
    applyBrowserTheme(next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (theme !== "system") {
        return;
      }
      applyThemePreference(document.documentElement, theme, mediaQuery.matches);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== ADMIN_THEME_STORAGE_KEY) {
        return;
      }
      const next = readThemePreference(event.newValue);
      setTheme(next);
      applyThemePreference(document.documentElement, next, mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [theme]);

  function switchTheme(nextValue: string): void {
    if (!isThemeMode(nextValue) || typeof window === "undefined") {
      return;
    }
    setTheme(nextValue);
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextValue);
    } catch {
      // Ignore storage failures and still honor the session-local switch.
    }
    applyBrowserTheme(nextValue);
  }

  const currentOption =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  const CurrentIcon = currentOption.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background/75 px-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Theme: ${currentOption.label}`}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{currentOption.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={switchTheme}>
          {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="items-start gap-3 py-2.5 pl-8 pr-2"
            >
              <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium leading-5">{label}</span>
                <span className="text-xs leading-4 text-muted-foreground">{hint}</span>
              </span>
              {theme === value ? (
                <Check className="mt-0.5 h-4 w-4 text-primary" />
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
