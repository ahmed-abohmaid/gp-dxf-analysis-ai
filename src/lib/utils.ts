import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Round to 2 decimal places — used for VA load values. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

/** Format a VA value as kVA. Power factor defaults to 1 (VA = W at unity PF). */
export function formatKVA(va: number, pf: number = 1): string {
  return formatNumber(va / (1000 * pf), 2);
}
