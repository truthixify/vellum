import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "verdant" | "secondary" | "destructive" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function VButton({ variant = "primary", className, children, ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center px-5 h-11 mono-caps transition-colors active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    primary: "bg-ink text-paper hover:bg-verdant",
    verdant: "bg-verdant text-paper hover:bg-[var(--verdant-hover)] active:bg-[var(--verdant-press)]",
    secondary: "bg-paper text-ink border border-ink hover:bg-ink hover:text-paper",
    destructive: "bg-alarm text-paper hover:opacity-90",
    ghost: "bg-transparent text-ink underline decoration-ink underline-offset-4 hover:text-cobalt hover:decoration-cobalt px-2",
  };
  return (
    <button className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
