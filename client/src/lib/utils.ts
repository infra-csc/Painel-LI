import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fixEncoding(str: string | null | undefined): string {
  if (!str) return str || '';
  return str
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ãµ/g, 'õ')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã /g, 'à')
    .replace(/Ã‰/g, 'É').replace(/Ã"/g, 'Ó').replace(/Ã•/g, 'Õ')
    .replace(/Ã‚/g, 'Â').replace(/Ãâ/g, 'Â').replace(/â€™/g, "'")
    .replace(/Ã\u0081/g, 'Á').replace(/Ã\u009a/g, 'Ú');
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
