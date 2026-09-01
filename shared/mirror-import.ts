/**
 * Importação da planilha do Espelho Operacional (31/08).
 *
 * A equipe já trabalha nessa planilha: exporta, preenche em lote (uma agência
 * manda 30 localizadores de uma vez) e devolve. Sem importar, tudo isso volta
 * para o sistema célula a célula.
 *
 * Duas regras que decidem o comportamento inteiro:
 *
 * 1. CÉLULA VAZIA NÃO APAGA. Uma planilha preenchida pela metade é o caso
 *    normal — quem cuida das passagens não preenche hotel. Se vazio limpasse,
 *    importar o trabalho de uma área destruiria o da outra.
 *
 * 2. A PESSOA É A CHAVE, e por NOME. É o único identificador que a planilha
 *    carrega. Nome que não bate, ou que bate em duas pessoas, não é adivinhado:
 *    a linha fica de fora com o motivo dito.
 *
 * Regra pura: sem xlsx, sem banco. Recebe a matriz já lida e devolve o que
 * mudaria — quem grava é o servidor, e só depois de alguém confirmar.
 */

/** Cabeçalho que o próprio export escreve (a linha 5 do arquivo). */
export const COLUNAS_DA_PLANILHA = [
  "NOME", "DEPARTAMENTO",
  "INÍCIO", "DATA IDA", "TÉRMINO", "DATA VOLTA",
  "PASSAGENS TT R$", "AERO IDA", "HR IDA", "HR VOLTA", "AERO VOLTA", "LOCALIZADOR", "EMPRESA", "OC", "CHECK IN 3",
  "DIÁRIAS", "QUARTO", "R$ DIARIA H", "LATE CHECK OUT", "HOTEL TT R$", "HOTEL", "EMPRESA PAGAMENTO", "OC", "CHECK IN 4",
  "BAGAGEM TT R$", "OC", "CHECK IN 1",
  "UBER TT R$", "OC", "CHECK IN 2",
  "EMPRESA LOCAÇÃO", "TT R$", "OC", "CHECK IN",
  "PENDÊNCIAS",
] as const;

/**
 * Coluna → campo do espelho, na ordem do arquivo. `null` é coluna que se lê mas
 * não se grava: NOME e DEPARTAMENTO identificam a pessoa, PENDÊNCIAS é
 * calculada pelo sistema, e QUARTO sai do agrupamento, não da digitação.
 */
const CAMPO_DA_COLUNA: (string | null)[] = [
  null, null,
  "schedule.startDate", "schedule.departureDate", "schedule.endDate", "schedule.returnDate",
  "ticket.value", "ticket.departureAirport", "ticket.actualDepartureTime", "ticket.actualReturnTime",
  "ticket.returnOriginAirport", "ticket.locator", "ticket.ticketCompany", "ticket.purchaseOrderNumber", "ticket.checkIn3",
  "accommodation.nightsCount", null, "accommodation.dailyRate", "accommodation.lateCheckout",
  "accommodation.totalCents", "accommodation.hotelName", "accommodation.paymentCompany", "accommodation.hotelOc", "accommodation.checkIn4",
  "baggage.amountCents", "baggage.oc", "baggage.checkIn",
  "uber.amountCents", "uber.oc", "uber.checkIn",
  "carRental.company", "carRental.amountCents", "carRental.oc", "carRental.checkIn",
  null,
];

/** Como cada campo é interpretado ao vir da planilha. */
const TIPO_DO_CAMPO: Record<string, "texto" | "dinheiro" | "inteiro" | "data" | "hora" | "bool"> = {
  "schedule.startDate": "data", "schedule.departureDate": "data",
  "schedule.endDate": "data", "schedule.returnDate": "data",
  "ticket.value": "dinheiro",
  "ticket.actualDepartureTime": "hora", "ticket.actualReturnTime": "hora",
  "accommodation.nightsCount": "inteiro",
  "accommodation.dailyRate": "dinheiro", "accommodation.totalCents": "dinheiro",
  "accommodation.lateCheckout": "bool",
  "baggage.amountCents": "dinheiro", "uber.amountCents": "dinheiro", "carRental.amountCents": "dinheiro",
  "accommodation.checkInDate": "data", "accommodation.checkOutDate": "data",
};

/** Tira acento, espaço duplo e caixa — para casar nomes que a planilha reescreve. */
export function normalizarNome(nome: string): string {
  return String(nome)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "R$ 1.234,56", "1234,56", 1234.56 → 123456 centavos. Vazio → null. */
export function paraCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Math.round(valor * 100);
  const limpo = String(valor).replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;
  // "1.234,56" (br) tem vírgula decimal; "1234.56" tem ponto.
  const br = limpo.includes(",");
  const normalizado = br ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Data da planilha → "YYYY-MM-DD". Aceita o que o Excel devolve: texto
 * brasileiro, ISO, ou o número de série (dias desde 1900).
 */
export function paraData(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, "0")}-${String(valor.getDate()).padStart(2, "0")}`;
  }
  if (typeof valor === "number") {
    // Série do Excel: 25569 é 1970-01-01. O bug histórico do ano 1900 já está
    // embutido nessa constante — é a conversão que o próprio Excel usa.
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  return null;
}

/** "8:30", "08:30:00", 0.354 (fração do dia no Excel) → "08:30". */
export function paraHora(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    const min = Math.round((valor % 1) * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = String(valor).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type ValorImportado = string | number | boolean | null;

export interface AlteracaoImportada {
  campo: string;
  de: ValorImportado;
  para: ValorImportado;
}

export interface LinhaImportada {
  /** Nome como veio na planilha — é o que a tela mostra. */
  nome: string;
  /** Vaga correspondente, quando o nome bateu. */
  teamInclusionId?: string;
  alteracoes: AlteracaoImportada[];
  /** Por que a linha não pôde ser usada (vazio = pode). */
  problema?: string;
}

export interface ResultadoDaLeitura {
  linhas: LinhaImportada[];
  /** Avisos sobre o arquivo inteiro. */
  avisos: string[];
  /** O cabeçalho esperado não foi achado — o arquivo não é do template. */
  formatoInvalido?: boolean;
}

/** Uma pessoa do evento, do jeito que a importação precisa vê-la. */
export interface PessoaDoEvento {
  teamInclusionId: string;
  nome: string;
  /** Valor atual de cada campo — para comparar e só registrar o que muda. */
  ler: (campo: string) => unknown;
}

function converter(campo: string, bruto: unknown): ValorImportado {
  const tipo = TIPO_DO_CAMPO[campo] ?? "texto";
  if (tipo === "dinheiro") return paraCentavos(bruto);
  if (tipo === "data") return paraData(bruto);
  if (tipo === "hora") return paraHora(bruto);
  if (tipo === "inteiro") {
    const n = Number(String(bruto).replace(/\D/g, ""));
    return Number.isFinite(n) && String(bruto).trim() !== "" ? n : null;
  }
  if (tipo === "bool") return /^(sim|s|x|true|1)$/i.test(String(bruto).trim());
  return String(bruto).trim();
}

/** Dois valores são o mesmo dado? (null, "" e undefined são todos "vazio".) */
function igual(a: unknown, b: unknown): boolean {
  const vazio = (v: unknown) => v === null || v === undefined || v === "";
  if (vazio(a) && vazio(b)) return true;
  if (vazio(a) || vazio(b)) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return !!a === !!b;
  // Datas guardadas com hora ("2026-05-29T00:00:00Z") x "2026-05-29".
  return String(a).slice(0, 10) === String(b).slice(0, 10) || String(a) === String(b);
}

/**
 * Lê a planilha e devolve o que MUDARIA. Não grava nada.
 *
 * `matriz` é o arquivo como array de linhas (o que o xlsx entrega). O cabeçalho
 * é procurado — o export escreve três linhas de contexto antes dele, e quem
 * edita costuma acrescentar mais.
 */
export function lerPlanilhaDoEspelho(matriz: unknown[][], pessoas: PessoaDoEvento[]): ResultadoDaLeitura {
  const avisos: string[] = [];

  const iCabecalho = matriz.findIndex((linha) =>
    Array.isArray(linha) && String(linha[0] ?? "").trim().toUpperCase() === "NOME" && String(linha[1] ?? "").trim().toUpperCase() === "DEPARTAMENTO",
  );
  if (iCabecalho < 0) {
    return {
      linhas: [],
      avisos: ['Não achei a linha de cabeçalho ("NOME", "DEPARTAMENTO"…). Exporte a planilha pelo botão "Exportar planilha" e preencha sobre ela.'],
      formatoInvalido: true,
    };
  }

  // Nome → pessoa. Nome repetido no evento não vira chave: preferimos deixar a
  // linha de fora a escrever na pessoa errada.
  const porNome = new Map<string, PessoaDoEvento[]>();
  for (const p of pessoas) {
    const chave = normalizarNome(p.nome);
    if (!porNome.has(chave)) porNome.set(chave, []);
    porNome.get(chave)!.push(p);
  }

  const linhas: LinhaImportada[] = [];
  for (let i = iCabecalho + 1; i < matriz.length; i++) {
    const linha = matriz[i];
    if (!Array.isArray(linha)) continue;
    const nome = String(linha[0] ?? "").trim();
    if (!nome) continue;
    // O export escreve blocos de subtotais depois das pessoas.
    if (/^(SUBTOTAIS|TOTAL|TOTAIS)\b/i.test(nome)) break;

    const candidatos = porNome.get(normalizarNome(nome)) ?? [];
    if (candidatos.length === 0) {
      linhas.push({ nome, alteracoes: [], problema: "não está escalada neste evento" });
      continue;
    }
    if (candidatos.length > 1) {
      linhas.push({ nome, alteracoes: [], problema: `${candidatos.length} pessoas com este nome no evento — não dá para saber qual` });
      continue;
    }
    const pessoa = candidatos[0];

    const alteracoes: AlteracaoImportada[] = [];
    for (let c = 0; c < CAMPO_DA_COLUNA.length; c++) {
      const campo = CAMPO_DA_COLUNA[c];
      if (!campo) continue;
      const bruto = linha[c];
      // Vazio NÃO apaga: planilha preenchida pela metade é o caso normal.
      if (bruto === null || bruto === undefined || String(bruto).trim() === "") continue;
      const novo = converter(campo, bruto);
      if (novo === null) continue;
      const atual = pessoa.ler(campo);
      if (igual(atual, novo)) continue;
      alteracoes.push({ campo, de: (atual ?? null) as ValorImportado, para: novo });
    }
    linhas.push({ nome, teamInclusionId: pessoa.teamInclusionId, alteracoes });
  }

  const semVaga = linhas.filter((l) => l.problema).length;
  if (semVaga > 0) avisos.push(`${semVaga} ${semVaga === 1 ? "linha ficou" : "linhas ficaram"} de fora — veja o motivo em cada uma.`);
  const comMudanca = linhas.filter((l) => l.alteracoes.length > 0).length;
  if (comMudanca === 0 && semVaga === 0) avisos.push("A planilha não traz nada diferente do que já está no sistema.");

  return { linhas, avisos };
}

/** Total de campos que serão gravados. */
export function totalDeAlteracoes(linhas: LinhaImportada[]): number {
  return linhas.reduce((n, l) => n + l.alteracoes.length, 0);
}
