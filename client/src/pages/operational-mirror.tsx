/**
 * Espelho operacional — a página (25/09; redesenho 07/10).
 *
 * Só orquestra: dados (`useMirrorData`), mutações (`useMirrorMutations`),
 * filtros/preferências (`useMirrorFilters`) e as visões em
 * components/operational-mirror/*. Tinha 2.900 linhas com 35 componentes inline.
 *
 * 07/10: a mesma casca de Passagens e Hospedagem — barra de 56px, painel de
 * fechamento num cartão só, barra de trabalho fixa e a visão logo abaixo.
 * Em 1366×768 a grade começava abaixo da dobra; agora as primeiras linhas
 * aparecem sem rolar.
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
import { RefreshCw, AlertTriangle, LayoutGrid, FilterX, Eraser, Lock, Users } from "lucide-react";
import { EditDrawer, type DrawerKind, type DrawerSource } from "@/components/operational-mirror/drawers";
import { ProvedorDeAvisos, useAvisos } from "@/components/operational-mirror/avisos";
import { useMirrorData } from "@/components/operational-mirror/use-mirror-data";
import { useMirrorMutations } from "@/components/operational-mirror/use-mirror-mutations";
import { useMirrorFilters } from "@/components/operational-mirror/use-mirror-filters";
import { MirrorHeader } from "@/components/operational-mirror/mirror-header";
import { MirrorToolbar } from "@/components/operational-mirror/mirror-toolbar";
import { PainelDeFechamento } from "@/components/operational-mirror/mirror-pendencias";
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

/** Cartão de estado (sem evento, erro, sem resultados, vazio): a mesma geometria em todos. */
function CartaoDeEstado({ icone, titulo, texto, acao, testid, tom = "neutro" }: {
  icone: React.ReactNode; titulo: string; texto: React.ReactNode; acao?: React.ReactNode; testid: string; tom?: "neutro" | "erro";
}) {
  return (
    <div className={`pas-entra flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center ${tom === "erro" ? "border-danger/30" : "border-border"}`}
      role={tom === "erro" ? "alert" : undefined} data-testid={testid}>
      <span className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full ${tom === "erro" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
        {icone}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="m-0 mt-1.5 max-w-[460px] text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

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
      {/* A mesma casca de Passagens e Hospedagem: a barra sangra até as bordas
          da página e o conteúdo fica com a margem do layout. */}
      <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]" data-testid="page-operational-mirror">
        <MirrorHeader
          events={events} eventId={eventId} setEventId={setEventId} ev={ev} totalPessoas={rows.length}
          canEditMirror={canEditMirror}
          recalcPending={m.recalc.isPending} onRecalc={pedirRecalculo} onExport={handleExport} onImportado={aoImportar}
        />
        <div className="px-[var(--page-gutter)] pb-6">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4 pt-5">

            {!eventId && (
              <CartaoDeEstado icone={<LayoutGrid className="h-5 w-5" />} testid="mirror-empty-no-event"
                titulo="Escolha um evento para começar"
                texto="O espelho reúne, num lugar só, tudo o que a logística acompanha por pessoa — custos, reservas, pendências e as sugestões de quarto e Uber. Use o seletor na barra acima." />
            )}

            {eventId && isLoading && (
              // Esqueleto com a geometria real: painel de fechamento, barra e as primeiras linhas.
              <div className="flex flex-col gap-4" data-testid="mirror-loading" aria-busy="true" aria-live="polite">
                <span className="sr-only">Carregando o espelho operacional…</span>
                <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-3 border-b border-border px-4 py-3"><div className="pas-osso h-4 w-60" /><div className="pas-osso hidden h-6 w-72 sm:block" /></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className={`space-y-2 px-4 py-3 ${i > 0 ? "border-border lg:border-l" : ""}`}>
                        <div className="pas-osso h-3 w-20" /><div className="pas-osso h-5 w-16" /><div className="pas-osso h-3 w-28" />
                      </div>
                    ))}
                  </div>
                </div>
                <div aria-hidden="true" className="flex gap-2"><div className="pas-osso h-[34px] w-[460px] max-w-full rounded-lg" /><div className="pas-osso ml-auto hidden h-[34px] w-[240px] rounded-lg sm:block" /></div>
                <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="h-[72px] border-b border-border bg-surface-muted" />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-5 border-b border-border/60 px-3 py-3 last:border-0">
                      <div className="pas-osso h-3.5 w-44" /><div className="pas-osso h-3.5 w-24" /><div className="pas-osso h-3.5 w-20" />
                      <div className="pas-osso hidden h-3.5 w-20 md:block" /><div className="pas-osso hidden h-3.5 w-28 lg:block" /><div className="pas-osso hidden h-3.5 w-20 xl:block" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {eventId && !isLoading && loadErrorMessage && (
              <CartaoDeEstado icone={<AlertTriangle className="h-5 w-5" />} testid="mirror-error" tom="erro"
                titulo="Não foi possível carregar o espelho"
                texto={<>{loadErrorMessage} Nada do que você preencheu foi perdido.</>}
                acao={<Button variant="outline" size="sm" onClick={() => m.invalidate()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Tentar de novo</Button>} />
            )}

            {eventId && !isLoading && !loadErrorMessage && data && ev && totals && (
              <>
                <PainelDeFechamento resumo={resumo} totalPessoas={rows.length} chip={chip} setChip={setChip}
                  totals={totals} blocoFiltro={blocoFiltro} setBlocoFiltro={setBlocoFiltro} derivedHotelCount={derivedHotelCount} />

                <div className="flex flex-col gap-3">
                  <MirrorToolbar
                    filtros={filtros} resumo={resumo} totalPessoas={rows.length} departments={departments} hotels={hotels}
                    roomGroupsCount={data.roomGroups.length} uberGroupsCount={data.uberGroups.length}
                    canEdit={canEditMirror} editModeWanted={editModeWanted} setEditModeWanted={setEditModeWanted}
                  />

                  {!canEditMirror && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="mirror-readonly-hint">
                      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" /> Você está consultando em modo somente leitura — alterações e recálculo de sugestões são feitos por Admin, Compras ou Produção.
                    </p>
                  )}

                  {/* ===== VIEWS ===== */}
                  {/* Lista vazia POR FILTRO é outra coisa de lista vazia por não
                      haver ninguém escalado — e é a mais frequente das duas. Dizer o
                      que está filtrando é o que dá o caminho de volta. */}
                  {filteredRows.length === 0 && rows.length > 0 && view !== "quartos" && view !== "uber" && view !== "rateio" ? (
                    <CartaoDeEstado icone={<FilterX className="h-5 w-5" />} testid="mirror-sem-resultados"
                      titulo="Nenhuma pessoa com esses filtros"
                      texto={<>{rows.length} {rows.length === 1 ? "pessoa está escalada" : "pessoas estão escaladas"} neste evento, mas nenhuma passa por{" "}
                        {filtrosAtivos.length ? <span className="font-medium text-foreground">{filtrosAtivos.join(" · ")}</span> : "os filtros atuais"}.</>}
                      acao={<Button variant="outline" size="sm" onClick={clearFilters}><Eraser className="mr-2 h-4 w-4" aria-hidden="true" /> Limpar filtros</Button>} />
                  ) : rows.length === 0 && (view === "grade" || view === "colaboradores" || view === "departamentos") ? (
                    <CartaoDeEstado icone={<Users className="h-5 w-5" />} testid="mirror-evento-vazio"
                      titulo="Ninguém escalado neste evento"
                      texto="Quando a escala do evento tiver pessoas, cada uma vira uma linha aqui — com passagem, hospedagem e extras." />
                  ) : (
                    <div key={view} className="pas-entra">
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
                        onPatch={(id, campos) => {
                          // "Confirmado" clicável pede para reabrir o quarto (07/10): o
                          // quarto não tem rota própria de reabrir — é o PATCH com
                          // confirmed=false. Antes ia "__reabrir" e o servidor ignorava.
                          if (campos.__reabrir) { m.patchRoom.mutate({ id, campos: { confirmed: false } }); return; }
                          m.patchRoom.mutate({ id, campos });
                        }}
                        onPatchMembro={(membroId, campos) => m.patchMembroQuarto.mutate({ id: membroId, campos })}
                        onConfirm={(id: string) => m.confirmRoom.mutate(id)} pendingId={m.confirmRoom.isPending ? m.confirmRoom.variables : null}
                        onRecalc={pedirRecalculo} recalcPending={m.recalc.isPending} />}
                      {view === "uber" && <UberView groups={data.uberGroups} collabById={collabById} rows={rows} evento={data.event}
                        onMover={(c, de, para) => m.mover.mutate({ tipo: "uber", corpo: { collaboratorId: c, deGrupoId: de, paraGrupoId: para } })}
                        onSkipUber={(rowId, skip) => m.skipUber.mutate({ id: rowId, skip })} canEdit={canEditMirror}
                        onPatch={(id, campos) => {
                          // "__reabrir" não é campo do grupo: é o pedido de destravar, que
                          // tem endpoint próprio (confirmar e reabrir não são um PATCH).
                          if (campos.__reabrir) { m.reabrirUber.mutate(id); return; }
                          m.patchUber.mutate({ id, campos });
                        }}
                        onConfirm={(id: string) => m.confirmUber.mutate(id)} pendingId={m.confirmUber.isPending ? m.confirmUber.variables : null}
                        onRecalc={pedirRecalculo} recalcPending={m.recalc.isPending} />}
                      {view === "rateio" && <RateioView totals={totals} hotelDerived={derivedHotelCount > 0} />}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o) setConfirmar(null); }}>
          <AlertDialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-xl p-0">
            <AlertDialogHeader className="space-y-1.5 px-6 pb-4 pt-5 text-left">
              <AlertDialogTitle className="text-base">{confirmar?.titulo}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed">{confirmar?.texto}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 border-t bg-surface-muted px-6 py-3">
              <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className={confirmar?.destrutivo ? "bg-danger hover:bg-danger/90" : undefined}
                onClick={(e) => { e.preventDefault(); confirmar?.acao(); setConfirmar(null); }}
                data-testid="button-confirmar-acao"
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
