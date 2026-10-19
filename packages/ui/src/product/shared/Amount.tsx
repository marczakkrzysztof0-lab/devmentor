import { cn } from "../../lib/cn";
import { formatMoney } from "./format";

export type AmountProps = { minor: number; currency?: string; className?: string };

/** An amount of money, always in Geist Mono (DK2): „150 zł”. */
export function Amount({ minor, currency = "PLN", className }: AmountProps) {
  return <span className={cn("font-mono whitespace-nowrap", className)}>{formatMoney(minor, currency)}</span>;
}
