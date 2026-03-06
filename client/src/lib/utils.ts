import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDias(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`;
}

export function formatDiarias(n: number): string {
  return `${n} ${n === 1 ? 'diária' : 'diárias'}`;
}

export function formatDiasUteis(n: number): string {
  return `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;
}

export function formatFds(n: number): string {
  return `${n} ${n === 1 ? 'fim de semana' : 'fins de semana'}`;
}
