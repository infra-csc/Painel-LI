/**
 * Dados de pagamento do colaborador — validação e máscara (26/10, Fase 0 do
 * Módulo de Honorários). Puro: o cliente (formulário) e o servidor (PUT)
 * usam a MESMA regra.
 *
 * Apresentação de 21/10: "CNPJ emissor e conta bancária — cadastro hoje tem
 * CPF, RG e endereço". Só o DP (admin + financial) vê e edita; banco,
 * agência, conta e chave PIX ficam cifrados no banco (server/cripto-pagamento.ts).
 */
import { cnpjValido, digitosDoCnpj } from "./cnpj";
import { normalizarBusca } from "./contratos";

// ── CPF ─────────────────────────────────────────────────────────────────────

export const digitosDoCpf = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** CPF com 11 dígitos e os dois verificadores certos (todos iguais não vale). */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = digitosDoCpf(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Completa 9 dígitos com os verificadores (dados de demonstração e testes). */
export function completarCpf(base9: string): string {
  const b = digitosDoCpf(base9).slice(0, 9).padStart(9, "0");
  const dv = (s: string) => {
    let soma = 0;
    for (let i = 0; i < s.length; i++) soma += Number(s[i]) * (s.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(b);
  const d2 = dv(b + d1);
  return `${b}${d1}${d2}`;
}

// ── Banco ───────────────────────────────────────────────────────────────────

/**
 * Bancos mais usados (código COMPE → nome curto). Não é a lista inteira do
 * Bacen (são centenas): código de 3 dígitos fora daqui é aceito com aviso
 * "confira", nunca recusado.
 */
export const BANCOS: Readonly<Record<string, string>> = {
  "001": "Banco do Brasil",
  "003": "Banco da Amazônia",
  "004": "Banco do Nordeste",
  "021": "Banestes",
  "033": "Santander",
  "036": "Bradesco BBI",
  "037": "Banpará",
  "041": "Banrisul",
  "047": "Banese",
  "070": "BRB",
  "077": "Inter",
  "084": "Sisprime",
  "085": "Ailos",
  "097": "Credisis",
  "104": "Caixa Econômica Federal",
  "133": "Cresol",
  "136": "Unicred",
  "197": "Stone",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "218": "BS2",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "318": "Banco BMG",
  "323": "Mercado Pago",
  "329": "QI Sociedade de Crédito",
  "336": "C6 Bank",
  "341": "Itaú Unibanco",
  "380": "PicPay",
  "389": "Mercantil do Brasil",
  "403": "Cora",
  "422": "Safra",
  "536": "Neon",
  "623": "Banco Pan",
  "633": "Rendimento",
  "655": "Votorantim (BV)",
  "707": "Daycoval",
  "748": "Sicredi",
  "756": "Sicoob",
};

export const digitosDoBanco = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/** Código do banco com 3 dígitos ("1" vira "001"), ou null se não for número de 1–3 dígitos. */
export function codigoDoBanco(v: string | null | undefined): string | null {
  const d = digitosDoBanco(v);
  if (!d || d.length > 3) return null;
  return d.padStart(3, "0");
}

export const nomeDoBanco = (codigo: string | null | undefined): string | null => {
  const c = codigoDoBanco(codigo);
  return c ? BANCOS[c] ?? null : null;
};

/** "341 · Itaú Unibanco" (ou só o código, se não for conhecido). */
export function rotuloDoBanco(codigo: string | null | undefined): string {
  const c = codigoDoBanco(codigo);
  if (!c) return "";
  const nome = BANCOS[c];
  return nome ? `${c} · ${nome}` : c;
}

// ── Agência e conta ─────────────────────────────────────────────────────────

/** Agência: 1–5 dígitos, com dígito verificador opcional ("1234" ou "1234-5"). */
export function agenciaValida(v: string | null | undefined): boolean {
  return /^\d{1,5}(-[\dxX])?$/.test(String(v ?? "").trim());
}

/** Conta: 1–13 dígitos com dígito verificador opcional ("12345-6", "123456x"). */
export function contaValida(v: string | null | undefined): boolean {
  return /^\d{1,13}(-?[\dxX])?$/.test(String(v ?? "").trim());
}

export const TIPOS_DE_CONTA = ["corrente", "poupanca", "pagamento"] as const;
export type TipoDeConta = (typeof TIPOS_DE_CONTA)[number];
export const TIPO_DE_CONTA_LABEL: Record<TipoDeConta, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  pagamento: "Conta de pagamento",
};
export const ehTipoDeConta = (v: unknown): v is TipoDeConta => typeof v === "string" && (TIPOS_DE_CONTA as readonly string[]).includes(v);

// ── PIX ─────────────────────────────────────────────────────────────────────

export const TIPOS_DE_PIX = ["cpf", "cnpj", "email", "telefone", "aleatoria"] as const;
export type TipoDePix = (typeof TIPOS_DE_PIX)[number];
export const TIPO_DE_PIX_LABEL: Record<TipoDePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};
export const ehTipoDePix = (v: unknown): v is TipoDePix => typeof v === "string" && (TIPOS_DE_PIX as readonly string[]).includes(v);

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chave PIX na forma em que é gravada: CPF/CNPJ só dígitos, e-mail em
 * minúsculas, telefone "+55DDNNNNNNNNN", aleatória em minúsculas.
 */
export function normalizarChavePix(tipo: TipoDePix, chave: string): string {
  const t = chave.trim();
  switch (tipo) {
    case "cpf": return digitosDoCpf(t);
    case "cnpj": return digitosDoCnpj(t);
    case "email": return t.toLowerCase();
    case "telefone": {
      let d = t.replace(/\D/g, "");
      if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
      return d.length === 10 || d.length === 11 ? `+55${d}` : t;
    }
    case "aleatoria": return t.toLowerCase();
  }
}

/** Mensagem de erro da chave PIX conforme o tipo (null = válida). */
export function erroDaChavePix(tipo: TipoDePix, chave: string | null | undefined): string | null {
  const t = String(chave ?? "").trim();
  if (!t) return "Informe a chave PIX.";
  switch (tipo) {
    case "cpf": return cpfValido(t) ? null : "CPF inválido para chave PIX.";
    case "cnpj": return cnpjValido(t) ? null : "CNPJ inválido para chave PIX.";
    case "email": return t.length <= 77 && RE_EMAIL.test(t) ? null : "E-mail inválido para chave PIX.";
    case "telefone": return /^\+55\d{10,11}$/.test(normalizarChavePix("telefone", t)) ? null : "Telefone inválido — use DDD + número (ex.: 11 98765-4321).";
    case "aleatoria": return RE_ALEATORIA.test(t) ? null : "Chave aleatória inválida — são 32 letras/números no formato 8-4-4-4-12.";
  }
}

// ── E-mail de contato ───────────────────────────────────────────────────────

export const emailValido = (v: string | null | undefined): boolean => {
  const t = String(v ?? "").trim();
  return t.length <= 254 && RE_EMAIL.test(t);
};

// ── Formulário inteiro ─────────────────────────────────────────────────────

export interface DadosDePagamento {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: TipoDeConta | null;
  pixTipo: TipoDePix | null;
  pixChave: string | null;
  titular: string | null;
  email: string | null;
}

export const PAGAMENTO_VAZIO: DadosDePagamento = {
  banco: null, agencia: null, conta: null, tipoConta: null, pixTipo: null, pixChave: null, titular: null, email: null,
};

/** Os campos que ficam cifrados no banco. */
export const CAMPOS_CIFRADOS = ["banco", "agencia", "conta", "pixChave"] as const;
export type CampoCifrado = (typeof CAMPOS_CIFRADOS)[number];

export type ErrosDoPagamento = Partial<Record<keyof DadosDePagamento, string>>;

const vazio = (v: string | null | undefined) => !String(v ?? "").trim();

/**
 * Valida o formulário. Conta bancária é tudo-ou-nada (banco + agência +
 * conta + tipo); PIX é tipo + chave. Pode ter só conta, só PIX ou os dois.
 */
export function validarPagamento(d: DadosDePagamento): ErrosDoPagamento {
  const e: ErrosDoPagamento = {};
  const algumaDaConta = !vazio(d.banco) || !vazio(d.agencia) || !vazio(d.conta) || !!d.tipoConta;
  if (algumaDaConta) {
    if (vazio(d.banco)) e.banco = "Informe o banco.";
    else if (!codigoDoBanco(d.banco)) e.banco = "Código do banco tem 3 dígitos (ex.: 341).";
    if (vazio(d.agencia)) e.agencia = "Informe a agência.";
    else if (!agenciaValida(d.agencia)) e.agencia = "Agência inválida — até 5 dígitos, com dígito opcional (1234-5).";
    if (vazio(d.conta)) e.conta = "Informe a conta.";
    else if (!contaValida(d.conta)) e.conta = "Conta inválida — números com dígito (12345-6).";
    if (!d.tipoConta) e.tipoConta = "Escolha o tipo de conta.";
  }
  if (d.pixTipo || !vazio(d.pixChave)) {
    if (!d.pixTipo) e.pixTipo = "Escolha o tipo da chave PIX.";
    else {
      const erro = erroDaChavePix(d.pixTipo, d.pixChave);
      if (erro) e.pixChave = erro;
    }
  }
  if (!vazio(d.email) && !emailValido(d.email)) e.email = "E-mail inválido.";
  if (d.titular && d.titular.trim().length > 120) e.titular = "Nome do titular muito longo.";
  return e;
}

/** Normaliza o que será gravado (sem espaços, banco com 3 dígitos, PIX na forma canônica). */
export function normalizarPagamento(d: DadosDePagamento): DadosDePagamento {
  const limpo = (v: string | null | undefined) => (vazio(v) ? null : String(v).trim());
  const pixTipo = d.pixTipo ?? null;
  const pixChave = limpo(d.pixChave);
  return {
    banco: limpo(d.banco) ? codigoDoBanco(d.banco) : null,
    agencia: limpo(d.agencia)?.toUpperCase() ?? null,
    conta: limpo(d.conta)?.toUpperCase() ?? null,
    tipoConta: limpo(d.banco) || limpo(d.conta) ? d.tipoConta ?? null : null,
    pixTipo: pixChave ? pixTipo : null,
    pixChave: pixChave && pixTipo ? normalizarChavePix(pixTipo, pixChave) : null,
    titular: limpo(d.titular)?.replace(/\s+/g, " ") ?? null,
    email: limpo(d.email)?.toLowerCase() ?? null,
  };
}

/** Avisos (não bloqueiam): banco fora da lista conhecida. */
export function avisosDoPagamento(d: DadosDePagamento): string[] {
  const avisos: string[] = [];
  const c = codigoDoBanco(d.banco);
  if (c && !BANCOS[c]) avisos.push(`O banco ${c} não está na lista dos mais usados — confira o código.`);
  return avisos;
}

// ── Máscaras (auditoria, aviso do sino, tela fechada) ─────────────────────

const PONTO = "•";

/** Mostra só os últimos `n` caracteres significativos. */
function soOFinal(v: string, n: number): string {
  const t = v.trim();
  if (t.length <= n) return PONTO.repeat(Math.max(2, t.length));
  return PONTO.repeat(Math.min(6, t.length - n)) + t.slice(-n);
}

export function mascararAgencia(v: string | null | undefined): string {
  return v ? soOFinal(v, 2) : "";
}

export function mascararConta(v: string | null | undefined): string {
  return v ? soOFinal(v, 3) : "";
}

export function mascararChavePix(tipo: TipoDePix | null | undefined, v: string | null | undefined): string {
  if (!v) return "";
  const t = v.trim();
  switch (tipo) {
    case "cpf": {
      const d = digitosDoCpf(t);
      return d.length === 11 ? `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••` : soOFinal(t, 3);
    }
    case "cnpj": {
      const d = digitosDoCnpj(t);
      return d.length === 14 ? `${d.slice(0, 2)}.•••.•••/${d.slice(8, 12)}-••` : soOFinal(t, 3);
    }
    case "email": {
      const [u, dom = ""] = t.split("@");
      const [host, ...resto] = dom.split(".");
      return `${u.slice(0, 1)}•••@${host.slice(0, 1)}•••${resto.length ? "." + resto.join(".") : ""}`;
    }
    case "telefone": {
      const d = t.replace(/\D/g, "");
      return d.length >= 4 ? `(••) •••••-${d.slice(-4)}` : soOFinal(t, 2);
    }
    case "aleatoria":
      return t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : soOFinal(t, 2);
    default:
      return soOFinal(t, 3);
  }
}

/** O pagamento inteiro mascarado — o que a auditoria e o aviso guardam. */
export function pagamentoMascarado(d: Partial<DadosDePagamento> | null | undefined): Record<string, string | null> {
  if (!d) return {};
  return {
    banco: d.banco ? rotuloDoBanco(d.banco) : null,
    agencia: d.agencia ? mascararAgencia(d.agencia) : null,
    conta: d.conta ? mascararConta(d.conta) : null,
    tipoConta: d.tipoConta ? TIPO_DE_CONTA_LABEL[d.tipoConta] : null,
    pixTipo: d.pixTipo ? TIPO_DE_PIX_LABEL[d.pixTipo] : null,
    pixChave: d.pixChave ? mascararChavePix(d.pixTipo, d.pixChave) : null,
    titular: d.titular ?? null,
    email: d.email ?? null,
  };
}

/** Os campos de conta/PIX — mudança em qualquer um vira aviso no sino do DP. */
export const CAMPOS_DA_CONTA = ["banco", "agencia", "conta", "tipoConta", "pixTipo", "pixChave", "titular"] as const;

export function camposAlterados(antes: DadosDePagamento, depois: DadosDePagamento): (keyof DadosDePagamento)[] {
  return (Object.keys(PAGAMENTO_VAZIO) as (keyof DadosDePagamento)[]).filter((k) => (antes[k] ?? null) !== (depois[k] ?? null));
}

export const mudouAConta = (campos: readonly (keyof DadosDePagamento)[]) =>
  campos.some((c) => (CAMPOS_DA_CONTA as readonly string[]).includes(c));

export const ROTULO_DO_CAMPO_DE_PAGAMENTO: Record<keyof DadosDePagamento, string> = {
  banco: "Banco", agencia: "Agência", conta: "Conta", tipoConta: "Tipo de conta",
  pixTipo: "Tipo da chave PIX", pixChave: "Chave PIX", titular: "Titular da conta", email: "E-mail",
};

// ── Titular × razão social ─────────────────────────────────────────────────

/** Palavras de forma jurídica que não ajudam a comparar nomes. */
const RUIDO = new Set(["ltda", "me", "epp", "eireli", "mei", "sa", "s/a", "ss", "slu", "de", "da", "do", "das", "dos", "e", "cia", "comercio", "servicos", "servico"]);

function palavras(nome: string): string[] {
  return normalizarBusca(nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((p) => p && !RUIDO.has(p) && !/^\d+$/.test(p));
}

/**
 * O titular da conta "bate" com a razão social? Bate quando todas as
 * palavras de um estão no outro (ignorando LTDA/ME/EIRELI, preposições e os
 * números que o MEI leva no começo da razão social: "12.345.678 JOÃO SILVA").
 * Só gera AVISO — conta de sócio ou de procurador existe.
 */
export function titularBateComRazaoSocial(titular: string | null | undefined, razaoSocial: string | null | undefined): boolean {
  const a = palavras(String(titular ?? ""));
  const b = palavras(String(razaoSocial ?? ""));
  if (a.length === 0 || b.length === 0) return true;
  const sa = new Set(a);
  const sb = new Set(b);
  return a.every((p) => sb.has(p)) || b.every((p) => sa.has(p));
}
