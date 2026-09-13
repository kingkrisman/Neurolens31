import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function estimateMinutes(words: number, wpm = 200) {
  return Math.max(1, Math.round(words / wpm));
}
