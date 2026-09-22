/**
 * Endereço do colaborador (22/09: "incluir uma linha de endereço — rua, número,
 * complemento e CEP, sem ser obrigatório").
 *
 * Os quatro campos são opcionais. Aqui ficam as regras que tela e servidor
 * precisam dizer igual: o CEP sai sempre como "00000-000", campo em branco vira
 * "sem valor" (null), e a linha de exibição junta o que existir.
 */

export interface CamposDeEndereco {
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  addressZip?: string | null;
}

export const CAMPOS_DE_ENDERECO = ["addressStreet", "addressNumber", "addressComplement", "addressZip"] as const;

/** "01234567" / "01.234-567" → "01234-567". Vazio → "". Número de dígitos errado → null (inválido). */
export function formatarCep(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length === 0) return "";
  if (digitos.length !== 8) return null;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export const CEP_INVALIDO = "CEP inválido — informe os 8 números (ex.: 01234-567) ou deixe em branco.";

/**
 * Limpa só os campos de endereço que vieram no corpo (os que não vieram ficam
 * de fora, para um PATCH não apagar o que não foi mandado). Devolve o erro em
 * português quando o CEP não tem 8 números.
 */
export function normalizarEndereco(corpo: Record<string, unknown>): { erro: string } | { campos: Partial<Record<(typeof CAMPOS_DE_ENDERECO)[number], string | null>> } {
  const campos: Partial<Record<(typeof CAMPOS_DE_ENDERECO)[number], string | null>> = {};
  for (const chave of CAMPOS_DE_ENDERECO) {
    if (!(chave in corpo)) continue;
    const bruto = corpo[chave];
    const texto = bruto === null || bruto === undefined ? "" : String(bruto).replace(/\s+/g, " ").trim();
    if (chave === "addressZip") {
      const cep = formatarCep(texto);
      if (cep === null) return { erro: CEP_INVALIDO };
      campos.addressZip = cep || null;
    } else {
      campos[chave] = texto || null;
    }
  }
  return { campos };
}

/** "Rua das Flores, 123 — Apto 4" (sem o CEP; vazio quando não há nada). */
export function enderecoEmUmaLinha(c: CamposDeEndereco): string {
  const rua = c.addressStreet?.trim() ?? "";
  const numero = c.addressNumber?.trim() ?? "";
  const complemento = c.addressComplement?.trim() ?? "";
  const base = [rua, numero].filter(Boolean).join(", ");
  return [base, complemento].filter(Boolean).join(" — ");
}
