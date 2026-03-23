import { useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

interface ThemeToggleProps {
  currentTheme: string;
  bffPath: string;
}

export function ThemeToggle({ currentTheme, bffPath }: ThemeToggleProps) {
  const [theme, setTheme] = useState(currentTheme);

  async function switchTheme(next: string) {
    setTheme(next);
    // Apply immediately client-side
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else if (next === "light") root.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
    }
    // Persist to server
    await fetch(bffPath, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ themePreference: next }),
    });
  }

  const themes = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const;

  const current = themes.find((t) => t.value === theme) ?? themes[2];
  const Icon = current.icon;

  return (
    <div className="relative group">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label={`Theme: ${current.label}`}
      >
        <Icon className="h-4 w-4" />
      </button>
      <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col min-w-[120px] rounded-md border border-border bg-popover shadow-md p-1 z-50">
        {themes.map(({ value, icon: ItemIcon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => switchTheme(value)}
            className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
              theme === value ? "text-primary font-medium" : "text-foreground"
            }`}
          >
            <ItemIcon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

