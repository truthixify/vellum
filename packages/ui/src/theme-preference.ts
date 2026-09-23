export type VellumTheme = "light" | "dark";

export type ThemePreference = {
  theme: VellumTheme;
  source: "system" | "user";
};

export const THEME_STORAGE_KEY = "vellum-theme-preference";
export const DARK_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const THEME_COLORS: Record<VellumTheme, string> = {
  light: "#f2f4ef",
  dark: "#111411",
};

export function resolveThemePreference(
  stored: string | null,
  prefersDark: boolean,
): ThemePreference {
  if (stored === "light" || stored === "dark") {
    return { theme: stored, source: "user" };
  }
  return { theme: prefersDark ? "dark" : "light", source: "system" };
}
