/**
 * Exportação XLSX das escalações (planilha "Escalações").
 * Função pura: recebe as listas/índices já carregados e devolve o nome do
 * arquivo gerado. As larguras (`!cols`) são geradas a partir das chaves da
 * primeira linha — não há mais um array paralelo de 47 posições para manter.
 */
// xlsx só carrega quando alguém clica em exportar (auditoria 28/08): a
// biblioteca sozinha pesava ~1/3 do chunk da Escalação no primeiro load.
import { ALL_EXPORT_COLUMNS } from "./export-columns";
import { fixEncoding } from "@/lib/utils";
import type { TeamInclusion, Event, Function, Collaborator, Comment, Ticket } from "@shared/schema";
import { formatDate, isEscalated } from "./scaling-utils";

const TRANSPORT_LABEL: Record<string, string> = { aereo: "Aéreo", rodoviario: "Rodoviário", van: "Van" };

// Largura por coluna (wch). Colunas fora do mapa usam DEFAULT_WIDTH.
const COLUMN_WIDTHS: Record<string, number> = {
  "ID": 10, "Evento": 30, "Local do Evento": 25, "Início do Evento": 15, "Fim do Evento": 15,
  "Função": 25, "Área": 20, "Colaborador": 30, "Tipo": 12, "CPF Colaborador": 18,
  "Data Nascimento": 15, "Telefone Colaborador": 15, "Cidade Colaborador": 20,
  "Precisa Passagem": 15, "Tipo de Transporte": 16, "Passagem LOC": 15,
  "Ida - Cidade Origem": 20, "Ida - Cidade Destino": 20, "Ida - Data": 15, "Ida - Horário": 12,
  "Volta - Cidade Origem": 20, "Volta - Cidade Destino": 20, "Volta - Data": 15, "Volta - Horário": 12,
  "Diárias Reais": 15, "Status": 15, "Fase Atual": 15, "Registro Emergencial": 20,
  "Observações": 40, "Observações Reais": 40, "Comentários": 60,
};
const DEFAULT_WIDTH = 18;

export interface ExportScalingInput {
  inclusions: TeamInclusion[];
  eventById: Map<string, Event>;
  functionById: Map<string, Function>;
  collaboratorById: Map<string, Collaborator>;
  ticketByInclusion: Map<string, Ticket>;
  purchasedTicketByInclusion: Map<string, Ticket>;
  comments: Comment[];
  users: { id: string; name?: string }[];
}

export interface ExportScalingResult {
  fileName: string;
  rowCount: number;
}

/** Monta as linhas (exportado para teste/inspeção). */
export function buildScalingExportRows(input: ExportScalingInput): Record<string, string | number>[] {
  const { inclusions, eventById, functionById, collaboratorById, ticketByInclusion, purchasedTicketByInclusion, comments, users } = input;

  const commentsByInclusion = new Map<string, Comment[]>();
  comments.forEach(c => {
    if (!c.teamInclusionId) return;
    const list = commentsByInclusion.get(c.teamInclusionId);
    if (list) list.push(c); else commentsByInclusion.set(c.teamInclusionId, [c]);
  });
  const userById = new Map<string, { id: string; name?: string }>();
  users.forEach(u => { if (u?.id && !userById.has(u.id)) userById.set(u.id, u); });

  return inclusions.map(inclusion => {
    const event = eventById.get(inclusion.eventId);
    const func = functionById.get(inclusion.functionId);
    const collaborator = inclusion.collaboratorId ? collaboratorById.get(inclusion.collaboratorId) : undefined;

    const confirmationStatus = inclusion.status === "cancelado" ? "Cancelado" : isEscalated(inclusion) ? "Confirmado" : "Pendente";

    // valor da diária em centavos / 100 * quantidade
    const dailyValueInReais = (inclusion.dailyValue || 0) / 100;
    const totalValue = dailyValueInReais * (inclusion.dailyRates || 0);

    const inclusionComments = commentsByInclusion.get(inclusion.id) || [];
    const commentsText = inclusionComments.length > 0
      ? inclusionComments.map(c => {
          const userName = userById.get(c.userId)?.name || "Usuário";
          const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "";
          return `[${date} - ${userName}] ${c.content}`;
        }).join(" | ")
      : "N/A";

    // Informações de viagem do campo observações (dados antigos)
    let dataVooIda = inclusion.flightDepartureDate ? formatDate(inclusion.flightDepartureDate) : "N/A";
    let horarioSugeridoIda = inclusion.flightArrivalSuggestedTime || "N/A";
    let dataVooVolta = inclusion.flightReturnDate ? formatDate(inclusion.flightReturnDate) : "N/A";
    let horarioSugeridoVolta = inclusion.flightReturnSuggestedTime || "N/A";
    let observacoesLimpas = inclusion.observations || "";
    if (observacoesLimpas && observacoesLimpas.includes("Ida:") && observacoesLimpas.includes("Chegada:")) {
      const idaMatch = observacoesLimpas.match(/Ida:\s*([^|]+)/);
      const chegadaMatch = observacoesLimpas.match(/Chegada:\s*([^|]+)/);
      const retornoMatch = observacoesLimpas.match(/Retorno:\s*([^|]+)/);
      const horarioMatch = observacoesLimpas.match(/Horário:\s*([^|]+)/);
      if (idaMatch && idaMatch[1].trim()) dataVooIda = idaMatch[1].trim();
      if (chegadaMatch && chegadaMatch[1].trim()) horarioSugeridoIda = chegadaMatch[1].trim();
      if (retornoMatch && retornoMatch[1].trim()) dataVooVolta = retornoMatch[1].trim();
      if (horarioMatch && horarioMatch[1].trim()) horarioSugeridoVolta = horarioMatch[1].trim();
      observacoesLimpas = "";
    }

    let cpfColaborador = "N/A";
    if (collaborator) {
      if (collaborator.documentType === "cpf") cpfColaborador = collaborator.officialDocument;
      else if (collaborator.secondaryDocumentType === "cpf") cpfColaborador = collaborator.secondaryDocument || "N/A";
    }

    // Dados reais da passagem — prioriza a passagem já comprada
    const ticket = purchasedTicketByInclusion.get(inclusion.id) || ticketByInclusion.get(inclusion.id);
    const ticketAny = ticket as any;

    return {
      "ID": `#${inclusion.inclusionNumber || "N/A"}`,
      "Evento": event?.name || "N/A",
      "Local do Evento": event?.location || "N/A",
      "Início do Evento": event?.startDate ? formatDate(event.startDate) : "N/A",
      "Fim do Evento": event?.endDate ? formatDate(event.endDate) : "N/A",
      "Função": func?.name || "N/A",
      "Área": inclusion.area || "N/A",
      "Colaborador": fixEncoding(collaborator?.fullName) || "Não escalado",
      "Tipo": collaborator?.type ? (collaborator.type === "local" ? "CASA" : collaborator.type.toUpperCase()) : "N/A",
      "CPF Colaborador": cpfColaborador,
      "Data Nascimento": collaborator?.birthDate ? formatDate(collaborator.birthDate) : "N/A",
      "Telefone Colaborador": collaborator?.phone || "N/A",
      "Cidade Colaborador": collaborator?.city || "N/A",
      "Sai de": inclusion.city || "N/A",
      "Período Agendado - Início": inclusion.scheduleStartDate ? formatDate(inclusion.scheduleStartDate) : "N/A",
      "Período Agendado - Fim": inclusion.scheduleEndDate ? formatDate(inclusion.scheduleEndDate) : "N/A",
      "Período Real - Início": inclusion.actualStartDate ? formatDate(inclusion.actualStartDate) : "N/A",
      "Período Real - Fim": inclusion.actualEndDate ? formatDate(inclusion.actualEndDate) : "N/A",
      "Precisa Passagem": inclusion.needsTicket ? "Sim" : "Não",
      "Tipo de Transporte": ticket?.transportType ? (TRANSPORT_LABEL[ticket.transportType] || ticket.transportType) : "N/A",
      "Passagem LOC": ticket?.purchaseOrderNumber || "N/A",
      "Passagem Data Compra": ticket?.purchaseDate ? formatDate(ticket.purchaseDate) : "N/A",
      "Passagem Valor (R$)": ticket?.value ? (ticket.value / 100).toFixed(2) : "N/A",
      "Ida - Cidade Origem": ticket?.departureCityOrigin || "N/A",
      "Ida - Aeroporto Origem": ticket?.departureAirport || "N/A",
      "Ida - Cidade Destino": ticket?.departureCityDestination || "N/A",
      "Ida - Aeroporto Destino": ticket?.destinationAirport || "N/A",
      "Ida - Data": ticket?.actualDepartureDate ? formatDate(ticket.actualDepartureDate) : dataVooIda,
      "Ida - Horário": ticket?.actualDepartureTime || horarioSugeridoIda,
      "Horário Sugerido Ida": horarioSugeridoIda,
      "Volta - Cidade Origem": ticket?.returnCityOrigin || "N/A",
      "Volta - Aeroporto Origem": ticketAny?.returnOriginAirport || "N/A",
      "Volta - Cidade Destino": ticket?.returnCityDestination || "N/A",
      "Volta - Aeroporto Destino": ticketAny?.returnDestinationAirport || "N/A",
      "Volta - Data": ticket?.actualReturnDate ? formatDate(ticket.actualReturnDate) : dataVooVolta,
      "Volta - Horário": ticket?.actualReturnTime || horarioSugeridoVolta,
      "Horário Sugerido Volta": horarioSugeridoVolta,
      "Precisa Hospedagem": inclusion.needsAccommodation ? "Sim" : "Não",
      "Diárias Planejadas": inclusion.dailyRates ?? 0,
      "Diárias Reais": inclusion.actualDailyRates ?? "N/A",
      "Valor da Diária (R$)": dailyValueInReais.toFixed(2),
      "Valor Total (R$)": totalValue.toFixed(2),
      "Status": confirmationStatus,
      "Fase Atual": inclusion.phase || "N/A",
      "Registro Emergencial": inclusion.emergencyRecord ? "Sim" : "Não",
      "Observações": observacoesLimpas,
      "Observações Reais": inclusion.actualObservations || "",
      "Comentários": commentsText,
    };
  });
}

/** Gera e baixa o arquivo Escalacoes_DDMMYYYY.xlsx. */
export async function exportScalingXlsx(input: ExportScalingInput): Promise<ExportScalingResult> {
  const XLSX = await import("xlsx");
  const rows = buildScalingExportRows(input);
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws["!cols"] = keys.map(k => ({ wch: COLUMN_WIDTHS[k] ?? DEFAULT_WIDTH }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Escalações");

  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, "0")}${(today.getMonth() + 1).toString().padStart(2, "0")}${today.getFullYear()}`;
  const fileName = `Escalacoes_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, rowCount: rows.length };
}

// ── Escolha de colunas + PDF (regra do dono, 27/08) ──────────────────────────
// O exportar ganhou um modal onde o usuário marca QUAIS colunas saem. A lista
// abaixo é a fonte única: os grupos organizam o modal, e a ordem aqui é a ordem
// no arquivo. Chave = título da coluna em buildScalingExportRows.

// Grupos/colunas moveram para ./export-columns (o modal importa de lá sem
// carregar o xlsx). Reexportados aqui por compatibilidade.
export { EXPORT_COLUMN_GROUPS, ALL_EXPORT_COLUMNS, type ExportColumnGroup } from "./export-columns";

/** Mantém só as colunas escolhidas, na ordem canônica. */
function pickColumns(rows: Record<string, string | number>[], selected?: string[]): Record<string, string | number>[] {
  if (!selected || selected.length === 0) return rows;
  const ordem = ALL_EXPORT_COLUMNS.filter((k) => selected.includes(k));
  return rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const k of ordem) if (k in row) out[k] = row[k];
    return out;
  });
}

/** Gera e baixa o Excel só com as colunas escolhidas. */
export async function exportScalingXlsxColunas(input: ExportScalingInput, selected?: string[]): Promise<ExportScalingResult> {
  const XLSX = await import("xlsx");
  const rows = pickColumns(buildScalingExportRows(input), selected);
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws["!cols"] = keys.map(k => ({ wch: COLUMN_WIDTHS[k] ?? DEFAULT_WIDTH }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Escalações");
  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, "0")}${(today.getMonth() + 1).toString().padStart(2, "0")}${today.getFullYear()}`;
  const fileName = `Escalacoes_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, rowCount: rows.length };
}

const esc = (v: string | number) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * PDF pela janela de impressão do navegador (Destino → "Salvar como PDF").
 *
 * Sem biblioteca de PDF no projeto, o caminho honesto é uma página de impressão
 * bem tipografada: paisagem, cabeçalho repetido a cada página e a fonte
 * encolhendo conforme a quantidade de colunas. Devolve false se o navegador
 * bloquear o pop-up — a tela avisa o usuário.
 */
export function exportScalingPdf(input: ExportScalingInput, selected?: string[]): { rowCount: number; opened: boolean } {
  const rows = pickColumns(buildScalingExportRows(input), selected);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const hoje = new Date().toLocaleDateString("pt-BR");
  const fontePx = keys.length > 24 ? 6.5 : keys.length > 16 ? 7.5 : keys.length > 10 ? 9 : 10.5;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Escalações — ${hoje}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #10182B; margin: 0; }
  h1 { font-size: 14px; margin: 0 0 2px; }
  .sub { font-size: 9px; color: #64748B; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: ${fontePx}px; }
  thead { display: table-header-group; }
  th { background: #EEF2FF; color: #0033CC; text-align: left; padding: 3px 4px;
       border: 0.5px solid #C7D2FE; font-weight: 600; }
  td { padding: 2.5px 4px; border: 0.5px solid #E2E8F0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F8FAFC; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>Escalações</h1>
<p class="sub">${rows.length} linha(s) · ${keys.length} coluna(s) · gerado em ${hoje} · Painel LI</p>
<table><thead><tr>${keys.map(k => `<th>${esc(k)}</th>`).join("")}</tr></thead>
<tbody>${rows.map(r => `<tr>${keys.map(k => `<td>${esc(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>
<script>window.onload = () => { window.focus(); window.print(); };<\/script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return { rowCount: rows.length, opened: false };
  win.document.write(html);
  win.document.close();
  return { rowCount: rows.length, opened: true };
}
