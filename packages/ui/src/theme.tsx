import { Moon, Sun } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DARK_THEME_MEDIA_QUERY,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  resolveThemePreference,
  type ThemePreference,
  type VellumTheme,
} from "./theme-preference";

export type { VellumTheme } from "./theme-preference";

type ThemeContextValue = {
  theme: VellumTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(DARK_THEME_MEDIA_QUERY).matches
  );
}

function initialThemePreference(): ThemePreference {
  if (typeof window === "undefined") return { theme: "light", source: "system" };
  return resolveThemePreference(readStoredTheme(), systemPrefersDark());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(initialThemePreference);
  const { theme } = preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[theme]);

    if (preference.source === "user") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // The selected theme still applies when storage is unavailable.
      }
    }
  }, [preference.source, theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_THEME_MEDIA_QUERY);
    const handleSystemTheme = (event: MediaQueryListEvent) => {
      setPreference((current) =>
        current.source === "system"
          ? { theme: event.matches ? "dark" : "light", source: "system" }
          : current,
      );
    };

    media.addEventListener("change", handleSystemTheme);
    return () => media.removeEventListener("change", handleSystemTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((current) => ({
      theme: current.theme === "dark" ? "light" : "dark",
      source: "user",
    }));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useVellumTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useVellumTheme must be used inside ThemeProvider");
  return context;
}

export function ThemeButton({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useVellumTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      className={`v-icon-button ${className}`.trim()}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
    >
      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
