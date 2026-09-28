/**
 * Exportar na Escalação (25/09 — extraído de pages/scaling.tsx): o diálogo de
 * colunas (Excel/PDF) da Fila e o relatório de cobertura das Análises, com as
 * travas de permissão e de lista vazia.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TeamInclusion, Comment } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import type { useToast } from "@/hooks/use-toast";
import type { ScalingData, InclusionDetails } from "../use-scaling-data";
import { exportScalingPdf, exportScalingXlsxColunas } from "../export-scaling-xlsx";
import type { ExportScope } from "../export-columns-dialog";
import type { ScalingAba } from "./use-scaling-filters";

type Toast = ReturnType<typeof useToast>["toast"];

export function useScalingExport({ aba, canExport, visibleRows, data, details, toast }: {
  aba: ScalingAba; canExport: boolean; visibleRows: TeamInclusion[]; data: ScalingData; details: InclusionDetails; toast: Toast;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** "O que falta escalar" — a exportação própria da aba Análises. */
  const [coberturaOpen, setCoberturaOpen] = useState(false);

  // Comentários de TODAS as inclusões — só sob demanda (Exportar)
  const { refetch: refetchAllComments } = useQuery<Comment[]>({
    queryKey: ["/api/all-comments"],
    queryFn: async () => (await apiRequest("GET", "/api/all-comments")).json(),
    enabled: false,
  });

  const quantasLinhas = visibleRows.filter(i => i.status !== "cancelado" && !i.deletedAt).length;

  const abrirExportar = () => {
    // Nas Análises o botão exporta a COBERTURA — "o que falta escalar", por
    // evento e função. É o relatório que se manda para quem escala, e não a
    // planilha de colunas da fila. Um botão só, o que muda é a aba.
    if (aba === "analises") { setCoberturaOpen(true); return; }
    if (!canExport) {
      toast({ title: "Sem permissão", description: "Somente administradores, Compras e RH/Financeiro podem exportar.", variant: "destructive" });
      return;
    }
    if (quantasLinhas === 0) {
      toast({ title: "Nada para exportar", description: "Não há escalações ativas na lista atual.", variant: "destructive" });
      return;
    }
    setExportOpen(true);
  };

  const handleExportToExcel = async (colunas?: string[], formato: "xlsx" | "pdf" = "xlsx", scope: ExportScope = "todas") => {
    // A planilha inclui CPF/telefone/nascimento — a trava fica aqui também
    if (!canExport) {
      toast({ title: "Sem permissão", description: "Somente administradores, Compras e RH/Financeiro podem exportar a planilha.", variant: "destructive" });
      return;
    }
    if (visibleRows.length === 0) {
      toast({ title: "Nada para exportar", description: "Não há escalações no recorte atual.", variant: "destructive" });
      return;
    }
    const noScope = (i: TeamInclusion) =>
      scope === "transporte" ? !!i.needsTicket
      : scope === "hospedagem" ? !!i.needsAccommodation
      : scope === "sem-passagem" ? !i.needsTicket
      : true;
    const activeInclusions = visibleRows.filter(i => i.status !== "cancelado" && !i.deletedAt && noScope(i));
    if (activeInclusions.length === 0) {
      toast({
        title: "Nada nesse recorte",
        description: scope === "todas"
          ? "Não há escalações ativas para exportar."
          : "Nenhuma escalação ativa se encaixa no recorte escolhido — troque em “Quais linhas”.",
        variant: "destructive",
      });
      return;
    }
    const [{ data: freshComments, isError: commentsFailed }, { data: freshUsers }] = await Promise.all([
      refetchAllComments(),
      details.refetchUsers(),
    ]);
    if (commentsFailed) {
      toast({
        title: "Comentários indisponíveis",
        description: "Não foi possível carregar os comentários; a planilha será gerada sem essa coluna preenchida.",
        variant: "destructive",
      });
    }
    const entrada = {
      inclusions: activeInclusions,
      eventById: data.eventById,
      functionById: data.functionById,
      collaboratorById: data.collaboratorById,
      ticketByInclusion: data.ticketByInclusion,
      purchasedTicketByInclusion: data.purchasedTicketByInclusion,
      comments: freshComments || [],
      users: freshUsers || [],
    };
    if (formato === "pdf") {
      const { rowCount, opened } = exportScalingPdf(entrada, colunas);
      if (!opened) {
        toast({
          title: "O navegador bloqueou a janela",
          description: "Libere pop-ups para este site e tente de novo — o PDF sai pela janela de impressão.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "PDF pronto para salvar", description: `${rowCount} escalação(ões) na janela de impressão — escolha “Salvar como PDF”.` });
      return;
    }
    const { fileName, rowCount } = await exportScalingXlsxColunas(entrada, colunas);
    toast({ variant: "success", title: "Exportação concluída", description: `Arquivo ${fileName} com ${rowCount} escalações ativas.` });
  };

  const onExport = async (colunas: string[], formato: "xlsx" | "pdf", scope: ExportScope) => {
    setExporting(true);
    try { await handleExportToExcel(colunas, formato, scope); setExportOpen(false); }
    finally { setExporting(false); }
  };

  return { exportOpen, setExportOpen, exporting, coberturaOpen, setCoberturaOpen, quantasLinhas, abrirExportar, onExport };
}
