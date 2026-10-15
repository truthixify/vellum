import { normalizeProfileAvatarUrl } from "@vellum/schemas";

export function publicAvatarUrl(value: string | undefined): string | undefined {
  const source = normalizeProfileAvatarUrl(value);
  return source ? `/api/avatar?url=${encodeURIComponent(source)}` : undefined;
}
