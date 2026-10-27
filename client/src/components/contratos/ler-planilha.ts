/**
 * Leitura da planilha de contratos NO NAVEGADOR (26/10). O arquivo nunca vai
 * para o servidor: só as células, em texto, para a prévia — e nada é gravado
 * antes da confirmação.
 *
 *  - CSV: decodificado como UTF-8 (ou Windows-1252, o padrão do Excel
 *    brasileiro) e lido como TEXTO por `lerCsv` — o leitor de planilha
 *    transformaria "01234567000189" em número e comeria o zero;
 *  - XLSX/XLS: SheetJS (já no projeto, carregado só aqui), valores CRUS:
 *    data vira número de série do Excel, que a prévia converte sem depender
 *    do formato de exibição (m/d/aa × d/m/aa).
 */
import { lerCsv, IMPORTACAO_MAX_COLUNAS, IMPORTACAO_MAX_LINHAS } from "@shared/importacao-contratos";

export const TAMANHO_MAXIMO_DA_PLANILHA = 10 * 1024 * 1024;

export interface AbaDaPlanilha { nome: string; cabecalho: string[]; linhas: string[][]; colunas: number }

export class ErroDaPlanilha extends Error {}

function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const celulaEmTexto = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

/** Separa o cabeçalho (1ª linha não vazia) e corta colunas vazias do fim. */
export function montarAba(nome: string, cru: unknown[][]): AbaDaPlanilha {
  const linhas = cru.map((l) => (Array.isArray(l) ? l.map(celulaEmTexto) : []));
  const inicio = linhas.findIndex((l) => l.some((c) => c));
  if (inicio < 0) return { nome, cabecalho: [], linhas: [], colunas: 0 };
  const corpo = linhas.slice(inicio + 1).filter((l) => l.some((c) => c));
  let colunas = Math.max(linhas[inicio].length, ...corpo.map((l) => l.length));
  while (colunas > 0 && !linhas[inicio][colunas - 1] && corpo.every((l) => !l[colunas - 1])) colunas--;
  const ajustar = (l: string[]) => Array.from({ length: colunas }, (_, i) => l[i] ?? "");
  return { nome, cabecalho: ajustar(linhas[inicio]).map((t, i) => t || `Coluna ${i + 1}`), linhas: corpo.map(ajustar), colunas };
}

export async function lerPlanilha(arquivo: File): Promise<AbaDaPlanilha[]> {
  if (arquivo.size > TAMANHO_MAXIMO_DA_PLANILHA) throw new ErroDaPlanilha("Arquivo grande demais (máx. 10 MB). Divida a planilha.");
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  const bytes = await arquivo.arrayBuffer();
  let abas: AbaDaPlanilha[];
  if (ext === "csv" || ext === "txt") {
    abas = [montarAba("CSV", lerCsv(decodificar(bytes)))];
  } else if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    let livro;
    try {
      livro = XLSX.read(bytes, { type: "array" });
    } catch {
      throw new ErroDaPlanilha("Não consegui abrir este arquivo como planilha. Salve como .xlsx ou .csv e tente de novo.");
    }
    abas = livro.SheetNames.map((n) => montarAba(n, XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets[n], { header: 1, raw: true, defval: "", blankrows: false })));
  } else {
    throw new ErroDaPlanilha("Use uma planilha .xlsx ou .csv.");
  }
  const comDados = abas.filter((a) => a.cabecalho.length > 0);
  if (comDados.length === 0) throw new ErroDaPlanilha("A planilha está vazia.");
  for (const a of comDados) {
    if (a.colunas > IMPORTACAO_MAX_COLUNAS) throw new ErroDaPlanilha(`A aba "${a.nome}" tem ${a.colunas} colunas — o máximo é ${IMPORTACAO_MAX_COLUNAS}.`);
    if (a.linhas.length > IMPORTACAO_MAX_LINHAS) throw new ErroDaPlanilha(`A aba "${a.nome}" tem ${a.linhas.length} linhas — o máximo é ${IMPORTACAO_MAX_LINHAS}. Divida a planilha.`);
  }
  return comDados;
}

/** Modelo para o DP baixar (CSV com ";", abre direto no Excel). */
export function baixarModelo(): void {
  const cab = ["CNPJ", "Razão social", "Nome fantasia", "Tipo", "Início da vigência", "Fim da vigência", "CPF do colaborador", "Nome do colaborador", "Observação"];
  const ex1 = ["12.345.678/0001-95", "Exemplo Montagens Ltda", "Exemplo", "Empreiteira", "01/01/2026", "31/12/2026", "", "Nome Do Colaborador", ""];
  const ex2 = ["12.345.678/0001-95", "Exemplo Montagens Ltda", "Exemplo", "Empreiteira", "01/01/2026", "31/12/2026", "000.000.000-00", "", "uma linha por colaborador atendido"];
  const csv = "﻿" + [cab, ex1, ex2].map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-contratos.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
