import { useEffect, useMemo, useState } from "react";

const SIZES = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-12 h-12 text-base",
  md: "w-16 h-16 text-xl",
  lg: "w-20 h-20 text-2xl",
  xl: "w-24 h-24 text-3xl",
} as const;

type Size = keyof typeof SIZES;

export function Avatar({
  url,
  fallback,
  size = "md",
  className = "",
}: {
  url?: string | null;
  fallback: string;
  size?: Size;
  className?: string;
}) {
  const src = useMemo(() => normalizeAvatarUrl(url ?? undefined), [url]);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  const boxSize = SIZES[size];
  const wrapperClass = `${boxSize} border border-ink bg-paper flex items-center justify-center font-mono font-medium overflow-hidden shrink-0 ${className}`;

  if (!src || errored) {
    return (
      <div className={wrapperClass} aria-label={`Avatar fallback: ${fallback}`}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <img
        src={src}
        alt="Avatar"
        className="w-full h-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

// ipfs:// gets routed through a public gateway; data: and http(s): pass through.
// Anything else is rejected so we don't try to load a relative or javascript: URL.
export function normalizeAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return undefined;
}
