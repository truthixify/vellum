import { useRef, useState } from "react";

/**
 * Avatar upload that resizes the chosen image client-side and emits a data URL.
 *
 * Storage rent on CKB is roughly 1 CKB per byte of cell data, so embedding a
 * full-resolution image is impractical. We resize to a small square and
 * encode as WebP (or fallback JPEG) to keep the data URL under a few KB,
 * which adds only a few CKB to the cell capacity. Holders who want a
 * higher-resolution avatar should host it elsewhere and paste the URL.
 */
export function AvatarUploader({
  onUpload,
  size = 96,
  quality = 0.75,
  label = "Upload image",
}: {
  onUpload: (dataUrl: string) => void;
  size?: number;
  quality?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    setError(null);
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Not an image. Try a PNG, JPEG, or WebP.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file, size, quality);
      onUpload(dataUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to read image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => handleFiles(e.target.files)}
        className="sr-only"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mono-caps border border-ink px-3 h-11 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
      >
        {busy ? "Resizing…" : label}
      </button>
      {error && (
        <p className="text-xs text-alarm mt-1.5">{error}</p>
      )}
    </div>
  );
}

async function resizeToDataUrl(
  file: File,
  size: number,
  quality: number,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    const webp = canvas.toDataURL("image/webp", quality);
    // toDataURL falls back silently to PNG when WebP is unsupported by the
    // browser; verify the prefix and try JPEG as a smaller fallback.
    if (webp.startsWith("data:image/webp")) return webp;
    const jpeg = canvas.toDataURL("image/jpeg", quality);
    if (jpeg.startsWith("data:image/jpeg")) return jpeg;
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function dataUrlByteSize(url: string): number {
  if (!url.startsWith("data:")) return 0;
  const comma = url.indexOf(",");
  if (comma === -1) return 0;
  const payload = url.slice(comma + 1);
  if (url.slice(0, comma).includes(";base64")) {
    // base64 char count → byte count is roughly 3/4 with padding adjustment
    const padding = (payload.match(/=+$/)?.[0] ?? "").length;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(payload).length;
}
