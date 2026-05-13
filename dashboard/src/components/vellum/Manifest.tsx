import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type State = "ACTIVE" | "PENDING" | "MIGRATING" | "CONTESTED" | "DEACTIVATED" | "DRAFT";

const stateStyles: Record<State, { bg: string; text: string; dot?: "pulse" | "static" | "none" }> = {
  ACTIVE: { bg: "bg-verdant", text: "text-paper", dot: "static" },
  PENDING: { bg: "bg-amber", text: "text-paper", dot: "pulse" },
  MIGRATING: { bg: "bg-cobalt", text: "text-paper", dot: "pulse" },
  CONTESTED: { bg: "bg-alarm", text: "text-paper", dot: "pulse" },
  DEACTIVATED: { bg: "bg-[var(--muted-ink)]", text: "text-paper", dot: "none" },
  DRAFT: { bg: "bg-paper", text: "text-ink", dot: "none" },
};

export function StatusBand({ state, label }: { state: State; label?: string }) {
  const s = stateStyles[state];
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-6 py-2.5 mono-caps",
        s.bg,
        s.text,
        state === "DRAFT" && "border-b border-ink",
      )}
    >
      {s.dot === "pulse" && <span className="w-2 h-2 rounded-full bg-current pulse-dot" />}
      {s.dot === "static" && <span className="w-2 h-2 rounded-full bg-current" />}
      <span>{label ?? state}</span>
    </div>
  );
}

export function IdTab({ children, color = "verdant" }: { children: ReactNode; color?: "verdant" | "ink" | "cobalt" }) {
  const bg = color === "verdant" ? "bg-verdant" : color === "cobalt" ? "bg-cobalt" : "bg-ink";
  return (
    <div className={cn("inline-flex items-center px-3 py-1.5 mono-caps text-paper", bg)}>
      {children}
    </div>
  );
}

export function Manifest({
  idTab,
  state,
  stateLabel,
  children,
  footerLeft = "VELLUM · DOCUMENT",
  footerRight = "PAGE 01 / 01",
  offset = false,
  offsetColor = "verdant",
  className,
}: {
  idTab?: ReactNode;
  state?: State;
  stateLabel?: string;
  children: ReactNode;
  footerLeft?: string;
  footerRight?: string;
  offset?: boolean;
  offsetColor?: "ink" | "verdant";
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {offset && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 translate-x-3 translate-y-3 -z-10",
            offsetColor === "verdant" ? "bg-verdant" : "bg-ink",
          )}
        />
      )}
      {idTab && <div className="absolute -top-3 left-6 z-10">{idTab}</div>}
      <div className="border-2 border-ink bg-paper">
        <div className="border border-hairline m-1.5">
          {state && <StatusBand state={state} label={stateLabel} />}
          <div className="min-w-0">{children}</div>
          <div className="border-t border-ink/80 px-4 sm:px-6 py-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 mono-caps text-muted-foreground">
            <span className="break-words">{footerLeft}</span>
            <span className="break-words">{footerRight}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Brackets({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative inline-block px-6 py-4", className)}>
      <span className="absolute top-0 left-0 w-4 h-4 border-t-[1.5px] border-l-[1.5px] border-verdant" />
      <span className="absolute top-0 right-0 w-4 h-4 border-t-[1.5px] border-r-[1.5px] border-verdant" />
      <span className="absolute bottom-0 left-0 w-4 h-4 border-b-[1.5px] border-l-[1.5px] border-verdant" />
      <span className="absolute bottom-0 right-0 w-4 h-4 border-b-[1.5px] border-r-[1.5px] border-verdant" />
      {children}
    </div>
  );
}

export function MetaStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border-t border-b border-hairline">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "px-6 py-4",
            i > 0 && "md:border-l border-hairline",
            i > 0 && i % 2 === 0 && "border-t md:border-t-0",
          )}
        >
          <div className="mono-caps text-muted-foreground mb-1.5">{it.label}</div>
          <div className="font-mono text-sm text-ink">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function FieldRow({
  label,
  value,
  action,
  mono,
}: {
  label: string;
  value: ReactNode;
  action?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-6 px-4 sm:px-6 py-5 border-b border-hairline">
      <div className="mono-label text-muted-foreground sm:w-40 md:w-44 shrink-0 pt-0.5">{label}</div>
      <div className={cn("flex-1 min-w-0 w-full text-ink break-words", mono ? "font-mono text-sm break-all" : "text-base")}>{value}</div>
      {action && <div className="shrink-0 self-end sm:self-auto">{action}</div>}
    </div>
  );
}

export function Tag({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "cobalt" | "alarm";
}) {
  const styles = {
    default: "bg-paper border-ink text-ink",
    cobalt: "bg-cobalt border-cobalt text-paper",
    alarm: "bg-alarm border-alarm text-paper",
  };
  return (
    <span className={cn("inline-flex items-center h-5 px-2 border mono-caps", styles[variant])}>
      {children}
    </span>
  );
}
