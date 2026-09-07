import { Check, Code2 } from "lucide-react";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

export function VellumMark({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 2H2v16h4"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.6"
      />
      <path
        d="M14 2h4v16h-4"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.6"
      />
      <rect x="8" y="8" width="4" height="4" fill="var(--ink)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="v-wordmark">
      <VellumMark size={compact ? 18 : 20} />
      {!compact && <span>Vellum.</span>}
    </span>
  );
}

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export function buttonClassName(
  variant: ButtonVariant = "secondary",
  className = "",
) {
  return `v-button v-button--${variant} ${className}`.trim();
}

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function NetworkStatus({
  network = "CKB Testnet",
}: {
  network?: string;
}) {
  return (
    <span className="v-network-status">
      <span aria-hidden="true" />
      {network}
    </span>
  );
}

export function PreviewBadge({ label = "Preview data" }: { label?: string }) {
  return (
    <span className="v-preview-badge">
      <Code2 size={11} strokeWidth={2.2} aria-hidden="true" />
      {label}
    </span>
  );
}

export type StatusTone = "positive" | "neutral" | "warning" | "danger" | "info";

export function StatusMark({
  children,
  tone = "neutral",
  icon = true,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: boolean;
}) {
  return (
    <span className={`v-status v-status--${tone}`}>
      {icon && <Check size={11} strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function AvatarMark({
  children,
  size = "medium",
}: {
  children: ReactNode;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span className={`v-avatar-mark v-avatar-mark--${size}`}>{children}</span>
  );
}

export function SignalRail({
  value,
  max,
  height = 6,
  label,
}: {
  value: number;
  max: number;
  height?: 6 | 10;
  label: string;
}) {
  const safeMax = Math.max(max, 1);
  const safeValue = Math.min(Math.max(value, 0), safeMax);
  return (
    <span
      className="v-signal-rail"
      style={{ "--rail-height": `${height}px` } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <span style={{ flex: safeValue }} />
      <span style={{ flex: safeMax - safeValue }} />
    </span>
  );
}

export function useCopyFeedback(resetAfter = 1500) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), resetAfter);
    return () => window.clearTimeout(timeout);
  }, [copied, resetAfter]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return { copied, copy };
}
