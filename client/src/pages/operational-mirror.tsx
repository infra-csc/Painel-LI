/**
 * Espelho operacional — a página (25/09).
 *
 * Só orquestra: dados (`useMirrorData`), mutações (`useMirrorMutations`),
 * filtros/preferências (`useMirrorFilters`) e as visões em
 * components/operational-mirror/*. Tinha 2.900 linhas com 35 componentes inline.
 */
import { useState } from "react";
import { usePageTitle } from "@/components/common/use-page-title";
import { useEventoEmFoco } from "@/lib/use-evento-em-foco";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { hasRoleIn, ROLE_GROUPS } from "@shared/roles";
import type { MirrorRow } from "@shared/operational-mirror-types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, AlertTriangle, LayoutGrid, FilterX, Eraser, Lock } from "lucide-react";
import { EditDrawer, type DrawerKind, type DrawerSource } from "@/components/operational-mirror/drawers";
import { ProvedorDeAvisos, useAvisos } from "@/components/operational-mirror/avisos";
import { useMirrorData } from "@/components/operational-mirror/use-mirror-data";
import { useMirrorMutations } from "@/components/operational-mirror/use-mirror-mutations";
import { useMirrorFilters } from "@/components/operational-mirror/use-mirror-filters";
import { MirrorHeader } from "@/components/operational-mirror/mirror-header";
import { MirrorToolbar } from "@/components/operational-mirror/mirror-toolbar";
import { FaixaDePendencias, PlacarDeBlocos } from "@/components/operational-mirror/mirror-pendencias";
import { GradeView } from "@/components/operational-mirror/grade-view";
import { ColaboradoresView } from "@/components/operational-mirror/colaboradores-view";
import { DepartamentosView } from "@/components/operational-mirror/departamentos-view";
import { QuartosView } from "@/components/operational-mirror/quartos-view";
import { UberView } from "@/components/operational-mirror/uber-view";
import { RateioView } from "@/components/operational-mirror/rateio-view";
import type { OpenDrawer } from "@/components/operational-mirror/mirror-shared";

export default function OperationalMirror() {
  usePageTitle("Espelho operacional");
  // O provedor precisa envolver a tela para que qualquer parte dela avise.
  return (
    <ProvedorDeAvisos>
      <EspelhoOperacional />
    </ProvedorDeAvisos>
  );
}

/**
 * Confirmação para o que não tem volta (31/08). Duas ações sobrescreviam
 * trabalho sem perguntar: "Sugestões" refaz agrupamentos e horários por cima
 * de ajustes feitos à mão, e "Separar" muda o custo de hotelaria do evento.
 * O texto diz a CONSEQUÊNCIA — repetir a pergunta no corpo não ajuda a
 * decidir.
 */
type Confirmacao = { titulo: string; texto: string; rotulo: string; destrutivo?: boolean; acao: () => void };

function EspelhoOperacional() {
  const { avisar } = useAvisos();
  const { user } = useAuth();
  // Evento em foco (23/09): `?eventId=` continua sendo o nome do parâmetro (links do
  // modal de evento e da Escala já o usam); a memória por usuário é a mesma do
  // Financeiro e da Escala — abrir o Espelho depois do Planejado já vem no evento.
  const { eventId, setEventId, sanitize: sanearEventoEmFoco } = useEventoEmFoco({ parametro: "eventId" });

  // Espelha requireRoles(LOGISTICA_ROLES) das rotas PATCH/POST do espelho em
  // server/routes.ts — quem não está no grupo só consulta.
  const canEditMirror = hasRoleIn(user?.role, ROLE_GROUPS.logistica);
  const [editModeWanted, setEditModeWanted] = useState(true);
  const editMode = canEditMirror && editModeWanted;

  const dados = useMirrorData(eventId, sanearEventoEmFoco);
  const { events, mirrorKey, data, isLoading, loadErrorMessage, totals, ev, rows, departments, hotels, confirmados, pendenciaDe, resumo, collabById, derivedHotelCount } = dados;
  const m = useMirrorMutations(eventId, mirrorKey);
  const filtros = useMirrorFilters(eventId, rows, pendenciaDe);
  const { view, setView, compact, chip, setChip, blocoFiltro, setBlocoFiltro, sort, toggleSort, hiddenBlocks, collapsedDepts, setCollapsedDepts, estreito, filteredRows, clearFilters, filtrosAtivos, emptyMessage } = filtros;

  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [drawer, setDrawer] = useState<{ kind: DrawerKind | null; rowId: string | null; name?: string; source: DrawerSource }>({ kind: null, rowId: null, source: null });

  const openDrawer: OpenDrawer = (kind, r: MirrorRow) => {
    if (!canEditMirror) return; // somente leitura: sem drawer de edição
    const source: DrawerSource = kind === "ticket" ? r.ticket : kind === "accommodation" ? r.accommodation : r;
    setDrawer({ kind, rowId: r.teamInclusionId, name: r.collaborator.fullName, source });
  };

  function handleExport() { if (eventId) window.open(`/api/events/${eventId}/operational-mirror/export`, "_blank"); }

  const pedirRecalculo = () => setConfirmar({
    titulo: "Refazer as sugestões deste evento?",
    texto: "Os agrupamentos e horários voltam a ser calculados a partir dos voos. Quartos e carros já confirmados são preservados — o resto é sobrescrito, inclusive ajustes feitos à mão.",
    rotulo: "Refazer sugestões",
    acao: () => m.recalc.mutate(),
  });
  const pedirSeparacao = (id: string) => setConfirmar({
    titulo: "Separar em quartos individuais?",
    texto: "Cada ocupante passa a ter um quarto próprio. O custo de hotelaria do evento sobe — a diária individual é maior que a compartilhada.",
    rotulo: "Separar",
    acao: () => m.separarQuarto.mutate(id),
  });
  const aoImportar = (gravados: number, falhas: number) => {
    m.invalidate();
    avisar({
      tom: falhas > 0 ? "erro" : "ok",
      titulo: `${gravados} ${gravados === 1 ? "campo atualizado" : "campos atualizados"} pela planilha`,
      texto: falhas > 0
        ? `${falhas} ${falhas === 1 ? "campo não pôde ser gravado" : "campos não puderam ser gravados"} — confira a grade.`
        : undefined,
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-5 max-w-[1600px] mx-auto" data-testid="page-operational-mirror">
        <MirrorHeader
          events={events} eventId={eventId} setEventId={setEventId} ev={ev} totalPessoas={rows.length}
          canEditMirror={canEditMirror} editModeWanted={editModeWanted} setEditModeWanted={setEditModeWanted}
          recalcPending={m.recalc.isPending} onRecalc={pedirRecalculo} onExport={handleExport} onImportado={aoImportar}
        />

        {!eventId && (
          <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center" data-testid="mirror-empty-no-event">
            <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-background border">
              <LayoutGrid className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-medium">Escolha um evento para começar</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              O espelho reúne, num lugar só, tudo o que a logística precisa acompanhar por colaborador —
              custos, reservas, pendências e as sugestões de quarto e Uber.
            </p>
          </div>
        )}

        {eventId && isLoading && (
          <div className="space-y-4" data-testid="mirror-loading" aria-busy="true" aria-live="polite">
            <div className="h-[76px] rounded-xl border bg-muted/30 animate-pulse motion-reduce:animate-none" />
            <div className="h-9 w-full max-w-md rounded-lg bg-muted/40 animate-pulse motion-reduce:animate-none" />
            <div className="rounded-lg border overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 border-b last:border-0 bg-muted/20 animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
            <span className="sr-only">Carregando o espelho operacional…</span>
          </div>
        )}

        {eventId && !isLoading && loadErrorMessage && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center" role="alert" data-testid="mirror-error">
            <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="font-medium">Não foi possível carregar o espelho</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{loadErrorMessage} Nada do que você preencheu foi perdido.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => m.invalidate()}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" /> Tentar de novo
            </Button>
          </div>
        )}

        {eventId && !isLoading && !loadErrorMessage && data && ev && totals && (
          <>
            <FaixaDePendencias resumo={resumo} totalPessoas={rows.length} chip={chip} setChip={setChip} />
            <PlacarDeBlocos resumo={resumo} totals={totals} blocoFiltro={blocoFiltro} setBlocoFiltro={setBlocoFiltro} derivedHotelCount={derivedHotelCount} />

            <MirrorToolbar
              filtros={filtros} resumo={resumo} totalPessoas={rows.length} departments={departments} hotels={hotels}
              roomGroupsCount={data.roomGroups.length} uberGroupsCount={data.uberGroups.length}
            />

            {!canEditMirror && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="mirror-readonly-hint">
                <Lock className="h-3 w-3" aria-hidden="true" /> Você está consultando o espelho em modo somente leitura — alterações e recálculo de sugestões são feitos por Admin, Compras ou Produção.
              </p>
            )}

            {/* ===== VIEWS ===== */}
            {/* Lista vazia POR FILTRO é outra coisa de lista vazia por não
                haver ninguém escalado — e é a mais frequente das duas. Dizer o
                que está filtrando é o que dá o caminho de volta. */}
            {filteredRows.length === 0 && rows.length > 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/10 px-6 py-14 text-center" data-testid="mirror-sem-resultados">
                <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-background">
                  <FilterX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </span>
                <p className="font-medium">Nenhuma pessoa com esses filtros</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "pessoa está escalada" : "pessoas estão escaladas"} neste evento, mas nenhuma passa por{" "}
                  {filtrosAtivos.length ? <span className="text-foreground">{filtrosAtivos.join(" · ")}</span> : "os filtros atuais"}.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  <Eraser className="h-4 w-4 mr-2" aria-hidden="true" /> Limpar filtros
                </Button>
              </div>
            ) : (
            <>
            {/* A grade de 39 colunas não existe no estreito: abaixo de 900px
                a visão Pessoas assume, com os mesmos dados e sem rolagem
                horizontal. O seletor continua mostrando "Grade" como ativa —
                é a mesma informação, noutra forma. */}
            {view === "grade" && estreito && <ColaboradoresView rows={filteredRows} openDrawer={openDrawer} canEdit={canEditMirror} emptyMessage={emptyMessage} pendenciaDe={pendenciaDe} totalDoEvento={rows.length} />}
            {view === "grade" && !estreito && <GradeView rows={filteredRows} hiddenBlocks={hiddenBlocks} compact={compact} saveCell={m.saveCell} openDrawer={openDrawer} sort={sort} onSort={toggleSort} editMode={editMode} canEdit={canEditMirror} emptyMessage={emptyMessage} confirmados={confirmados} pendenciaDe={pendenciaDe} irParaVisao={setView} totalDoEvento={rows.length} />}
            {view === "colaboradores" && <ColaboradoresView rows={filteredRows} openDrawer={openDrawer} canEdit={canEditMirror} emptyMessage={emptyMessage} pendenciaDe={pendenciaDe} totalDoEvento={rows.length} />}
            {view === "departamentos" && <DepartamentosView rows={filteredRows} totals={totals} collapsed={collapsedDepts} setCollapsed={setCollapsedDepts} openDrawer={openDrawer} canEdit={canEditMirror} emptyMessage={emptyMessage} pendenciaDe={pendenciaDe} verNaGrade={(dep) => { filtros.setDeptFilter(dep); setView("grade"); }} />}
            {view === "quartos" && <QuartosView groups={data.roomGroups} collabById={collabById} rows={rows}
              onMover={(c, de, para) => m.mover.mutate({ tipo: "quarto", corpo: { collaboratorId: c, deGrupoId: de, paraGrupoId: para } })}
              onSeparar={pedirSeparacao} canEdit={canEditMirror}
              onPatch={(id, campos) => m.patchRoom.mutate({ id, campos })}
              onPatchMembro={(membroId, campos) => m.patchMembroQuarto.mutate({ id: membroId, campos })}
              onConfirm={(id: string) => m.confirmRoom.mutate(id)} pendingId={m.confirmRoom.isPending ? m.confirmRoom.variables : null} />}
            {view === "uber" && <UberView groups={data.uberGroups} collabById={collabById} rows={rows}
              onMover={(c, de, para) => m.mover.mutate({ tipo: "uber", corpo: { collaboratorId: c, deGrupoId: de, paraGrupoId: para } })}
              onSkipUber={(rowId, skip) => m.skipUber.mutate({ id: rowId, skip })} canEdit={canEditMirror}
              onPatch={(id, campos) => {
                // "__reabrir" não é campo do grupo: é o pedido de destravar, que
                // tem endpoint próprio (confirmar e reabrir não são um PATCH).
                if (campos.__reabrir) { m.reabrirUber.mutate(id); return; }
                m.patchUber.mutate({ id, campos });
              }}
              onConfirm={(id: string) => m.confirmUber.mutate(id)} pendingId={m.confirmUber.isPending ? m.confirmUber.variables : null} />}
            {view === "rateio" && <RateioView totals={totals} hotelDerived={derivedHotelCount > 0} />}
            </>
            )}
          </>
        )}

        <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
          <AlertDialogContent className="max-w-[460px]">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmar?.titulo}</AlertDialogTitle>
              <AlertDialogDescription>{confirmar?.texto}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className={confirmar?.destrutivo ? "bg-danger hover:bg-danger/90" : undefined}
                onClick={(e) => { e.preventDefault(); confirmar?.acao(); setConfirmar(null); }}
              >
                {confirmar?.rotulo}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <EditDrawer open={!!drawer.kind} onOpenChange={(o) => !o && setDrawer({ kind: null, rowId: null, source: null })}
          kind={drawer.kind} rowId={drawer.rowId} rowName={drawer.name} source={drawer.source} onSaveMany={m.saveMany} />
      </div>
    </TooltipProvider>
  );
}
