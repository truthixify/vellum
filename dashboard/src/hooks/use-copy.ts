import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard helper with a transient "copied" flag that flips back to
 * false after `resetMs`. Lets every Copy button across the app share the same
 * label-flip feedback pattern.
 */
export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } catch (err) {
        console.warn("Clipboard write failed", err);
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
