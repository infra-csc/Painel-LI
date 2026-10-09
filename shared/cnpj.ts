/**
 * CNPJ — validação dos dígitos verificadores e máscara (08/10).
 *
 * Mora no shared para o cliente (campo da empresa pagadora, CnpjInput) e o
 * servidor (PATCH /api/events/:id/payment-company) usarem a MESMA regra. Era
 * só do componente `ui/cnpj-input`, que agora reexporta daqui.
 */

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(digitos: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(digitos[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Os 14 dígitos do CNPJ, sem pontuação. */
export const digitosDoCnpj = (valor: string | null | undefined) => String(valor ?? "").replace(/\D/g, "");

/** CNPJ com 14 dígitos e os dois verificadores certos (todos iguais não vale). */
export function cnpjValido(valor: string | null | undefined): boolean {
  const d = digitosDoCnpj(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  return Number(d[12]) === digitoVerificador(d, PESOS_1) && Number(d[13]) === digitoVerificador(d, PESOS_2);
}

/** Completa uma base de 12 dígitos com os dois verificadores (dados de demonstração e testes). */
export function completarCnpj(base12: string): string {
  const b = digitosDoCnpj(base12).slice(0, 12).padStart(12, "0");
  const d1 = digitoVerificador(b, PESOS_1);
  const d2 = digitoVerificador(b + d1, PESOS_2);
  return mascararCnpj(`${b}${d1}${d2}`);
}

/** Máscara progressiva XX.XXX.XXX/XXXX-XX. */
export function mascararCnpj(valor: string): string {
  const d = digitosDoCnpj(valor).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Mensagem do campo/da API para um CNPJ preenchido e inválido (null = ok ou vazio). */
export function erroDoCnpj(valor: string | null | undefined): string | null {
  const d = digitosDoCnpj(valor);
  if (!d) return null;
  if (d.length !== 14) return "CNPJ incompleto — são 14 dígitos.";
  if (!cnpjValido(d)) return "CNPJ inválido — confira os dígitos verificadores.";
  return null;
}
