import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "verdant" | "secondary" | "destructive" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function VButton({ variant = "primary", className, children, ...rest }: Props) {
  const base = "v-button";
  const variants: Record<Variant, string> = {
    primary: "v-button--primary",
    verdant: "v-button--primary",
    secondary: "v-button--secondary",
    destructive: "v-button--danger",
    ghost: "v-button--quiet vellum-button--ghost",
  };
  return (
    <button className={cn(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
