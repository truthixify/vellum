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

export type VellumTheme = "light" | "dark";

type ThemeContextValue = {
  theme: VellumTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "vellum-theme";

function initialTheme(): VellumTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<VellumTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
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
