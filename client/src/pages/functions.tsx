/**
 * Funções — catálogo de funções e quem responde por elas.
 *
 * 07/10 (redesenho, série premium): a MESMA casca de Eventos/Passagens — barra
 * da tela de 56px grudada no topo (título, o recorte por extenso, as abas e
 * "Nova função"), conteúdo em até 1560px, a barra de filtros comum e os estados
 * (carregando com a geometria real, erro com o motivo, vazios que dizem por
 * quê) dentro da mesma casca.
 *
 * Duas listas de pessoas, dois efeitos — e a tela diz qual é qual, colado em
 * cada lista (`components/functions/papeis.tsx`):
 *  - aba Catálogo: os RESPONSÁVEIS da função (cadastro normal);
 *  - aba Validação de Escala (só admin): VALIDADOR e APROVADOR.
 *
 * Nada de regra mudou: mesmas consultas, mutações, permissões e toasts.
 * Pedaços: `functions/responsaveis-da-funcao` (célula + popover + adicionar),
 * `functions/funcao-modal` (criar/editar) e `functions/escala-responsaveis-tab`.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, ClipboardCheck, CloudOff, Pencil, Plus, RotateCw, Tag, Trash2, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import EscalaResponsaveisTab from "@/components/functions/escala-responsaveis-tab";
import { FunctionManagersCell, type ManagerSummary } from "@/components/functions/responsaveis-da-funcao";
import { FuncaoModal } from "@/components/functions/funcao-modal";
import { BOTAO_DA_LINHA, FaixaDosPapeis, FiltroSegmentado, PAPEL_RESPONSAVEL, nomeDaFuncao } from "@/components/functions/papeis";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { campo, useUrlState } from "@/lib/use-url-state";
import { EmptyState } from "@/components/common/empty-state";
import { usePageTitle } from "@/components/common/use-page-title";
import type { Function } from "@shared/schema";
import { apiErrorMessage } from "@/lib/api-error";

type FunctionWithManagers = Function & { managers?: ManagerSummary[] };
type Aba = "catalogo" | "escala";
type Recorte = "todas" | "sem";

/** Abaixo disto a tabela não cabe com folga (o nome da função quebrava em duas linhas no tablet): cartões. */
const LARGURA_MINIMA_DA_TABELA = 860;

/** Esqueleto com a geometria real: barra de filtros e as primeiras linhas. */
function Carregando() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando funções" className="flex flex-col gap-4">
      <span className="sr-only">Carregando funções…</span>
      <div aria-hidden="true" className="flex gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[340px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[230px] rounded-lg hidden sm:block" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border"><div className="pas-osso h-3 w-3" /><div className="pas-osso h-3 w-[min(520px,70%)]" /></div>
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
            <div className="pas-osso h-3.5 w-40" />
            <div className="pas-osso h-[22px] w-16 hidden md:block ml-[8%]" />
            <div className="flex items-center gap-2 ml-[6%]"><div className="pas-osso h-7 w-7 !rounded-full" /><div className="pas-osso h-3 w-28" /></div>
            <div className="pas-osso h-7 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Functions() {
  usePageTitle("Funções");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFunction, setEditingFunction] = useState<FunctionWithManagers | null>(null);
  // Busca, recorte e aba na URL (23/09 e 07/10): voltar para a tela devolve o mesmo recorte.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    recorte: campo.opcao<Recorte>("todas"),
    aba: campo.opcao<Aba>("catalogo"),
  });
  const search = urlState.q;
  const setSearch = (v: string) => setUrlState({ q: v });
  const recorte: Recorte = urlState.recorte === "sem" ? "sem" : "todas";
  const [confirmState, setConfirmState] = useState<{
    open: boolean; funcao: FunctionWithManagers | null; onConfirm: () => void;
  }>({ open: false, funcao: null, onConfirm: () => {} });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Espelha POST/PATCH/DELETE /api/functions e /:id/managers (CADASTRO_ROLES).
  // RH e Área de Função só visualizam.
  const canManage = hasPermission(user, "canManageFunctions");
  // Aba "Validação de escala": permissão própria, diferente do catálogo
  // ("são permissões diferentes" — decisão do usuário). Hoje: só admin.
  const canSeeEscalaTab = hasPermission(user, "canAccessScalingManagers");
  const aba: Aba = canSeeEscalaTab && urlState.aba === "escala" ? "escala" : "catalogo";

  const isMobile = useIsMobile();
  const { ref: medida, largura } = useLarguraUtil<HTMLDivElement>();
  const emCartoes = isMobile || (largura !== null && largura < LARGURA_MINIMA_DA_TABELA);

  const { data: functions, isLoading, isError, error, refetch } = useQuery<FunctionWithManagers[]>({ queryKey: ["/api/functions"] });

  const catalogo = useMemo(
    () => (functions ?? []).filter(f => f.responsibleArea !== '__system__').sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [functions],
  );
  const totalCount = catalogo.length;
  const semResponsavel = useMemo(() => catalogo.filter(f => (f.managers ?? []).length === 0).length, [catalogo]);

  const sortedFunctions = useMemo(() => {
    let list = catalogo;
    if (recorte === "sem") list = list.filter(f => (f.managers ?? []).length === 0);
    if (search.trim()) { const t = search.toLowerCase(); list = list.filter(f => f.name.toLowerCase().includes(t)); }
    return list;
  }, [catalogo, recorte, search]);

  const deleteFunctionMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/functions/${id}`)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/functions"] }); toast({ title: "Função removida." }); },
    onError: (err: unknown) => toast({ title: "Erro ao remover função", description: apiErrorMessage(err, "Pode haver escalações vinculadas."), variant: "destructive" }),
  });

  const handleOpenDialog = (fn?: FunctionWithManagers) => { setEditingFunction(fn ?? null); setIsDialogOpen(true); };
  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingFunction(null); };
  const handleDelete = (fn: FunctionWithManagers) => {
    setConfirmState({ open: true, funcao: fn,
      onConfirm: () => {
        setConfirmState(p => ({ ...p, open: false }));
        if (deleteFunctionMutation.isPending) return;
        deleteFunctionMutation.mutate(fn.id);
      } });
  };

  const falhou = isError && !functions;
  const filtrando = !!search.trim() || recorte === "sem";

  // ── Colunas (DataTable). O nome abre a edição (a linha inteira, pelo ::after). ──
  const nomeDaLinha = (f: FunctionWithManagers) => canManage ? (
    <button type="button" onClick={() => handleOpenDialog(f)} className="fun-abrir block max-w-full text-left text-sm font-semibold leading-5 text-foreground rounded-sm focus-visible:outline-none"
      aria-label={`Editar função ${nomeDaFuncao(f.name)}`}>
      {nomeDaFuncao(f.name)}
    </button>
  ) : (
    <span className="block text-sm font-semibold leading-5 text-foreground">{nomeDaFuncao(f.name)}</span>
  );

  const conta = (f: FunctionWithManagers) => f.costCenter?.trim()
    ? <span className="inline-flex items-center max-w-full h-[22px] px-2 rounded-md bg-muted text-xs font-medium tabular-nums text-slate-700 truncate" title={`Conta do rateio: ${f.costCenter}`}>{f.costCenter}</span>
    : <span className="text-xs text-muted-foreground/70">Sem conta</span>;

  const acoes = (f: FunctionWithManagers) => canManage && (
    <div className="flex items-center justify-end gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => handleOpenDialog(f)} data-testid={`button-edit-function-${f.id}`}
            aria-label={`Editar função ${f.name}`}
            className={cn(BOTAO_DA_LINHA, "hover:text-primary hover:bg-brand-soft")}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Editar</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => handleDelete(f)} data-testid={`button-delete-function-${f.id}`}
            disabled={deleteFunctionMutation.isPending}
            aria-label={`Excluir função ${f.name}`}
            className={cn(BOTAO_DA_LINHA, "hover:text-danger-strong hover:bg-danger-soft")}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Excluir</TooltipContent>
      </Tooltip>
    </div>
  );

  const colunasDeFuncoes: ColunaDaTabela<FunctionWithManagers>[] = [
    { key: "nome", header: "Função", papel: "principal", headerClassName: "w-[28%]", cell: nomeDaLinha },
    { key: "conta", header: "Conta (rateio)", width: 200, headerTip: "Em qual conta o custo da função entra no fechamento do evento", cell: conta },
    {
      key: "responsaveis", header: "Responsáveis", headerClassName: "w-[46%]", headerTip: `Responsáveis ${PAPEL_RESPONSAVEL.efeito}`,
      cell: f => <FunctionManagersCell functionId={f.id} functionName={f.name} managers={f.managers} canManage={canManage} />,
    },
    ...(canManage ? [{ key: "acoes", header: "", headerLabel: "Ações", width: 96, align: "right" as const, papel: "acoes" as const, cell: acoes }] : []),
  ];

  /** Cartão (celular, tablet e lista estreita): nome e ações, a conta, e os responsáveis numa faixa própria. */
  const cartao = (f: FunctionWithManagers) => (
    <article className="fun-cartao relative h-full rounded-xl border border-border bg-card px-4 pt-3 pb-3.5" aria-label={nomeDaFuncao(f.name)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-1">{nomeDaLinha(f)}</div>
        {acoes(f)}
      </div>
      <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">Conta {conta(f)}</p>
      <div className="mt-3 pt-2.5 border-t border-border/70">
        <p className="m-0 mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Responsáveis</p>
        <FunctionManagersCell functionId={f.id} functionName={f.name} managers={f.managers} canManage={canManage} />
      </div>
    </article>
  );

  // ── Faixa: o que os responsáveis fazem (e onde ficam validador/aprovador) ──
  const faixa = (className?: string) => (
    <FaixaDosPapeis
      testid="faixa-responsaveis"
      className={className}
      itens={[{ icone: Users, papel: PAPEL_RESPONSAVEL, cor: "text-primary" }]}
      extra={canSeeEscalaTab ? (
        <button type="button" onClick={() => setUrlState({ aba: "escala" })}
          className="pas-alvo relative z-[1] inline-flex items-center gap-1 self-start h-5 -my-px rounded-sm text-xs font-medium text-primary whitespace-nowrap hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Validador e aprovador da Escala<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ) : undefined}
    />
  );

  // ── Vazios ──
  const q = search.trim();
  const vazio = totalCount === 0 ? (
    <EmptyState icon={Tag} title="Nenhuma função cadastrada"
      description={canManage ? "Crie a primeira função para usá-la na Sugestão, na Escalação e nos custos." : "Ainda não há funções cadastradas."}
      action={canManage ? <Button size="sm" onClick={() => handleOpenDialog()} className="rounded-lg"><Plus className="w-4 h-4" aria-hidden="true" /> Nova função</Button> : undefined}
      className="pas-entra" />
  ) : recorte === "sem" && !q ? (
    <EmptyState icon={CircleCheck} title="Todas as funções têm responsável"
      description={`As ${totalCount} funções do catálogo têm ao menos uma pessoa respondendo por elas.`}
      action={<Button size="sm" variant="outline" onClick={() => setUrlState({ recorte: "todas" })} className="rounded-lg">Ver todas</Button>}
      className="pas-entra" />
  ) : (
    <EmptyState variant="filtered" icon={Tag}
      title={q ? <>Nenhuma função com “{q}”</> : "Nenhuma função neste recorte"}
      description={recorte === "sem" ? "A busca vale dentro de “Sem responsável”. Limpe para ver o catálogo inteiro." : "Confira a grafia — a busca procura pelo nome da função."}
      onClearFilters={() => setUrlState({ q: "", recorte: "todas" })}
      className="pas-entra" />
  );

  let catalogoConteudo: ReactNode;
  if (isLoading) catalogoConteudo = <Carregando />;
  else if (falhou) catalogoConteudo = (
    /* Carregando e erro precisam de ramos próprios: sem eles, uma sessão
       expirada ou queda de rede aparecia como "Nenhuma função cadastrada". */
    <div role="alert" className="pas-entra flex flex-col items-center text-center rounded-xl border border-danger/25 bg-card px-6 py-14">
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger-soft text-danger mb-3" aria-hidden="true">
        <CloudOff className="w-5 h-5" />
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">Não foi possível carregar as funções</h2>
      <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">{apiErrorMessage(error, "Verifique sua conexão e tente novamente.")}</p>
      <Button variant="outline" className="mt-5 rounded-lg" onClick={() => refetch()}>
        <RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente
      </Button>
    </div>
  );
  else if (totalCount === 0) catalogoConteudo = vazio;
  else catalogoConteudo = (
    <>
      {/* Barra de filtros: a busca comum (Esc apaga) e o recorte com a contagem. */}
      <div role="search" aria-label="Filtros das funções" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex-1 min-w-0 basis-full sm:basis-auto sm:flex-[1_1_220px] sm:max-w-[340px]">
          <BuscaDaLista valor={search} onChange={setSearch} placeholder="Buscar função pelo nome" rotulo="Buscar função pelo nome" testid="functions-search" />
        </div>
        <FiltroSegmentado<Recorte>
          rotulo="Recorte das funções" testid="recorte-funcoes"
          valor={recorte} onChange={v => setUrlState({ recorte: v })}
          opcoes={[
            { id: "todas", nome: "Todas", n: totalCount },
            { id: "sem", nome: "Sem responsável", n: semResponsavel, alerta: true },
          ]} />
        {filtrando && sortedFunctions.length > 0 && (
          <span className="pas-entra ml-auto text-xs text-muted-foreground tabular-nums" aria-live="polite" data-testid="contagem-funcoes">
            {sortedFunctions.length} de {totalCount} {totalCount === 1 ? "função" : "funções"}
          </span>
        )}
      </div>

      <div>
        {sortedFunctions.length === 0 ? vazio : emCartoes ? (
          <div className="flex flex-col gap-2">
            {faixa("rounded-xl border border-border bg-card")}
            <DataTable columns={colunasDeFuncoes} rows={sortedFunctions} getRowId={f => f.id} caption="Funções cadastradas"
              cardMode="always" cardRender={cartao} cardListClassName="grid sm:grid-cols-2 gap-2" />
          </div>
        ) : (
          <div className="fun-moldura bg-card rounded-xl border border-border shadow-1">
            {faixa("border-b border-border")}
            {/* Tabela sobre o DataTable (28/09): caption, th com scope e a
                ordem alfabética da tela. A linha abre a edição (o nome é o botão). */}
            <DataTable
              columns={colunasDeFuncoes}
              rows={sortedFunctions}
              getRowId={f => f.id}
              caption="Funções cadastradas"
              cardMode="never"
              className="fun-rolagem"
              tableClassName="fun-tabela"
              rowClassName={() => "fun-linha"}
            />
          </div>
        )}
      </div>
    </>
  );

  // ── Barra da tela ──
  const subtitulo: ReactNode = aba === "escala"
    ? "Quem valida e quem aprova a escala de cada função"
    : isLoading ? "Carregando…" : falhou ? null : (
      <span data-testid="resumo-funcoes">
        {totalCount} {totalCount === 1 ? "função" : "funções"}
        {semResponsavel > 0 && <span className="text-warning-strong"> · {semResponsavel} sem responsável</span>}
      </span>
    );

  const abas = canSeeEscalaTab ? (
    <TabsList aria-label="Seções de Funções" className="h-[34px] p-0.5 gap-0.5 rounded-lg border border-border bg-surface-muted">
      <TabsTrigger value="catalogo" data-testid="tab-funcoes"
        className="pas-alvo h-full gap-1.5 rounded-md px-3 py-0 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-offset-0 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-1">
        <Tag className="w-3.5 h-3.5" aria-hidden="true" /> Catálogo
      </TabsTrigger>
      <TabsTrigger value="escala" data-testid="tab-validacao-escala"
        className="pas-alvo h-full gap-1.5 rounded-md px-3 py-0 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-offset-0 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-1">
        <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> Validação de Escala
      </TabsTrigger>
    </TabsList>
  ) : undefined;

  const botaoNova = canManage && aba === "catalogo" ? (
    <Button onClick={() => handleOpenDialog()} data-testid="button-add-function"
      className="h-[34px] rounded-lg px-3.5 text-sm font-semibold hover:bg-primary-hover">
      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      Nova função
    </Button>
  ) : undefined;

  const confirmando = confirmState.funcao;
  const nResp = confirmando?.managers?.length ?? 0;

  return (
    <TooltipProvider>
      {/* Abas: sem a permissão própria da aba Validação de Escala, nem a lista
          de abas aparece — a tela é o catálogo direto, como sempre foi. */}
      <Tabs value={aba} onValueChange={v => setUrlState({ aba: v as Aba })} className="w-full">
        <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
          <PageHeader variant="bar" title="Funções" subtitle={subtitulo} className="mx-0 mt-0" tabs={abas} actions={botaoNova} />
          <div className="px-[var(--page-gutter)] pt-5 pb-6">
            {/* Medido aqui: existe sempre (também carregando ou na outra aba) — sem isso a medição não começava. */}
            <div ref={medida} className="max-w-[1560px] mx-auto">
              <TabsContent value="catalogo" className="mt-0 flex flex-col gap-4 focus-visible:ring-offset-0">
                {catalogoConteudo}
              </TabsContent>
              {canSeeEscalaTab && (
                <TabsContent value="escala" className="mt-0 focus-visible:ring-offset-0">
                  <EscalaResponsaveisTab canManage={canManage} />
                </TabsContent>
              )}
            </div>
          </div>
        </div>
      </Tabs>

      {canManage && (
        <FuncaoModal open={isDialogOpen} funcao={editingFunction} todas={catalogo}
          responsaveis={editingFunction?.managers?.length} onClose={handleCloseDialog} />
      )}

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(o) => { if (!o) setConfirmState(p => ({ ...p, open: false })); }}
        title="Excluir a função?"
        description="Esta ação não pode ser desfeita: os responsáveis, o validador, o aprovador e os valores saem junto. Se houver escalações ligadas a ela, o sistema não deixa excluir."
        detalhes={confirmando ? (
          <div className="space-y-0.5">
            <p className="m-0 font-semibold text-sm leading-5">{nomeDaFuncao(confirmando.name)}</p>
            <p className="m-0 text-muted-foreground">
              {confirmando.costCenter?.trim() ? `Conta ${confirmando.costCenter}` : "Sem conta de rateio"}
              {" · "}{nResp === 0 ? "sem responsável" : `${nResp} ${nResp === 1 ? "responsável" : "responsáveis"}`}
            </p>
          </div>
        ) : undefined}
        confirmLabel="Excluir função"
        tone="danger"
        icon={Trash2}
        onConfirm={confirmState.onConfirm}
        testId="dialog-excluir-funcao"
      />
    </TooltipProvider>
  );
}
