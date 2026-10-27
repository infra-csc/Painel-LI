/**
 * Importação da planilha de contratos (26/10) — regra pura da prévia.
 *
 * O dono tem uma lista de contratos e vai mandá-la: o DP envia o arquivo
 * (XLSX/CSV — lido no navegador), diz qual coluna é o quê e vê, ANTES de
 * gravar, o que entra, o que atualiza e o que tem erro. O servidor roda esta
 * mesma função duas vezes: na prévia e de novo na confirmação (dentro da
 * transação), comparando a `assinatura` — se o cadastro mudou entre uma e
 * outra, a confirmação é recusada e a prévia precisa ser refeita.
 *
 * Regras:
 *  - CNPJ é a chave: existe no cadastro → atualiza; não existe → novo.
 *  - Célula vazia NUNCA apaga o que já está cadastrado (só preenche/troca).
 *  - Várias linhas com o mesmo CNPJ = um contrato com vários colaboradores
 *    (empreiteira). Se os dados do contrato divergem entre elas → erro na
 *    linha que diverge. Linha idêntica a outra → "repetida", ignorada.
 *  - Colaborador pelo CPF (preferido) ou pelo nome exato (sem acento/caixa);
 *    não achado ou nome com mais de um cadastro → erro na linha.
 *  - Vínculos com colaboradores só são ACRESCENTADOS (nunca removidos).
 *  - Linha com erro não entra; as demais entram.
 */
import { cnpjValido, digitosDoCnpj, mascararCnpj } from "./cnpj";
import { CONTRATO_OBSERVACAO_MAX, CONTRATO_TEXTO_MAX, TIPO_DE_CONTRATO_LABEL, erroDaVigencia, normalizarBusca, vigenciaEmTexto, type TipoDeContrato } from "./contratos";
import { cpfValido, digitosDoCpf } from "./pagamento";

export const IMPORTACAO_MAX_LINHAS = 5000;
export const IMPORTACAO_MAX_COLUNAS = 60;

export const CAMPOS_DA_IMPORTACAO = [
  "cnpj", "razaoSocial", "nomeFantasia", "tipo", "vigenciaInicio", "vigenciaFim", "colaboradorCpf", "colaboradorNome", "observacao",
] as const;
export type CampoDaImportacao = (typeof CAMPOS_DA_IMPORTACAO)[number];

export const CAMPO_DA_IMPORTACAO_LABEL: Record<CampoDaImportacao, string> = {
  cnpj: "CNPJ",
  razaoSocial: "Razão social",
  nomeFantasia: "Nome fantasia",
  tipo: "Tipo",
  vigenciaInicio: "Início da vigência",
  vigenciaFim: "Fim da vigência",
  colaboradorCpf: "CPF do colaborador",
  colaboradorNome: "Nome do colaborador",
  observacao: "Observação",
};

/** Obrigatórios no mapeamento (a razão social só é exigida para contrato novo). */
export const CAMPOS_OBRIGATORIOS: readonly CampoDaImportacao[] = ["cnpj"];

/** Coluna (índice) de cada campo; ausente = não importar. */
export type Mapeamento = Partial<Record<CampoDaImportacao, number>>;

const PISTAS: Record<CampoDaImportacao, RegExp> = {
  cnpj: /^(cnpj|cnpj do (contrato|titular|prestador|fornecedor)|documento da empresa)$/,
  razaoSocial: /(razao social|razao|empresa|fornecedor|prestador)$/,
  nomeFantasia: /fantasia/,
  tipo: /^(tipo|tipo de contrato|natureza|enquadramento)$/,
  vigenciaInicio: /(inicio|data de inicio|vigencia inicio|inicio da vigencia|vigente desde|desde|assinatura)/,
  vigenciaFim: /(fim|termino|vencimento|validade|vigencia fim|fim da vigencia|ate)$/,
  colaboradorCpf: /(cpf)/,
  colaboradorNome: /^(nome|colaborador|nome do colaborador|freela|nome completo|responsavel)$/,
  observacao: /(observ|obs|nota)/,
};

/** Palpite de mapeamento pelos títulos das colunas (o DP confere e corrige). */
export function sugerirMapeamento(cabecalho: readonly string[]): Mapeamento {
  const m: Mapeamento = {};
  const usados = new Set<number>();
  const titulos = cabecalho.map((t) => normalizarBusca(t).replace(/[_\-.:]+/g, " ").replace(/\s+/g, " ").trim());
  for (const campo of CAMPOS_DA_IMPORTACAO) {
    const i = titulos.findIndex((t, idx) => !usados.has(idx) && t && PISTAS[campo].test(t));
    if (i >= 0) { m[campo] = i; usados.add(i); }
  }
  return m;
}

// ── Leitura das células ─────────────────────────────────────────────────────

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const RE_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

function dataReal(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Data de uma célula: "AAAA-MM-DD", "DD/MM/AAAA" (também com - ou .),
 * "DD/MM/AA" (século 2000) ou número de série do Excel. Vazio → null.
 * Devolve `{ erro }` para o que não é data.
 */
export function lerDataDaPlanilha(valor: string | null | undefined): { data: string | null } | { erro: string } {
  const t = String(valor ?? "").trim();
  if (!t) return { data: null };
  let m = t.match(RE_ISO);
  if (m) {
    const d = dataReal(+m[1], +m[2], +m[3]);
    return d ? { data: d } : { erro: `Data inválida: "${t}"` };
  }
  m = t.match(RE_BR);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = dataReal(ano, +m[2], +m[1]);
    return d ? { data: d } : { erro: `Data inválida: "${t}"` };
  }
  if (/^\d{4,5}(\.\d+)?$/.test(t)) {
    // Série do Excel (dias desde 30/12/1899).
    const serie = Math.floor(Number(t));
    if (serie >= 20000 && serie <= 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000);
      return { data: dt.toISOString().slice(0, 10) };
    }
  }
  return { erro: `Data inválida: "${t}"` };
}

/** Tipo do contrato escrito na planilha. Vazio → null; desconhecido → erro. */
export function lerTipoDaPlanilha(valor: string | null | undefined): { tipo: TipoDeContrato | null } | { erro: string } {
  const t = normalizarBusca(valor).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return { tipo: null };
  if (/^(mei|microempreendedor( individual)?)$/.test(t)) return { tipo: "mei" };
  if (/^(empreit(a|eira|eiro)|empreitada)/.test(t)) return { tipo: "empreiteira" };
  if (/^(empresa|pj|pessoa juridica|ltda|me|epp|eireli|sociedade|slu|sa)$/.test(t)) return { tipo: "empresa" };
  return { erro: `Tipo "${String(valor).trim()}" não reconhecido — use MEI, Empresa ou Empreiteira.` };
}

/**
 * O Excel guarda CNPJ/CPF digitados como NÚMERO e tira os zeros da frente
 * ("01.234.567/0001-89" vira 1234567000189). Faltando 1 ou 2 dígitos,
 * devolve os zeros; mais que isso é outro erro (fica como está).
 */
export function zerosDaPlanilha(digitos: string, tamanho: number): string {
  return digitos.length >= tamanho - 2 && digitos.length < tamanho ? digitos.padStart(tamanho, "0") : digitos;
}

/**
 * CSV → linhas de células (texto). Separador detectado na 1ª linha (";" do
 * Excel brasileiro, "," ou tab), aspas com "" escapado, CRLF, BOM. Lido como
 * TEXTO de propósito: passar o CSV pelo leitor de planilha transformaria
 * "01234567000189" em número e comeria o zero.
 */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const conta = (c: string) => primeira.split(c).length - 1;
  const sep = [";", ",", "\t"].sort((a, b) => conta(b) - conta(a))[0];
  const linhas: string[][] = [];
  let linha: string[] = [];
  let cel = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === "\"" && t[i + 1] === "\"") { cel += "\""; i++; }
      else if (ch === "\"") aspas = false;
      else cel += ch;
    } else if (ch === "\"" && cel === "") aspas = true;
    else if (ch === sep) { linha.push(cel); cel = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(cel); linhas.push(linha); linha = []; cel = "";
    } else cel += ch;
  }
  if (cel !== "" || linha.length > 0) { linha.push(cel); linhas.push(linha); }
  return linhas.map((l) => l.map((x) => x.trim()));
}

// ── Prévia ──────────────────────────────────────────────────────────────────

export interface ContratoExistente {
  id: string;
  /** Só os 14 dígitos. */
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  tipo: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
  encerrado: boolean;
  colaboradorIds: readonly string[];
}

export interface ColaboradorParaImportacao {
  id: string;
  fullName: string;
  /** Documentos que são CPF (principal e/ou secundário), só dígitos. */
  cpfs: readonly string[];
}

export type AcaoDaLinha = "novo" | "atualiza" | "sem_mudanca" | "erro" | "repetida";

export interface LinhaDaPrevia {
  /** Número da linha NA PLANILHA (o cabeçalho é a linha 1). */
  linha: number;
  cnpj: string | null;
  razaoSocial: string | null;
  colaborador: { id: string; nome: string } | null;
  acao: AcaoDaLinha;
  erros: string[];
  avisos: string[];
  /** O que muda no contrato existente (só em "atualiza"). */
  mudancas: string[];
}

export interface DadosDoContratoImportado {
  razaoSocial: string;
  nomeFantasia: string | null;
  tipo: TipoDeContrato;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  observacao: string | null;
}

export interface OperacaoDaImportacao {
  /** 14 dígitos. */
  cnpj: string;
  /** Contrato existente que será atualizado; null = criar. */
  contratoId: string | null;
  dados: DadosDoContratoImportado;
  /** Colaboradores a ACRESCENTAR ao contrato. */
  novosColaboradores: string[];
  /** Linhas da planilha que formam a operação. */
  linhas: number[];
}

export interface PreviaDaImportacao {
  linhas: LinhaDaPrevia[];
  operacoes: OperacaoDaImportacao[];
  contagem: { total: number; novos: number; atualizados: number; semMudanca: number; erros: number; repetidas: number };
  /** Contratos (não linhas) novos e atualizados. */
  contratos: { novos: number; atualizados: number };
  assinatura: string;
}

/** Hash curto e estável (FNV-1a 32 bits) — compara prévia × confirmação. */
export function assinaturaDe(valor: unknown): string {
  const texto = JSON.stringify(valor);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const celula = (linha: readonly string[], i: number | undefined): string =>
  i == null || i < 0 ? "" : String(linha[i] ?? "").replace(/\s+/g, " ").trim();


interface Acumulado {
  op: OperacaoDaImportacao;
  /** Campos do contrato vindos da PRIMEIRA linha que os informou (para detectar divergência). */
  origem: Partial<Record<keyof DadosDoContratoImportado, { valor: string | null; linha: number }>>;
  colaboradoresVistos: Set<string>;
  existente: ContratoExistente | null;
  semColaboradorVisto: boolean;
}

/**
 * Monta a prévia. `linhas` NÃO inclui o cabeçalho; a linha i da lista é a
 * linha i + 2 da planilha.
 */
export function preverImportacao(
  linhas: readonly (readonly string[])[],
  mapeamento: Mapeamento,
  existentes: readonly ContratoExistente[],
  colaboradores: readonly ColaboradorParaImportacao[],
): PreviaDaImportacao {
  const porCnpj = new Map(existentes.map((c) => [digitosDoCnpj(c.cnpj), c]));
  const porCpf = new Map<string, ColaboradorParaImportacao>();
  const porNome = new Map<string, ColaboradorParaImportacao[]>();
  const nomeDe = new Map<string, string>();
  for (const c of colaboradores) {
    nomeDe.set(c.id, c.fullName);
    for (const cpf of c.cpfs) if (cpf) porCpf.set(cpf, c);
    const k = normalizarBusca(c.fullName);
    porNome.set(k, [...(porNome.get(k) ?? []), c]);
  }

  const resultado: LinhaDaPrevia[] = [];
  const acumulados = new Map<string, Acumulado>();
  const ordem: string[] = [];

  linhas.forEach((cru, idx) => {
    const numero = idx + 2;
    const erros: string[] = [];
    const avisos: string[] = [];
    const v = (campo: CampoDaImportacao) => celula(cru, mapeamento[campo]);

    // Linha totalmente vazia (fim da planilha com formatação): ignora calada.
    if (cru.every((x) => !String(x ?? "").trim())) return;

    const cnpjCru = v("cnpj");
    const cnpj = zerosDaPlanilha(digitosDoCnpj(cnpjCru), 14);
    if (!cnpjCru) erros.push("CNPJ vazio.");
    else if (!cnpjValido(cnpj)) erros.push(`CNPJ inválido: "${cnpjCru}".`);

    const razao = v("razaoSocial").slice(0, CONTRATO_TEXTO_MAX + 1);
    if (razao.length > CONTRATO_TEXTO_MAX) erros.push("Razão social longa demais.");
    const fantasia = v("nomeFantasia") || null;
    const obs = v("observacao") || null;
    if (obs && obs.length > CONTRATO_OBSERVACAO_MAX) erros.push("Observação longa demais.");

    const tipoLido = lerTipoDaPlanilha(v("tipo"));
    if ("erro" in tipoLido) erros.push(tipoLido.erro);
    const inicioLido = lerDataDaPlanilha(v("vigenciaInicio"));
    if ("erro" in inicioLido) erros.push(`Início: ${inicioLido.erro}.`);
    const fimLido = lerDataDaPlanilha(v("vigenciaFim"));
    if ("erro" in fimLido) erros.push(`Fim: ${fimLido.erro}.`);
    const inicio = "data" in inicioLido ? inicioLido.data : null;
    const fim = "data" in fimLido ? fimLido.data : null;
    const erroVig = erroDaVigencia(inicio, fim);
    if (erroVig) erros.push(erroVig);

    // Colaborador: CPF primeiro; nome só quando não há CPF na linha.
    let colaborador: ColaboradorParaImportacao | null = null;
    const cpfCru = v("colaboradorCpf");
    const nomeCru = v("colaboradorNome");
    if (cpfCru) {
      const cpf = zerosDaPlanilha(digitosDoCpf(cpfCru), 11);
      if (!cpfValido(cpf)) erros.push(`CPF inválido: "${cpfCru}".`);
      else {
        colaborador = porCpf.get(cpf) ?? null;
        if (!colaborador) erros.push(`CPF ${cpfCru} não achado no cadastro de colaboradores.`);
      }
    } else if (nomeCru) {
      const achados = porNome.get(normalizarBusca(nomeCru)) ?? [];
      if (achados.length === 1) colaborador = achados[0];
      else if (achados.length === 0) erros.push(`Colaborador "${nomeCru}" não achado — confira o nome ou use o CPF.`);
      else erros.push(`Há ${achados.length} colaboradores chamados "${nomeCru}" — use o CPF.`);
    }

    const existente = cnpj.length === 14 ? porCnpj.get(cnpj) ?? null : null;
    if (!existente && cnpj.length === 14 && !razao && !acumulados.has(cnpj)) erros.push("Razão social obrigatória para contrato novo.");

    const base: LinhaDaPrevia = {
      linha: numero,
      cnpj: cnpj.length === 14 ? mascararCnpj(cnpj) : cnpjCru || null,
      razaoSocial: razao || existente?.razaoSocial || null,
      colaborador: colaborador ? { id: colaborador.id, nome: colaborador.fullName } : null,
      acao: "erro",
      erros,
      avisos,
      mudancas: [],
    };
    if (erros.length > 0) { resultado.push(base); return; }

    const tipo = "tipo" in tipoLido ? tipoLido.tipo : null;
    const informados: Partial<Record<keyof DadosDoContratoImportado, string | null>> = {};
    if (razao) informados.razaoSocial = razao;
    if (fantasia) informados.nomeFantasia = fantasia;
    if (tipo) informados.tipo = tipo;
    if (inicio) informados.vigenciaInicio = inicio;
    if (fim) informados.vigenciaFim = fim;
    if (obs) informados.observacao = obs;

    let acc = acumulados.get(cnpj);
    if (acc) {
      // Mesma empresa em outra linha: os dados do contrato não podem divergir.
      const divergentes = (Object.keys(informados) as (keyof DadosDoContratoImportado)[])
        .filter((k) => acc!.origem[k] && normalizarBusca(acc!.origem[k]!.valor) !== normalizarBusca(informados[k] ?? null));
      if (divergentes.length > 0) {
        const k = divergentes[0];
        base.erros.push(`CNPJ repetido na planilha com dados diferentes da linha ${acc.origem[k]!.linha} (${ROTULO_CURTO[k]}).`);
        resultado.push(base);
        return;
      }
      for (const k of Object.keys(informados) as (keyof DadosDoContratoImportado)[]) {
        if (!acc.origem[k]) acc.origem[k] = { valor: informados[k] ?? null, linha: numero };
      }
      const repetida = colaborador ? acc.colaboradoresVistos.has(colaborador.id) : acc.semColaboradorVisto;
      if (repetida) {
        resultado.push({ ...base, acao: "repetida", avisos: ["Linha igual a outra da planilha — ignorada."] });
        return;
      }
    } else {
      acc = {
        op: {
          cnpj,
          contratoId: existente?.id ?? null,
          dados: {
            razaoSocial: existente?.razaoSocial ?? "",
            nomeFantasia: existente?.nomeFantasia ?? null,
            tipo: (existente?.tipo as TipoDeContrato) ?? "empresa",
            vigenciaInicio: existente?.vigenciaInicio ?? null,
            vigenciaFim: existente?.vigenciaFim ?? null,
            observacao: existente?.observacao ?? null,
          },
          novosColaboradores: [],
          linhas: [],
        },
        origem: {},
        colaboradoresVistos: new Set(),
        existente,
        semColaboradorVisto: false,
      };
      for (const k of Object.keys(informados) as (keyof DadosDoContratoImportado)[]) acc.origem[k] = { valor: informados[k] ?? null, linha: numero };
      acumulados.set(cnpj, acc);
      ordem.push(cnpj);
      if (!existente && !tipo) avisos.push("Tipo não informado — entra como Empresa.");
      if (existente?.encerrado) avisos.push("Contrato encerrado no cadastro — continua encerrado (reative na tela, se for o caso).");
    }

    // Aplica o que a linha informou (vazio não apaga).
    Object.assign(acc.op.dados, informados);
    acc.op.linhas.push(numero);
    if (colaborador) {
      acc.colaboradoresVistos.add(colaborador.id);
      if (!(acc.existente?.colaboradorIds ?? []).includes(colaborador.id) && !acc.op.novosColaboradores.includes(colaborador.id)) {
        acc.op.novosColaboradores.push(colaborador.id);
      }
    } else acc.semColaboradorVisto = true;

    resultado.push({ ...base, razaoSocial: acc.op.dados.razaoSocial || base.razaoSocial, acao: existente ? "atualiza" : "novo" });
  });

  // Classificação final de cada contrato existente: mudou algo?
  const operacoes: OperacaoDaImportacao[] = [];
  let atualizados = 0;
  let novos = 0;
  for (const cnpj of ordem) {
    const acc = acumulados.get(cnpj)!;
    const ex = acc.existente;
    const d = acc.op.dados;
    const erroVig = erroDaVigencia(d.vigenciaInicio, d.vigenciaFim);
    const linhasDoContrato = resultado.filter((l) => acc.op.linhas.includes(l.linha));
    if (erroVig) {
      // Fim de uma linha antes do início de outra (ou da data já cadastrada).
      for (const l of linhasDoContrato) { l.acao = "erro"; l.erros.push(`${erroVig} (juntando as linhas ${acc.op.linhas.join(", ")}${ex ? " e o cadastro" : ""})`); }
      continue;
    }
    if (!ex) { operacoes.push(acc.op); novos++; continue; }
    const mudancas: string[] = [];
    if (d.razaoSocial !== ex.razaoSocial) mudancas.push(`Razão social: ${ex.razaoSocial} → ${d.razaoSocial}`);
    if ((d.nomeFantasia ?? null) !== (ex.nomeFantasia ?? null)) mudancas.push(`Nome fantasia: ${ex.nomeFantasia ?? "—"} → ${d.nomeFantasia ?? "—"}`);
    if (d.tipo !== ex.tipo) mudancas.push(`Tipo: ${TIPO_DE_CONTRATO_LABEL[ex.tipo as TipoDeContrato] ?? ex.tipo} → ${TIPO_DE_CONTRATO_LABEL[d.tipo]}`);
    if ((d.vigenciaInicio ?? null) !== (ex.vigenciaInicio ?? null) || (d.vigenciaFim ?? null) !== (ex.vigenciaFim ?? null)) {
      mudancas.push(`Vigência: ${vigenciaEmTexto(ex.vigenciaInicio, ex.vigenciaFim)} → ${vigenciaEmTexto(d.vigenciaInicio, d.vigenciaFim)}`);
    }
    if ((d.observacao ?? null) !== (ex.observacao ?? null)) mudancas.push("Observação atualizada");
    for (const id of acc.op.novosColaboradores) mudancas.push(`+ colaborador ${nomeDe.get(id) ?? id}`);
    if (mudancas.length === 0) {
      for (const l of linhasDoContrato) l.acao = "sem_mudanca";
      continue;
    }
    if (linhasDoContrato[0]) linhasDoContrato[0].mudancas = mudancas;
    operacoes.push(acc.op);
    atualizados++;
  }

  const conta = (a: AcaoDaLinha) => resultado.filter((l) => l.acao === a).length;
  const contagem = {
    total: resultado.length,
    novos: conta("novo"),
    atualizados: conta("atualiza"),
    semMudanca: conta("sem_mudanca"),
    erros: conta("erro"),
    repetidas: conta("repetida"),
  };
  return { linhas: resultado, operacoes, contagem, contratos: { novos, atualizados }, assinatura: assinaturaDe(operacoes) };
}

const ROTULO_CURTO: Record<keyof DadosDoContratoImportado, string> = {
  razaoSocial: "razão social", nomeFantasia: "nome fantasia", tipo: "tipo",
  vigenciaInicio: "início da vigência", vigenciaFim: "fim da vigência", observacao: "observação",
};

/** Mapeamento válido para a planilha (colunas existem, CNPJ mapeado, sem coluna repetida). */
export function erroDoMapeamento(mapeamento: Mapeamento, colunas: number): string | null {
  if (mapeamento.cnpj == null) return "Diga qual coluna tem o CNPJ.";
  const usadas = new Map<number, CampoDaImportacao>();
  for (const campo of CAMPOS_DA_IMPORTACAO) {
    const i = mapeamento[campo];
    if (i == null) continue;
    if (!Number.isInteger(i) || i < 0 || i >= colunas) return `Coluna inválida para ${CAMPO_DA_IMPORTACAO_LABEL[campo]}.`;
    const outro = usadas.get(i);
    if (outro) return `A mesma coluna está em ${CAMPO_DA_IMPORTACAO_LABEL[outro]} e ${CAMPO_DA_IMPORTACAO_LABEL[campo]}.`;
    usadas.set(i, campo);
  }
  return null;
}
