import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fixEncoding(str: string | null | undefined): string {
  if (!str) return str || '';
  return str
    // Minúsculas (byte range A0-BF → Latin-1 printable → match direto)
    .replace(/Ã§/g, 'ç').replace(/Ã£/g, 'ã').replace(/Ãµ/g, 'õ')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú').replace(/Ã /g, 'à')
    // Maiúsculas — versão C1 control (U+0080-U+009F, raw bytes)
    .replace(/Ã\u0087/g, 'Ç').replace(/Ã\u0083/g, 'Ã')
    .replace(/Ã\u0089/g, 'É').replace(/Ã\u0093/g, 'Ó').replace(/Ã\u0095/g, 'Õ')
    .replace(/Ã\u0082/g, 'Â').replace(/Ã\u0081/g, 'Á').replace(/Ã\u009a/g, 'Ú')
    // Maiúsculas — versão Windows-1252 (caso o BD tenha convertido C1→printable)
    .replace(/Ã‡/g, 'Ç').replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É').replace(/Ã"/g, 'Ó').replace(/Ã•/g, 'Õ')
    .replace(/Ã‚/g, 'Â').replace(/Ãâ/g, 'Â').replace(/â€™/g, "'");
}

export function normalizeId(val: string | number | null | undefined): string {
  return String(val ?? '').replace(/#/g, '').trim().toLowerCase();
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
