/**
 * Controle de Bagagem — solicitações de bagagem despachada por colaborador e
 * evento, e os dois relatórios (por colaborador, por evento). Admin e Compras.
 *
 * 08/10 (redesenho, irmã de Passagens e Hospedagem): a mesma casca — barra de
 * 56px grudada em todos os estados (carregando, erro, sem acesso), conteúdo
 * até 1560px —, as visões em abas de verdade abaixo da barra, a fila por
 * companhia, a barra de filtros comum, a lista em tabela que vira cartão e o
 * registro em modal com seções. A regra (filtro, ordem, agregados, validação,
 * payload) continua em `baggage-logic`/`baggage-core`, intocada.
 */
import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizeRole } from "@shared/roles";
import { fixEncoding } from "@/lib/utils";
import { toTitleCase as nomeDePessoa } from "@/lib/format";
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { campo, useUrlState } from "@/lib/use-url-state";
import { guardarEventoEmFoco } from "@/lib/evento-em-foco";
import { Download, Lock, Plus } from "lucide-react";
import type { OpcaoDeFiltro } from "@/components/common/filter-popover";
import {
  ERROR_FIELD_IDS, ciaGroup, emptyForm, formularioNovo, eventPeriod, fmtDate, formatCpf, formatCurrency, getCpf, toTitleCase, todayISO,
  type BaggageHistoryItem, type BaggageRequestItem, type CiaGroup, type CollaboratorItem,
  type EventItem, type EventOption, type FormErrors, type FormState, type TabId,
} from "@/components/baggage/baggage-core";
import {
  FILTROS_VAZIOS, ORDEM_PADRAO, agregarPorColaborador, buildPayload, contadoresPorCia,
  contarPorOpcao, locJaRegistrado, ordenar, passaNosFiltros, resumir, validate,
  type FiltrosDaLista, type Ordem,
} from "@/components/baggage/baggage-logic";
import BaggageFilterBar from "@/components/baggage/baggage-filter-bar";
import BaggageFormModal from "@/components/baggage/baggage-form-modal";
import BaggageList from "@/components/baggage/baggage-list";
import BaggageWorkQueue from "@/components/baggage/baggage-work-queue";
import {
  BaggageByCollaborator, BaggageByEvent,
  type LinhaDeColaborador, type LinhaDeEvento,
} from "@/components/baggage/baggage-reports";
import BaggageTabs, { ABAS } from "@/components/baggage/baggage-tabs";
import BaggageDeleteDialog from "@/components/baggage/baggage-delete-dialog";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";

/** CSV do sistema: BOM UTF-8, separador ';' e TODOS os campos entre aspas. */
function baixarCsv(nome: string, header: string, linhas: string[]) {
  const blob = new Blob(["﻿" + [header, ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}
const aspas = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export default function BaggageControlPage() {
  usePageTitle("Controle de bagagem");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const role = normalizeRole(user?.role);
  const allowed = role === "admin" || role === "purchasing";

  // Aba, filtros, ordem e buscas na URL (23/09): voltar para a tela devolve o
  // recorte; o link copiado também. `?event=` é o mesmo nome do Financeiro e, ao
  // escolher um evento aqui, ele vira o "evento em foco" — mas esta é uma tela
  // de fila e abre em "todos" (regra do dono, 26/08): o padrão não vem da memória.
  const [urlState, setUrlState] = useUrlState({
    aba: campo.opcao<TabId>("solicitacoes"),
    event: campo.texto(""),
    colaboradores: campo.lista([]),
    q: campo.texto(""),
    cia: campo.texto(""),
    ordem: campo.opcao<Ordem["campo"]>(ORDEM_PADRAO.campo),
    desc: campo.booleano(ORDEM_PADRAO.desc),
    qc: campo.texto(""),
    qe: campo.texto(""),
  });
  const tab: TabId = ABAS.some(a => a.id === urlState.aba) ? urlState.aba : "solicitacoes";
  const setTab = (t: TabId) => setUrlState({ aba: t });
  const filtros = useMemo<FiltrosDaLista>(() => ({
    eventId: urlState.event,
    collaboratorIds: urlState.colaboradores,
    search: urlState.q,
    cia: (["Azul", "Gol", "TAM", "Outros"] as const).find(c => c === urlState.cia) ?? null,
  }), [urlState.event, urlState.colaboradores, urlState.q, urlState.cia]);
  const setFiltros = (next: FiltrosDaLista | ((prev: FiltrosDaLista) => FiltrosDaLista)) => {
    const f = typeof next === "function" ? next(filtros) : next;
    setUrlState({ event: f.eventId, colaboradores: f.collaboratorIds, q: f.search, cia: f.cia ?? "" });
    if (f.eventId && f.eventId !== filtros.eventId) guardarEventoEmFoco(user?.id, f.eventId);
  };
  const ordem = useMemo<Ordem>(() => ({ campo: urlState.ordem, desc: urlState.desc }), [urlState.ordem, urlState.desc]);
  const setOrdem = (next: Ordem | ((prev: Ordem) => Ordem)) => {
    const o = typeof next === "function" ? next(ordem) : next;
    setUrlState({ ordem: o.campo, desc: o.desc });
  };

  // Buscas das abas 2 e 3
  const collabTabSearch = urlState.qc;
  const setCollabTabSearch = (v: string) => setUrlState({ qc: v });
  const eventTabSearch = urlState.qe;
  const setEventTabSearch = (v: string) => setUrlState({ qe: v });

  // Formulário — agora em modal, então "aberto" é estado próprio.
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [errors, setErrors] = useState<FormErrors>({});
  const [editing, setEditing] = useState<BaggageRequestItem | null>(null);
  /** Já houve uma tentativa de salvar? Antes dela, não se acusa nada. */
  const [jaTentou, setJaTentou] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BaggageRequestItem | null>(null);

  const { data: events = [] } = useQuery<EventItem[]>({ queryKey: ["/api/events"], enabled: allowed });
  const { data: collaborators = [] } = useQuery<CollaboratorItem[]>({ queryKey: ["/api/collaborators"], enabled: allowed });
  const {
    data: requests = [], isLoading, isError, refetch,
  } = useQuery<BaggageRequestItem[]>({ queryKey: ["/api/baggage-requests"], enabled: allowed });
  // Histórico pré-sistema (contagens importadas da planilha antiga — sem
  // evento/valor; somadas nas visões por colaborador com selo de histórico)
  const {
    data: baggageHistory = [], isError: historyError, refetch: refetchHistory,
  } = useQuery<BaggageHistoryItem[]>({ queryKey: ["/api/baggage-history"], enabled: allowed });

  const collabById = useMemo(() => {
    const map = new Map<string, CollaboratorItem>();
    for (const c of collaborators) map.set(c.id, c);
    return map;
  }, [collaborators]);
  const eventById = useMemo(() => {
    const map = new Map<string, EventItem>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);
  const ctx = useMemo(() => ({ collabById, eventById }), [collabById, eventById]);

  // Lista normalizada para o combobox de evento do formulário: encoding
  // corrigido e ordenada por data de início DESC (mais recentes primeiro).
  const eventOptions = useMemo<EventOption[]>(() => events
    .map(ev => ({
      id: ev.id,
      name: fixEncoding(ev.name),
      location: fixEncoding(ev.location || ""),
      startDate: String(ev.startDate || "").split("T")[0],
      endDate: String(ev.endDate || "").split("T")[0],
    }))
    .sort((a, b) =>
      (b.startDate || "").localeCompare(a.startDate || "")
      || a.name.localeCompare(b.name, "pt-BR")),
  [events]);

  const colaboradoresAtivos = useMemo(() => collaborators.filter(c => c.active !== false), [collaborators]);

  // Nome para a tela pela regra única de @/lib/format ("Maria da Silva"); o CSV segue como sempre foi.
  const getCollabName = (id: string) => nomeDePessoa(fixEncoding(collabById.get(id)?.fullName || "")) || "—";
  const getEventName = useCallback((id: string) => fixEncoding(eventById.get(id)?.name || "") || "—", [eventById]);

  const bagsByCollaborator = useMemo(
    () => agregarPorColaborador(requests, baggageHistory),
    [requests, baggageHistory],
  );

  // ── Aba 1: lista filtrada e ordenada ──
  const linhasFiltradas = useMemo(
    () => ordenar(requests.filter(r => passaNosFiltros(r, filtros, ctx)), ordem, ctx),
    [requests, filtros, ordem, ctx],
  );
  const resumo = useMemo(() => resumir(linhasFiltradas), [linhasFiltradas]);

  // A fila conta sobre a lista JÁ filtrada mas SEM o recorte da própria
  // companhia: com ele aplicado, as outras três mostrariam zero e o número
  // deixaria de servir para escolher a próxima.
  const semRecorteDeCia = useMemo(
    () => requests.filter(r => passaNosFiltros(r, { ...filtros, cia: null }, ctx)),
    [requests, filtros, ctx],
  );
  const contagensPorCia = useMemo(() => contadoresPorCia(semRecorteDeCia), [semRecorteDeCia]);

  // ── Contadores cruzados dos popovers ──
  const opcoesDeEvento = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(requests, filtros, "eventId", ctx);
    return events.map(e => ({ id: e.id, nome: fixEncoding(e.name), n: n.get(e.id) ?? 0 }));
  }, [events, requests, filtros, ctx]);

  const opcoesDeColaborador = useMemo<OpcaoDeFiltro[]>(() => {
    const n = contarPorOpcao(requests, filtros, "collaboratorId", ctx);
    return colaboradoresAtivos.map(c => ({
      id: c.id, nome: nomeDePessoa(fixEncoding(c.fullName)) || "—", n: n.get(c.id) ?? 0,
    }));
  }, [colaboradoresAtivos, requests, filtros, ctx]);

  // ── Aba 2: agregado por colaborador ──
  const collabRows = useMemo<LinhaDeColaborador[]>(() => {
    const q = collabTabSearch.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return Array.from(bagsByCollaborator.entries())
      .map(([collaboratorId, agg]) => {
        const c = collabById.get(collaboratorId);
        return {
          collaboratorId,
          name: c ? toTitleCase(fixEncoding(c.fullName)) : "—",
          cpf: c ? getCpf(c) : "",
          ...agg,
        };
      })
      .filter(r => {
        if (!q) return true;
        if (r.name.toLowerCase().includes(q)) return true;
        return !!qDigits && r.cpf.replace(/\D/g, "").includes(qDigits);
      })
      // Quem tem mais bagagens primeiro (a pergunta da aba é "quem tem bagagem?")
      .sort((a, b) => b.totalBags - a.totalBags || a.name.localeCompare(b.name, "pt-BR"));
  }, [bagsByCollaborator, collabById, collabTabSearch]);

  // Colaboradores ativos que batem com a busca mas ainda não têm bagagem
  // nenhuma — candidatos a entrar no histórico manualmente
  const collabAddCandidates = useMemo(() => {
    const q = collabTabSearch.trim().toLowerCase();
    if (q.length < 3) return [];
    const qDigits = q.replace(/\D/g, "");
    return colaboradoresAtivos
      .filter(c => !bagsByCollaborator.has(c.id))
      .filter(c => {
        const name = fixEncoding(c.fullName || "").toLowerCase();
        if (name.includes(q)) return true;
        const cpf = getCpf(c).replace(/\D/g, "");
        return !!qDigits && cpf.includes(qDigits);
      })
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "pt-BR"))
      .slice(0, 8);
  }, [colaboradoresAtivos, bagsByCollaborator, collabTabSearch]);

  // ── Aba 3: agregado por evento ──
  const eventRows = useMemo<LinhaDeEvento[]>(() => {
    const q = eventTabSearch.trim().toLowerCase();
    const map = new Map<string, { bags: number; cents: number; records: number }>();
    for (const r of requests) {
      const agg = map.get(r.eventId) || { bags: 0, cents: 0, records: 0 };
      agg.bags += r.quantity || 0;
      agg.cents += r.valueCents || 0;
      agg.records += 1;
      map.set(r.eventId, agg);
    }
    return Array.from(map.entries())
      .map(([eventId, agg]) => {
        // Período e local só para contexto embaixo do nome (não entram no CSV).
        const ev = eventOptions.find(e => e.id === eventId);
        return { eventId, name: getEventName(eventId), ...agg, periodo: ev ? eventPeriod(ev) : undefined, local: ev?.location || undefined };
      })
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.cents - a.cents);
  }, [requests, getEventName, eventTabSearch, eventOptions]);

  const eventTotals = useMemo(() => {
    let bags = 0, cents = 0;
    for (const r of eventRows) { bags += r.bags; cents += r.cents; }
    return { bags, cents };
  }, [eventRows]);

  /*
   * Depois da primeira tentativa, os erros passam a ser recalculados a cada
   * tecla.
   *
   * Sem isso o campo continuava vermelho com "Informe o valor" DEPOIS de o
   * valor ter sido digitado, até alguém submeter de novo — e a faixa de
   * progresso, que conta ao vivo, já dizia "2 de 6" ao lado do erro. Duas
   * partes da mesma tela discordando sobre o mesmo campo.
   */
  useEffect(() => {
    if (!jaTentou) return;
    setErrors(validate(form));
  }, [form, jaTentou]);

  const colaboradorSelecionado = form.collaboratorId ? collabById.get(form.collaboratorId) : undefined;
  const agregadoDoColaborador = form.collaboratorId ? bagsByCollaborator.get(form.collaboratorId) : undefined;
  const duplicado = useMemo(
    () => locJaRegistrado(form.loc, requests, editing?.id ?? null),
    [form.loc, requests, editing],
  );

  // ── Mutations ──
  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildPayload>) => {
      const res = editing
        ? await apiRequest("PATCH", `/api/baggage-requests/${editing.id}`, payload)
        : await apiRequest("POST", "/api/baggage-requests", payload);
      return res.json();
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      // O que foi gravado, numa linha: o mesmo toast de sucesso das irmãs.
      toast({
        variant: "success",
        title: editing ? "Solicitação atualizada" : "Solicitação registrada",
        description: `LOC ${payload.loc} · ${getCollabName(payload.collaboratorId)} · ${formatCurrency(payload.valueCents)}`,
      });
      fecharForm();
    },
    onError: (e: unknown) => toast({
      title: "Não foi possível salvar a solicitação",
      description: apiErrorMessage(e, "Tente novamente."),
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/baggage-requests/${id}`).then(r => r.json()),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      const r = requests.find(x => x.id === id);
      toast({ variant: "success", title: "Solicitação excluída", description: r ? `LOC ${r.loc} · ${getCollabName(r.collaboratorId)}` : undefined });
    },
    onError: (e: unknown) => toast({
      title: "Não foi possível excluir a solicitação",
      description: apiErrorMessage(e, "Tente novamente."),
      variant: "destructive",
    }),
  });

  // Ajuste manual do histórico (colaborador × CIA) — atualização otimista no
  // cache de /api/baggage-history; o servidor é a fonte de verdade e audita.
  const historyMutation = useMutation({
    mutationFn: (p: { collaboratorId: string; cia: CiaGroup; quantity: number }) =>
      apiRequest("PUT", "/api/baggage-history", p).then(r => r.json()),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ["/api/baggage-history"] });
      const prev = qc.getQueryData<BaggageHistoryItem[]>(["/api/baggage-history"]) || [];
      const rest = prev.filter(h => !(h.collaboratorId === p.collaboratorId && ciaGroup(h.cia) === p.cia));
      qc.setQueryData(["/api/baggage-history"], p.quantity > 0 ? [...rest, { ...p }] : rest);
      return { prev };
    },
    onError: (e: unknown, _p, ctxMut) => {
      if (ctxMut?.prev) qc.setQueryData(["/api/baggage-history"], ctxMut.prev);
      toast({ title: "Não foi possível ajustar o histórico", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/baggage-history"] }),
  });

  const adjustHistory = (collaboratorId: string, cia: CiaGroup, current: number, delta: number) => {
    const next = Math.max(0, current + delta);
    if (next === current) return;
    historyMutation.mutate({ collaboratorId, cia, quantity: next });
  };

  // ── Formulário ──
  const abrirNovo = () => {
    setEditing(null);
    setForm(formularioNovo());
    setErrors({});
    setJaTentou(false);
    setFormAberto(true);
  };

  const fecharForm = () => {
    setFormAberto(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setErrors({});
    setJaTentou(false);
  };

  /**
   * Editar abre o MESMO modal, sem mover a página.
   *
   * Antes chamava `scrollIntoView` no formulário do topo: a pessoa clicava em
   * editar na décima linha e era levada para longe do lugar onde estava, sem
   * caminho de volta.
   */
  const startEdit = (r: BaggageRequestItem) => {
    const isFixedCia = ["Azul", "Gol", "TAM"].includes(r.cia);
    const isFixedAgency = ["LCA", "Flytour", "Onfly", "Direto no site"].includes(r.agency);
    setEditing(r);
    setErrors({});
    setJaTentou(false);
    setForm({
      eventId: r.eventId,
      collaboratorId: r.collaboratorId,
      loc: r.loc || "",
      // Preserva o texto original de CIAs não fixas (ex.: "Latam") em vez de
      // convertê-lo para o grupo — salvar sem mexer não altera o dado
      ciaSelect: isFixedCia ? r.cia : "Outros",
      ciaOther: isFixedCia ? "" : r.cia,
      valueText: ((r.valueCents || 0) / 100).toFixed(2).replace(".", ","),
      os: r.os || "",
      quantityText: String(r.quantity || 1),
      agencySelect: isFixedAgency ? r.agency : "Outros",
      agencyOther: isFixedAgency ? "" : r.agency,
      requestDate: String(r.requestDate || "").split("T")[0],
      boardingDate: String(r.boardingDate || "").split("T")[0],
      notes: r.notes || "",
    });
    setFormAberto(true);
  };

  const submit = () => {
    const errs = validate(form);
    setJaTentou(true);
    setErrors(errs);
    const first = ERROR_FIELD_IDS.find(([key]) => errs[key]);
    if (first) {
      const el = document.getElementById(first[1]);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    saveMutation.mutate(buildPayload(form));
  };

  // ── Exportações ──
  const exportarSolicitacoes = () => {
    const header = "LOC;CIA;VALOR;OS;QUANTIDADE;AGENCIA;NOME;CPF;EVENTO;DATA SOLICITACAO;DATA EMBARQUE;OBSERVACOES";
    const linhas = linhasFiltradas.map(r => {
      const c = collabById.get(r.collaboratorId);
      return [
        aspas(r.loc || ""),
        aspas(r.cia || ""),
        aspas(((r.valueCents || 0) / 100).toFixed(2).replace(".", ",")),
        aspas(r.os || ""),
        aspas(String(r.quantity || 0)),
        aspas(r.agency || ""),
        aspas(c ? toTitleCase(fixEncoding(c.fullName)) : ""),
        aspas(c ? formatCpf(getCpf(c)) : ""),
        aspas(getEventName(r.eventId)),
        aspas(fmtDate(r.requestDate)),
        aspas(fmtDate(r.boardingDate)),
        aspas(r.notes || ""),
      ].join(";");
    });
    baixarCsv(`controle-bagagem-${todayISO()}.csv`, header, linhas);
  };

  const exportarPorColaborador = () => {
    const header = "NOME;CPF;AZUL;GOL;TAM;OUTROS;BAGAGENS;HISTORICO;VALOR TOTAL";
    const linhas = collabRows.map(r => [
      aspas(r.name),
      aspas(r.cpf ? formatCpf(r.cpf) : ""),
      aspas(String(r.byCia.Azul)),
      aspas(String(r.byCia.Gol)),
      aspas(String(r.byCia.TAM)),
      aspas(String(r.byCia.Outros)),
      aspas(String(r.totalBags)),
      aspas(String(r.historyBags)),
      aspas((r.totalCents / 100).toFixed(2).replace(".", ",")),
    ].join(";"));
    baixarCsv(`bagagem-por-colaborador-${todayISO()}.csv`, header, linhas);
  };

  const exportarPorEvento = () => {
    const header = "EVENTO;SOLICITACOES;BAGAGENS;VALOR TOTAL;VALOR MEDIO";
    const linhas = eventRows.map(r => [
      aspas(r.name),
      aspas(String(r.records)),
      aspas(String(r.bags)),
      aspas((r.cents / 100).toFixed(2).replace(".", ",")),
      aspas(r.bags > 0 ? (Math.round(r.cents / r.bags) / 100).toFixed(2).replace(".", ",") : ""),
    ].join(";"));
    baixarCsv(`bagagem-por-evento-${todayISO()}.csv`, header, linhas);
  };

  // ── Casca: a barra da tela aparece em todos os estados ──
  // (carregando, erro, sem acesso): a pessoa sempre sabe onde está, e nada
  // "pula" quando os dados chegam. A mesma casca de Passagens e Hospedagem.
  const casca = (subtitulo: ReactNode, acoes: ReactNode, conteudo: ReactNode) => (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <PageHeader variant="bar" title="Controle de bagagem" subtitle={subtitulo} className="mx-0 mt-0" actions={acoes} />
      {/* `div`, não `main`: o `<main>` é um só e mora no layout. */}
      <div className="px-[var(--page-gutter)] pt-4 pb-6">
        <div className="flex flex-col gap-4 max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );

  // ── Bloqueio local (além do ProtectedRoute) ──
  if (!allowed) {
    return casca(null, null,
      <div className="pas-entra flex flex-col items-center text-center rounded-xl border border-border bg-card px-6 py-14" data-testid="bagagem-sem-acesso">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-muted text-muted-foreground mb-3" aria-hidden="true">
          <Lock className="w-5 h-5" />
        </span>
        <h2 className="m-0 text-base font-semibold text-foreground">Acesso restrito</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          O Controle de Bagagem é restrito aos papéis Administrador e Compras/Viagens.
          Se você precisa deste acesso, fale com o administrador do sistema.
        </p>
      </div>,
    );
  }

  const temFiltroAtivo =
    !!filtros.eventId || filtros.collaboratorIds.length > 0 || filtros.search.trim() !== "" || filtros.cia !== null;

  /** Resumo vivo do recorte, na barra de contexto. */
  const resumoDoTopo = isLoading
    ? "Carregando…"
    : isError
      ? "não foi possível carregar"
      : tab === "solicitacoes"
        ? `${resumo.records} ${resumo.records === 1 ? "solicitação" : "solicitações"} · ${resumo.bags} ${resumo.bags === 1 ? "bagagem" : "bagagens"} · ${formatCurrency(resumo.cents)}`
        : tab === "colaboradores"
          ? `${collabRows.length} ${collabRows.length === 1 ? "colaborador" : "colaboradores"} com bagagem`
          : `${eventRows.length} ${eventRows.length === 1 ? "evento" : "eventos"} · ${eventTotals.bags} ${eventTotals.bags === 1 ? "bagagem" : "bagagens"} · ${formatCurrency(eventTotals.cents)}`;

  const csvDaVisao = tab === "solicitacoes" ? exportarSolicitacoes
    : tab === "colaboradores" ? exportarPorColaborador : exportarPorEvento;
  const csvVazio = tab === "solicitacoes" ? linhasFiltradas.length === 0
    : tab === "colaboradores" ? collabRows.length === 0 : eventRows.length === 0;
  /** O que o CSV leva, por extenso — o botão é um só para as três visões. */
  const oQueExporta = tab === "solicitacoes"
    ? (temFiltroAtivo ? "Exportar as solicitações deste recorte em CSV" : "Exportar as solicitações em CSV")
    : tab === "colaboradores" ? "Exportar os totais por colaborador em CSV" : "Exportar os totais por evento em CSV";

  /** Ir para a lista já recortada por quem foi clicado no relatório. */
  const verSolicitacoesDe = (patch: Partial<FiltrosDaLista>) => {
    setFiltros({ ...FILTROS_VAZIOS, ...patch });
    setTab("solicitacoes");
  };

  /** Totais de cada visão, sem recorte — o número ao lado do nome da aba. */
  const contagensDasAbas = isLoading || isError ? null : {
    solicitacoes: requests.length,
    colaboradores: bagsByCollaborator.size,
    eventos: new Set(requests.map(r => r.eventId)).size,
  };

  const acoes = <>
    <MotivoDesabilitado motivo={csvVazio ? "Nada para exportar nesta visão" : oQueExporta} desabilitado={csvVazio}>
      <button
        type="button"
        onClick={csvDaVisao}
        disabled={csvVazio}
        aria-label={oQueExporta}
        title={csvVazio ? undefined : oQueExporta}
        className="pas-alvo h-[34px] px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium text-slate-700 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
        data-testid="button-csv"
      >
        <Download className="w-4 h-4" aria-hidden="true" />Exportar CSV
      </button>
    </MotivoDesabilitado>

    <button
      type="button"
      onClick={abrirNovo}
      className="pas-alvo h-[34px] px-3.5 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      data-testid="button-new-baggage"
    >
      <Plus className="w-4 h-4" aria-hidden="true" />Nova solicitação
    </button>
  </>;

  return (
    <>
      {casca(
        <span data-testid="resumo-do-recorte">{resumoDoTopo}</span>,
        acoes,
        <>
          <BaggageTabs ativa={tab} onTrocar={setTab} contagens={contagensDasAbas} />

          {tab === "solicitacoes" && (
            <div id="panel-solicitacoes" role="tabpanel" aria-labelledby="tab-solicitacoes" className="pas-entra flex flex-col gap-4">
              {/* Carregando ou com erro, a fila não mostra "0 bagagens" que não são verdade. */}
              {isLoading ? (
                <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i % 2 === 1 ? "border-l border-border" : ""} ${i >= 2 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}>
                      <div className="pas-osso h-3 w-16" />
                      <div className="pas-osso h-5 w-32" />
                    </div>
                  ))}
                </div>
              ) : !isError && requests.length > 0 && (
                <BaggageWorkQueue
                  contagens={contagensPorCia}
                  ativa={filtros.cia}
                  onEscolher={(cia) => setFiltros(f => ({ ...f, cia }))}
                />
              )}

              {!isError && (isLoading || requests.length > 0) && (
                <BaggageFilterBar
                  filtros={filtros}
                  onChange={(patch) => setFiltros(f => ({ ...f, ...patch }))}
                  onClear={() => setFiltros(FILTROS_VAZIOS)}
                  opcoesDeEvento={opcoesDeEvento}
                  opcoesDeColaborador={opcoesDeColaborador}
                  ordem={ordem}
                  onOrdem={setOrdem}
                  resumo={resumo}
                  total={requests.length}
                />
              )}

              <BaggageList
                linhas={linhasFiltradas}
                collabById={collabById}
                getCollabName={getCollabName}
                getEventName={getEventName}
                carregando={isLoading}
                erro={isError}
                onRecarregar={() => refetch()}
                temFiltroAtivo={temFiltroAtivo}
                totalSemFiltro={requests.length}
                onLimparFiltros={() => setFiltros(FILTROS_VAZIOS)}
                onEditar={startEdit}
                onExcluir={setDeleteTarget}
                podeEditar={allowed}
                resumo={resumo}
                ordem={ordem}
                onOrdem={setOrdem}
                onNova={abrirNovo}
              />
            </div>
          )}

          {tab === "colaboradores" && (
            <div id="panel-colaboradores" role="tabpanel" aria-labelledby="tab-colaboradores" className="pas-entra">
              <BaggageByCollaborator
                linhas={collabRows}
                busca={collabTabSearch}
                onBusca={setCollabTabSearch}
                candidatos={collabAddCandidates}
                onAdicionarAoHistorico={(id) => historyMutation.mutate({ collaboratorId: id, cia: "Outros", quantity: 1 })}
                onAjustarHistorico={adjustHistory}
                ajustando={historyMutation.isPending}
                carregando={isLoading}
                erroDeHistorico={historyError}
                onRecarregarHistorico={() => refetchHistory()}
                temHistorico={baggageHistory.length > 0}
                semRegistros={requests.length === 0}
                onVerSolicitacoes={(collaboratorId) => verSolicitacoesDe({ collaboratorIds: [collaboratorId] })}
                onCsv={exportarPorColaborador}
              />
            </div>
          )}

          {tab === "eventos" && (
            <div id="panel-eventos" role="tabpanel" aria-labelledby="tab-eventos" className="pas-entra">
              <BaggageByEvent
                linhas={eventRows}
                busca={eventTabSearch}
                onBusca={setEventTabSearch}
                totais={eventTotals}
                carregando={isLoading}
                semRegistros={requests.length === 0}
                onVerSolicitacoes={(eventId) => verSolicitacoesDe({ eventId })}
                onCsv={exportarPorEvento}
              />
            </div>
          )}
        </>,
      )}

      <BaggageFormModal
        open={formAberto}
        onOpenChange={(v) => { if (!v) fecharForm(); }}
        form={form}
        setForm={setForm}
        errors={errors}
        editing={editing}
        eventOptions={eventOptions}
        colaboradoresAtivos={colaboradoresAtivos}
        colaboradorSelecionado={colaboradorSelecionado}
        agregadoDoColaborador={agregadoDoColaborador}
        locDuplicado={duplicado}
        getCollabName={getCollabName}
        salvando={saveMutation.isPending}
        onSubmit={submit}
      />

      {/* Confirmação de exclusão (soft delete no servidor) */}
      <BaggageDeleteDialog
        alvo={deleteTarget}
        onFechar={() => setDeleteTarget(null)}
        getCollabName={getCollabName}
        getEventName={getEventName}
        onConfirmar={(alvo) => {
          // Excluir o registro aberto no formulário fecharia o modal
          // sobre um id que não existe mais.
          if (editing?.id === alvo.id) fecharForm();
          deleteMutation.mutate(alvo.id);
        }}
      />
    </>
  );
}
