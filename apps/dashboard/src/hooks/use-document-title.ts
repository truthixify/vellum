import { useEffect } from "react";

const SUFFIX = " · Vellum";

/**
 * Sets document.title for the duration of the component's lifecycle. Pass a
 * concise route-specific title; the " · Vellum" suffix is appended for brand
 * consistency. Use `null` to restore the index.html default title.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = `${title}${SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
