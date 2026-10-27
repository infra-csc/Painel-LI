/**
 * Contratos (CNPJ) — a tela do DP (26/10, Fase 0 do Módulo de Honorários).
 *
 * Ata de 22/10: "o DP verifica se o CNPJ informado tem contrato ativo". A
 * tela tem duas abas:
 *  - Contratos: busca (razão social, CNPJ, colaborador), filtros (situação,
 *    tipo, vence em, origem) com contagens, a lista e a ficha lateral (vigência,
 *    colaboradores, anexo, histórico; editar, encerrar, reativar). Novo
 *    contrato e "Importar planilha" (3 passos) no topo;
 *  - Mudanças de conta: as trocas de banco/conta/PIX dos colaboradores que
 *    outra pessoa do DP precisa conferir — o aviso do sino leva para cá.
 * Só admin e financial (rota protegida por canAccessFinanceiro + 403 da API).
 */
import { useMemo, useState } from "react";
import { BadgeCheck, Building2, ChevronRight, CloudOff, FileSpreadsheet, History, Lock, Paperclip, Plus, SearchX, ShieldAlert, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { BuscaDaLista } from "@/components/common/barra-de-filtros";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { useAuth } from "@/hooks/use-auth";
import { campo, useUrlState } from "@/lib/use-url-state";
import { useMediaQuery } from "@/lib/use-media-query";
import { toTitleCase } from "@/lib/format";
import { apiErrorMessage, cn } from "@/lib/utils";
import { isFinanceRole } from "@shared/roles";
import { SITUACAO_DO_CONTRATO_LABEL, TIPOS_DE_CONTRATO, TIPO_DE_CONTRATO_LABEL, normalizarBusca, type SituacaoDoContrato } from "@shared/contratos";
import { useAlteracoesDeConta, useContratos, type Contrato } from "@/components/contratos/api";
import { SeloAprovadoAutomaticamente, SituacaoDoContratoBadge, TipoDoContrato, vigenciaTexto } from "@/components/contratos/pecas";
import { AprovacaoPeloHistoricoDialog } from "@/components/contratos/aprovacao-pelo-historico-dialog";
import { ContratoDialog } from "@/components/contratos/contrato-dialog";
import { ContratoSheet } from "@/components/contratos/contrato-sheet";
import { ImportacaoDialog } from "@/components/contratos/importacao-dialog";
import { AlteracoesDeConta } from "@/components/contratos/alteracoes-de-conta";
import { SecaoPagamento } from "@/components/contratos/secao-pagamento";

type Aba = "contratos" | "contas";
type FiltroSituacao = "todas" | SituacaoDoContrato;
type FiltroVence = "" | "30" | "60" | "90";
/** 28/10: origem do contrato (cadastrado pelo DP × aprovado automaticamente pelo histórico). */
type FiltroOrigem = "" | "automatico" | "cadastro";

const ORDEM_DAS_SITUACOES: SituacaoDoContrato[] = ["ativo", "vence_em_breve", "vencido", "futuro", "sem_vigencia", "encerrado"];
const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

function casaBusca(c: Contrato, q: string): boolean {
  const t = normalizarBusca(q);
  if (!t) return true;
  const d = q.replace(/\D/g, "");
  return normalizarBusca(c.razaoSocial).includes(t)
    || normalizarBusca(c.nomeFantasia).includes(t)
    || (d.length >= 3 && c.cnpj.includes(d))
    || c.colaboradores.some((x) => normalizarBusca(x.fullName).includes(t));
}

function Colaboradores({ c }: { c: Contrato }) {
  if (c.colaboradores.length === 0) return <span className="text-xs text-muted-foreground">Nenhum vinculado</span>;
  const nomes = c.colaboradores.map((x) => toTitleCase(x.fullName));
  return (
    <span className="block min-w-0 truncate text-xs text-slate-700" title={nomes.join(", ")}>
      {nomes.slice(0, 2).join(", ")}{nomes.length > 2 && <span className="text-muted-foreground"> +{nomes.length - 2}</span>}
    </span>
  );
}

function LinhaDoContrato({ c, onAbrir }: { c: Contrato; onAbrir: () => void }) {
  return (
    <tr className="ctr-linha group cursor-pointer border-b border-border bg-card last:border-b-0 hover:bg-surface-muted/60" onClick={onAbrir} data-testid={`ctr-linha-${c.id}`}>
      <td className="px-3 py-3">
        <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(); }} className="block max-w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground group-hover:text-primary">{c.razaoSocial}</span>
          <span className="block truncate text-2xs text-muted-foreground"><span className="font-mono tabular-nums">{c.cnpjFormatado}</span>{c.nomeFantasia ? ` · ${c.nomeFantasia}` : ""}</span>
        </button>
      </td>
      <td className="px-3 py-3">
        <span className="flex flex-wrap items-center gap-1">
          <TipoDoContrato tipo={c.tipo} />
          {c.origem === "automatico" && <SeloAprovadoAutomaticamente detalhe={c.origemDetalhe} compacto />}
        </span>
      </td>
      <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{vigenciaTexto(c.vigenciaInicio, c.vigenciaFim)}</td>
      <td className="px-3 py-3"><SituacaoDoContratoBadge situacao={c.situacao} dias={c.diasParaVencer} /></td>
      <td className="max-w-0 px-3 py-3"><Colaboradores c={c} /></td>
      <td className="px-2 py-3 text-right">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {c.anexoId && <Paperclip className="h-3.5 w-3.5" aria-label="Com o contrato anexado" />}
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </td>
    </tr>
  );
}

function CartaoDoContrato({ c, onAbrir }: { c: Contrato; onAbrir: () => void }) {
  return (
    <li>
      <button type="button" onClick={onAbrir} className="ctr-cartao block w-full rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-1 transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`ctr-cartao-${c.id}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-5 text-foreground">{c.razaoSocial}</p>
            <p className="font-mono text-2xs tabular-nums text-muted-foreground">{c.cnpjFormatado}</p>
          </div>
          <SituacaoDoContratoBadge situacao={c.situacao} dias={c.diasParaVencer} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700">
          <TipoDoContrato tipo={c.tipo} />
          {c.origem === "automatico" && <SeloAprovadoAutomaticamente detalhe={c.origemDetalhe} />}
          <span className="tabular-nums">{vigenciaTexto(c.vigenciaInicio, c.vigenciaFim)}</span>
          {c.anexoId && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Com o contrato anexado" />}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><Colaboradores c={c} /></div>
      </button>
    </li>
  );
}

export default function ContratosPage() {
  usePageTitle("Contratos (CNPJ)");
  const { user } = useAuth();
  const dp = isFinanceRole(user?.role);
  const largo = useMediaQuery("(min-width: 1024px)");
  const [url, setUrl] = useUrlState({
    aba: campo.opcao<Aba>("contratos"),
    q: campo.texto(""),
    situacao: campo.opcao<FiltroSituacao>("todas"),
    tipo: campo.texto(""),
    vence: campo.opcao<FiltroVence>(""),
    origem: campo.opcao<FiltroOrigem>(""),
    contrato: campo.texto(""),
    contas: campo.opcao<"pendentes" | "todas">("pendentes"),
  });
  const q = useContratos(dp);
  const pendentes = useAlteracoesDeConta("pendentes", dp);
  const [editando, setEditando] = useState<Contrato | null>(null);
  const [novo, setNovo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [pagamentoDe, setPagamentoDe] = useState<{ id: string; nome: string } | null>(null);

  const todos = useMemo(() => q.data?.contratos ?? [], [q.data]);
  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM_DAS_SITUACOES.map((s) => [s, 0])) as Record<SituacaoDoContrato, number>;
    for (const x of todos) c[x.situacao]++;
    return c;
  }, [todos]);
  const filtrados = useMemo(() => {
    const lim = url.vence ? Number(url.vence) : null;
    const lista = todos.filter((c) => casaBusca(c, url.q)
      && (url.situacao === "todas" || c.situacao === url.situacao)
      && (!url.tipo || c.tipo === url.tipo)
      && (!url.origem || c.origem === url.origem)
      && (lim == null || (!c.encerradoEm && c.diasParaVencer != null && c.diasParaVencer >= 0 && c.diasParaVencer <= lim)));
    return lim != null ? [...lista].sort((a, b) => (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0)) : lista;
  }, [todos, url.q, url.situacao, url.tipo, url.vence, url.origem]);
  const comFiltro = !!url.q || url.situacao !== "todas" || !!url.tipo || !!url.vence || !!url.origem;
  const limpar = () => setUrl({ q: "", situacao: "todas", tipo: "", vence: "", origem: "" });
  const automaticos = useMemo(() => todos.filter((c) => c.origem === "automatico").length, [todos]);
  const nPendentes = pendentes.data?.length ?? 0;
  const ativos = contagem.ativo + contagem.vence_em_breve;

  const acoes = dp ? (
    <>
      <Button type="button" variant="outline" size="sm" className="h-[34px]" onClick={() => setAprovando(true)} data-testid="ctr-aprovar-historico" title="CNPJ que já teve OC, nota aprovada ou pagamento vira contrato ativo">
        <History className="h-4 w-4" aria-hidden="true" /> Aprovar pelo histórico
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-[34px]" onClick={() => setImportando(true)} data-testid="ctr-importar">
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Importar planilha
      </Button>
      <Button type="button" size="sm" className="h-[34px]" onClick={() => setNovo(true)} data-testid="ctr-novo">
        <Plus className="h-4 w-4" aria-hidden="true" /> Novo contrato
      </Button>
    </>
  ) : undefined;

  const ABAS: { id: Aba; rotulo: string; icone: LucideIcon; n: number | null }[] = [
    { id: "contratos", rotulo: "Contratos", icone: Building2, n: null },
    { id: "contas", rotulo: "Mudanças de conta", icone: ShieldAlert, n: nPendentes || null },
  ];

  let conteudo: React.ReactNode;
  if (!dp) {
    conteudo = <EstadoDaValidacao icone={<Lock />} titulo="Tela do DP" texto="Só o DP (Financeiro) e o administrador veem e cadastram os contratos." testId="ctr-sem-acesso" />;
  } else if (q.isLoading) {
    conteudo = (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando contratos">
        <div className="val-osso h-[78px] w-full rounded-xl" />
        <div className={cn(MOLDURA, "space-y-2 p-4")}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="val-osso h-11 w-full" />)}</div>
      </div>
    );
  } else if (q.error) {
    conteudo = <EstadoDaValidacao tom="erro" icone={<CloudOff />} titulo="Não foi possível carregar os contratos" texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")} acao={<BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} />} />;
  } else {
    const chips: { id: FiltroSituacao; rotulo: string; n: number }[] = [
      { id: "todas", rotulo: "Todas", n: todos.length },
      ...ORDEM_DAS_SITUACOES.filter((s) => contagem[s] > 0 || url.situacao === s).map((s) => ({ id: s as FiltroSituacao, rotulo: SITUACAO_DO_CONTRATO_LABEL[s], n: contagem[s] })),
    ];
    conteudo = (
      <>
        <div role="group" aria-label="Resumo dos contratos" className="ctr-faixa grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-1 sm:grid-cols-4" data-testid="ctr-totais">
          {[
            { rotulo: "Contratos ativos", valor: ativos, detalhe: `de ${todos.length} ${todos.length === 1 ? "cadastrado" : "cadastrados"}`, ponto: "bg-success-strong", filtro: "ativo" as FiltroSituacao },
            { rotulo: "Vencem em 30 dias", valor: contagem.vence_em_breve, detalhe: contagem.vence_em_breve ? "renove antes do próximo evento" : "nenhum vencendo", ponto: "bg-warning-strong", filtro: "vence_em_breve" as FiltroSituacao },
            { rotulo: "Vencidos", valor: contagem.vencido, detalhe: contagem.vencido ? "não contam como ativos" : "nenhum vencido", ponto: "bg-danger", filtro: "vencido" as FiltroSituacao },
            { rotulo: "Sem vigência", valor: contagem.sem_vigencia, detalhe: `${contagem.encerrado} ${contagem.encerrado === 1 ? "encerrado" : "encerrados"}`, ponto: "bg-slate-400", filtro: "sem_vigencia" as FiltroSituacao },
          ].map((i) => (
            <button key={i.rotulo} type="button" onClick={() => setUrl({ situacao: url.situacao === i.filtro ? "todas" : i.filtro, aba: "contratos" })} aria-pressed={url.situacao === i.filtro}
              className={cn("ctr-total bg-card px-4 py-3 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", url.situacao === i.filtro && "bg-brand-soft/60")}>
              <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground"><span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", i.ponto)} />{i.rotulo}</span>
              <span className="mt-0.5 block text-lg font-semibold leading-7 tracking-[-0.01em] tabular-nums text-foreground">{i.valor}</span>
              <span className="block text-2xs text-muted-foreground">{i.detalhe}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:border-b sm:border-border">
          <div className="val-rolagem-x -mx-[var(--page-gutter)] border-b border-border px-[var(--page-gutter)] sm:mx-0 sm:self-end sm:border-b-0 sm:px-0">
            <div role="tablist" aria-label="Contratos" className="flex min-w-max items-end gap-1">
              {ABAS.map((a, i) => {
                const on = url.aba === a.id;
                const Icone = a.icone;
                return (
                  <button key={a.id} id={`ctr-tab-${a.id}`} type="button" role="tab" aria-selected={on} aria-controls={`ctr-painel-${a.id}`} tabIndex={on ? 0 : -1}
                    onClick={() => setUrl({ aba: a.id })} data-testid={`ctr-tab-${a.id}`}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const prox = ABAS[(i + 1) % ABAS.length];
                      setUrl({ aba: prox.id });
                      document.getElementById(`ctr-tab-${prox.id}`)?.focus();
                    }}
                    className={cn("group relative -mb-px inline-flex h-11 items-center gap-2 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      on ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {a.rotulo}
                    {a.n ? <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-warning-soft px-1.5 text-2xs font-semibold tabular-nums text-warning">{a.n}</span> : null}
                    <span aria-hidden="true" className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none", on ? "scale-x-100" : "scale-x-0")} />
                  </button>
                );
              })}
            </div>
          </div>
          {url.aba === "contratos" && todos.length > 0 && (
            <div className="w-full sm:ml-auto sm:w-[340px] sm:pb-1.5">
              <BuscaDaLista valor={url.q} onChange={(v) => setUrl({ q: v })} placeholder="Razão social, CNPJ ou colaborador" rotulo="Buscar contrato por razão social, CNPJ ou colaborador" testid="ctr-busca" />
            </div>
          )}
          {url.aba === "contas" && (
            <div className="flex items-center gap-1 sm:ml-auto sm:pb-1.5" role="radiogroup" aria-label="Quais mudanças">
              {(["pendentes", "todas"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={url.contas === s} onClick={() => setUrl({ contas: s })}
                  className={cn("h-8 rounded-full border px-3 text-xs font-medium transition-colors", url.contas === s ? "border-foreground bg-foreground text-white" : "border-border bg-card text-slate-700 hover:border-slate-300")}>
                  {s === "pendentes" ? "A conferir" : "Todas"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div id={`ctr-painel-${url.aba}`} role="tabpanel" aria-labelledby={`ctr-tab-${url.aba}`} className="val-entra space-y-3">
          {url.aba === "contas" && <AlteracoesDeConta situacao={url.contas} onAbrirColaborador={(id, nome) => setPagamentoDe({ id, nome })} />}

          {url.aba === "contratos" && (todos.length === 0 ? (
            <EstadoDaValidacao icone={<Building2 />} titulo="Nenhum contrato cadastrado" testId="ctr-vazio"
              texto="Cadastre um por um ou importe a planilha de contratos. Cada CNPJ fica ligado aos colaboradores que ele atende."
              acao={<>
                <Button type="button" variant="outline" onClick={() => setImportando(true)}><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Importar planilha</Button>
                <Button type="button" onClick={() => setNovo(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo contrato</Button>
              </>} />
          ) : (
            <>
              <div className="ctr-filtros flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Situação">
                  {chips.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={url.situacao === c.id} onClick={() => setUrl({ situacao: c.id })} data-testid={`ctr-filtro-${c.id}`}
                      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        url.situacao === c.id ? "border-foreground bg-foreground text-white" : "border-border bg-card text-slate-700 hover:border-slate-300")}>
                      {c.rotulo}<span className={cn("tabular-nums", url.situacao === c.id ? "text-white/80" : "text-muted-foreground")}>{c.n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ctr-filtros flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-2xs text-muted-foreground" aria-live="polite">
                  {filtrados.length === todos.length ? `${todos.length} ${todos.length === 1 ? "contrato" : "contratos"}` : `${filtrados.length} de ${todos.length} contratos`}
                  {url.vence ? " · do que vence primeiro ao último" : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <label className="sr-only" htmlFor="ctr-filtro-origem">Origem</label>
                  <select id="ctr-filtro-origem" value={url.origem} onChange={(e) => setUrl({ origem: e.target.value as FiltroOrigem })} data-testid="ctr-filtro-origem"
                    className={cn("h-8 rounded-lg border bg-card px-2.5 text-xs font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12", url.origem ? "border-primary text-primary" : "border-border text-slate-700")}>
                    <option value="">Todas as origens</option>
                    <option value="automatico">Aprovados automaticamente ({automaticos})</option>
                    <option value="cadastro">Cadastrados pelo DP ({todos.length - automaticos})</option>
                  </select>
                  <label className="sr-only" htmlFor="ctr-filtro-tipo">Tipo</label>
                  <select id="ctr-filtro-tipo" value={url.tipo} onChange={(e) => setUrl({ tipo: e.target.value })}
                    className={cn("h-8 rounded-lg border bg-card px-2.5 text-xs font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12", url.tipo ? "border-primary text-primary" : "border-border text-slate-700")}>
                    <option value="">Todos os tipos</option>
                    {TIPOS_DE_CONTRATO.map((t) => <option key={t} value={t}>{TIPO_DE_CONTRATO_LABEL[t]}</option>)}
                  </select>
                  <label className="sr-only" htmlFor="ctr-filtro-vence">Vence em</label>
                  <select id="ctr-filtro-vence" value={url.vence} onChange={(e) => setUrl({ vence: e.target.value as FiltroVence })}
                    className={cn("h-8 rounded-lg border bg-card px-2.5 text-xs font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12", url.vence ? "border-primary text-primary" : "border-border text-slate-700")}>
                    <option value="">Vence em: qualquer data</option>
                    <option value="30">Vence em até 30 dias</option>
                    <option value="60">Vence em até 60 dias</option>
                    <option value="90">Vence em até 90 dias</option>
                  </select>
                  {comFiltro && (
                    <button type="button" onClick={limpar} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="ctr-limpar">
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar
                    </button>
                  )}
                </div>
              </div>
              {filtrados.length === 0 ? (
                <EstadoDaValidacao icone={<SearchX />} titulo="Nenhum contrato com esses filtros" texto="Mude a busca ou os filtros." acao={<Button type="button" variant="outline" onClick={limpar}>Limpar filtros</Button>} testId="ctr-sem-resultado" />
              ) : largo ? (
                <div className={cn(MOLDURA, "overflow-hidden")}>
                  <table className="w-full table-fixed text-sm" data-testid="ctr-tabela">
                    <caption className="sr-only">Contratos cadastrados</caption>
                    <thead className="border-b border-border bg-surface-muted">
                      <tr>
                        <th scope="col" className={TH}>Empresa</th>
                        <th scope="col" className={cn(TH, "w-[120px]")}>Tipo</th>
                        <th scope="col" className={cn(TH, "w-[200px]")}>Vigência</th>
                        <th scope="col" className={cn(TH, "w-[170px]")}>Situação</th>
                        <th scope="col" className={cn(TH, "w-[24%]")}>Colaboradores</th>
                        <th scope="col" className={cn(TH, "w-[56px]")}><span className="sr-only">Abrir</span></th>
                      </tr>
                    </thead>
                    <tbody>{filtrados.map((c) => <LinhaDoContrato key={c.id} c={c} onAbrir={() => setUrl({ contrato: c.id })} />)}</tbody>
                  </table>
                </div>
              ) : (
                <ul className="grid gap-2.5 md:grid-cols-2" data-testid="ctr-cartoes">{filtrados.map((c) => <CartaoDoContrato key={c.id} c={c} onAbrir={() => setUrl({ contrato: c.id })} />)}</ul>
              )}
              <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Ativo = dentro da vigência (início e fim contam). Sem datas não conta como ativo. CNPJ sem contrato ativo vira pendência da OC. CNPJ que já teve OC, nota aprovada ou pagamento é aprovado automaticamente (encerrado pelo DP não volta).
              </p>
            </>
          ))}
        </div>
      </>
    );
  }

  return (
    <PageContainer fluid className="pb-16">
      <PageHeader variant="bar" title="Contratos (CNPJ)" className="gap-x-3 max-sm:static"
        subtitle={dp && q.data ? `${todos.length} ${todos.length === 1 ? "contrato" : "contratos"} · ${ativos} ${ativos === 1 ? "ativo" : "ativos"}` : "CNPJ dos titulares e vigência dos contratos"}
        actions={acoes} />
      <div className="mx-auto w-full max-w-[1560px] space-y-5">{conteudo}</div>

      <ContratoDialog aberto={novo || !!editando} contrato={editando} onClose={() => { setNovo(false); setEditando(null); }}
        onSalvo={(c) => { if (novo) setUrl({ contrato: c.id }); }} />
      <ContratoSheet id={url.contrato || null} onOpenChange={(o) => { if (!o) setUrl({ contrato: "" }); }} onEditar={(c) => setEditando(c)} />
      <ImportacaoDialog aberto={importando} onClose={() => setImportando(false)} />
      <AprovacaoPeloHistoricoDialog aberto={aprovando} onClose={() => setAprovando(false)} />
      <Sheet open={!!pagamentoDe} onOpenChange={(o) => { if (!o) setPagamentoDe(null); }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-border bg-surface-muted p-0 sm:max-w-[460px]">
          <div className="shrink-0 border-b border-border bg-card px-5 pb-4 pr-12 pt-5">
            <SheetTitle className="text-lg font-semibold">{toTitleCase(pagamentoDe?.nome ?? "")}</SheetTitle>
            <SheetDescription className="text-xs">Dados de pagamento e CNPJ emissor</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {pagamentoDe && <SecaoPagamento collaboratorId={pagamentoDe.id} nome={pagamentoDe.nome} />}
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
