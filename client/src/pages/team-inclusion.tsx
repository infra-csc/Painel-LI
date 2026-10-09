/**
 * Inclusão de equipe — montar as vagas de um evento e acompanhar cada uma.
 *
 * 07/10 (redesenho): a MESMA casca de Eventos/Passagens/Hospedagem — barra da
 * tela de 56px grudada no topo (título, o recorte por extenso e "Novo
 * evento"), conteúdo em até 1560px. Duas seções com papéis claros:
 *  1. "Montar vagas" — evento + período numa fileira só e, gerada a grade,
 *     a grade função × dia, a prévia e "Criar N vagas" (a ação principal);
 *  2. "Vagas incluídas" — resumo, filtros e a lista.
 * Quem só consulta (Financeiro) vê só a lista — a grade sem permissão era um
 * cartão dizendo "você não tem permissão". Sem acesso: o estado de acesso
 * negado da família.
 */
import GridTeamInclusionForm from "@/components/forms/grid-team-inclusion-form";
import TeamInclusionTable, { EsqueletoDasVagas } from "@/components/tables/team-inclusion-table";
import { useTeamInclusionData } from "@/components/tables/team-inclusion/use-team-inclusion-data";
import EventModal from "@/components/modals/event-modal";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { useState, useEffect, type ReactNode } from "react";
import { Lock, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";

function AcessoNegado() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-card px-8 py-12 text-center" data-testid="acesso-negado-inclusao">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Lock className="w-5 h-5" />
      </div>
      <h2 className="m-0 mt-3.5 text-base font-semibold text-foreground">Acesso negado</h2>
      <p className="mx-auto mt-1.5 mb-0 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
        Você não tem permissão para acessar esta tela. Se precisa dela para trabalhar, peça acesso ao administrador do painel.
      </p>
    </div>
  );
}

export default function TeamInclusion() {
  const { user } = useAuth();
  const [showEventModal, setShowEventModal] = useState(false);
  const [tableReady, setTableReady] = useState(false);
  const podeAcessar = hasPermission(user, "canAccessScreen1");
  const podeEditar = hasPermission(user, "canEditScreen1");

  usePageTitle("Inclusão de equipe");

  // Adia a montagem da tabela pesada para a página aparecer imediatamente
  useEffect(() => {
    const id = setTimeout(() => setTableReady(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Prefetch antecipado das queries mais pesadas para que já estejam em voo
  // quando os componentes filhos montarem (não bloqueia a renderização).
  // staleTime alinhado ao padrão global (60s) para não servir dados velhos.
  // As vagas NÃO entram mais aqui (24/09): a lista exige recorte por evento
  // (`?eventId=`) e é a tabela, que conhece o evento escolhido, quem a pede.
  const PREFETCH_STALE = 60_000;
  useQuery({ queryKey: ["/api/events"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/collaborators"], staleTime: PREFETCH_STALE });
  useQuery({ queryKey: ["/api/functions"], staleTime: PREFETCH_STALE });

  // Os dados da lista moram aqui (07/10) para a barra da tela dizer o recorte.
  const data = useTeamInclusionData({ enabled: podeAcessar });

  // Check if user can access this screen
  // Espelha GET /api/team-inclusions (admin, production, purchasing, financial; function_area não entra).
  if (!podeAcessar) {
    return (
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        <PageHeader variant="bar" title="Inclusão de equipe" className="mx-0 mt-0" />
        <div className="px-[var(--page-gutter)] pt-5 pb-6"><AcessoNegado /></div>
      </div>
    );
  }

  // ── Barra da tela: o recorte por extenso ──
  const n = data.filteredAndSortedInclusions.length;
  const total = data.teamInclusions?.length ?? 0;
  const subtitulo: ReactNode = data.isLoading ? "Carregando…" : data.isError ? null : total === 0 ? "Nenhuma vaga incluída ainda" : (
    <span data-testid="resumo-do-recorte">
      {n} {n === 1 ? "vaga" : "vagas"}{data.eventosNoRecorte > 0 && <> em {data.eventosNoRecorte} {data.eventosNoRecorte === 1 ? "evento" : "eventos"}</>}
      {/* Sem colaborador: só sem recorte de status/escalação (senão a conta não é a da lista). */}
      {data.totals.pendentes > 0 && data.filters.status.length === 0 && data.filters.escalationStatus.length === 0 && <> · <span className="text-warning font-medium">{data.totals.pendentes} sem colaborador</span></>}
    </span>
  );

  // "Novo evento": secundário aqui — a ação principal da tela é criar vagas.
  const botaoNovoEvento = podeEditar ? (
    <button
      type="button"
      onClick={() => setShowEventModal(true)}
      className="pas-alvo inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="button-create-event"
    >
      <Plus className="h-4 w-4 text-primary" strokeWidth={2.5} aria-hidden="true" />
      Novo evento
    </button>
  ) : undefined;

  return (
    <>
      {/* Margens pela variável do layout: a barra sangra até as bordas da
          página e o conteúdo fica em até 1560px — a casca de Passagens. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
        <PageHeader variant="bar" title="Inclusão de equipe" subtitle={subtitulo} className="mx-0 mt-0" actions={botaoNovoEvento} />
        <div className="px-[var(--page-gutter)] pt-5 pb-6">
          <div className="flex flex-col gap-7 max-w-[1560px] mx-auto">
            {/* Quem só consulta não monta grade: a seção inteira some. */}
            {podeEditar && <GridTeamInclusionForm />}
            {tableReady ? (
              <TeamInclusionTable data={data} />
            ) : (
              <section aria-label="Vagas incluídas" className="flex flex-col gap-3">
                <h2 className="m-0 text-[15px] font-semibold text-foreground min-h-[34px] flex items-center">Vagas incluídas</h2>
                <EsqueletoDasVagas />
              </section>
            )}
          </div>
        </div>
      </div>

      {/* "Novo evento": mesmo modal da tela Eventos (empresa pagadora, CNPJ,
          validações e invalidação de cache idênticos — nada de formulário paralelo). */}
      <EventModal open={showEventModal} onClose={() => setShowEventModal(false)} />
    </>
  );
}
