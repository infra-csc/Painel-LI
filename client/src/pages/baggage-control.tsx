import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { normalizeRole } from "@shared/roles";
import { fixEncoding } from "@/lib/utils";
import { usePageTitle } from "@/components/common/use-page-title";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, ClipboardList, Download, Lock, Plus, Users } from "lucide-react";
import type { OpcaoDeFiltro } from "@/components/common/filter-popover";
import {
  ERROR_FIELD_IDS, ciaGroup, emptyForm, fmtDate, formatCpf, formatCurrency, getCpf, toTitleCase, todayISO,
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

const ABAS: { id: TabId; label: string; icon: typeof ClipboardList }[] = [
  { id: "solicitacoes", label: "Solicitações", icon: ClipboardList },
  { id: "colaboradores", label: "Por colaborador", icon: Users },
  { id: "eventos", label: "Resumo por evento", icon: CalendarDays },
];

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
  usePageTitle("Controle de Bagagem");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const role = normalizeRole(user?.role);
  const allowed = role === "admin" || role === "purchasing";

  const [tab, setTab] = useState<TabId>("solicitacoes");
  const [filtros, setFiltros] = useState<FiltrosDaLista>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);

  // Buscas das abas 2 e 3
  const [collabTabSearch, setCollabTabSearch] = useState("");
  const [eventTabSearch, setEventTabSearch] = useState("");

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

  const getCollabName = (id: string) => toTitleCase(fixEncoding(collabById.get(id)?.fullName || "")) || "—";
  const getEventName = (id: string) => fixEncoding(eventById.get(id)?.name || "") || "—";

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
      id: c.id, nome: toTitleCase(fixEncoding(c.fullName)) || "—", n: n.get(c.id) ?? 0,
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
      .map(([eventId, agg]) => ({ eventId, name: getEventName(eventId), ...agg }))
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.cents - a.cents);
  }, [requests, eventById, eventTabSearch]);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      toast({ title: editing ? "Solicitação atualizada" : "Solicitação registrada" });
      fecharForm();
    },
    onError: (e: any) => toast({
      title: "Erro",
      description: e?.body?.message || "Erro ao salvar a solicitação",
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/baggage-requests/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/baggage-requests"] });
      toast({ title: "Solicitação excluída" });
    },
    onError: (e: any) => toast({
      title: "Erro",
      description: e?.body?.message || "Erro ao excluir a solicitação",
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
    onError: (e: any, _p, ctxMut) => {
      if (ctxMut?.prev) qc.setQueryData(["/api/baggage-history"], ctxMut.prev);
      toast({ title: "Erro ao ajustar o histórico", description: e?.body?.message || "Tente novamente.", variant: "destructive" });
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
    setForm({ ...emptyForm });
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

  // ── Bloqueio local (além do ProtectedRoute) ──
  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-10 max-w-md text-center">
          <Lock className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-800">Sem acesso</h2>
          <p className="text-[13px] text-[#64748B] mt-2">
            O Controle de Bagagem é restrito aos papéis Administrador e Compras/Viagens.
            Se você precisa deste acesso, fale com o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const temFiltroAtivo =
    !!filtros.eventId || filtros.collaboratorIds.length > 0 || filtros.search.trim() !== "" || filtros.cia !== null;

  /** Resumo vivo do recorte, na barra de contexto. */
  const resumoDoTopo = tab === "solicitacoes"
    ? `${resumo.records} ${resumo.records === 1 ? "solicitação" : "solicitações"} · ${resumo.bags} ${resumo.bags === 1 ? "bagagem" : "bagagens"} · ${formatCurrency(resumo.cents)}`
    : tab === "colaboradores"
      ? `${collabRows.length} ${collabRows.length === 1 ? "colaborador" : "colaboradores"} com bagagem`
      : `${eventRows.length} ${eventRows.length === 1 ? "evento" : "eventos"} · ${eventTotals.bags} ${eventTotals.bags === 1 ? "bagagem" : "bagagens"} · ${formatCurrency(eventTotals.cents)}`;

  const csvDaVisao = tab === "solicitacoes" ? exportarSolicitacoes
    : tab === "colaboradores" ? exportarPorColaborador : exportarPorEvento;
  const csvVazio = tab === "solicitacoes" ? linhasFiltradas.length === 0
    : tab === "colaboradores" ? collabRows.length === 0 : eventRows.length === 0;

  /** Ir para a lista já recortada por quem foi clicado no relatório. */
  const verSolicitacoesDe = (patch: Partial<FiltrosDaLista>) => {
    setFiltros({ ...FILTROS_VAZIOS, ...patch });
    setTab("solicitacoes");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/*
          Barra de contexto: onde estou, o que estou vendo e as ações. Substitui
          o cabeçalho de página, o card de total no canto e o card solto de abas
          — três faixas para dizer o que agora cabe em uma.
        */}
        <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#F8FAFC]/95 backdrop-blur flex items-center gap-3 flex-wrap">
          <h1 className="text-[15px] font-semibold text-slate-900 whitespace-nowrap">Controle de Bagagem</h1>
          <span className="w-px h-5 bg-border shrink-0" aria-hidden="true" />
          <p className="text-[12px] text-[#64748B] truncate" aria-live="polite" data-testid="resumo-do-recorte">
            {resumoDoTopo}
          </p>

          <div
            role="tablist"
            aria-label="Seções do Controle de Bagagem"
            className="ml-auto inline-flex items-center gap-0.5 h-[34px] p-0.5 rounded-lg border border-border bg-card shrink-0"
          >
            {ABAS.map(t => {
              const Icone = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-md text-[12px] font-medium transition-colors ${
                    on ? "bg-brand-soft text-primary" : "text-[#64748B] hover:bg-slate-50"
                  }`}
                  data-testid={`tab-${t.id}`}
                >
                  <Icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={csvDaVisao}
            disabled={csvVazio}
            title="Exportar a visão atual em CSV"
            aria-label="Exportar a visão atual em CSV"
            className="h-[34px] px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="button-csv"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> CSV
          </button>

          <button
            type="button"
            onClick={abrirNovo}
            className="h-[34px] px-3.5 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-[13px] font-semibold transition-colors"
            data-testid="button-new-baggage"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Nova solicitação
          </button>
        </div>

        {tab === "solicitacoes" && (
          <div id="panel-solicitacoes" role="tabpanel" aria-labelledby="tab-solicitacoes" className="space-y-4">
            <BaggageWorkQueue
              contagens={contagensPorCia}
              ativa={filtros.cia}
              onEscolher={(cia) => setFiltros(f => ({ ...f, cia }))}
            />

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
            />
          </div>
        )}

        {tab === "colaboradores" && (
          <div id="panel-colaboradores" role="tabpanel" aria-labelledby="tab-colaboradores">
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
          <div id="panel-eventos" role="tabpanel" aria-labelledby="tab-eventos">
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
        <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir solicitação de bagagem?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget && (
                  <>
                    LOC <span className="font-mono font-semibold">{deleteTarget.loc}</span> ({deleteTarget.cia}) —{" "}
                    {getCollabName(deleteTarget.collaboratorId)}, {formatCurrency(deleteTarget.valueCents || 0)},
                    embarque em {fmtDate(deleteTarget.boardingDate)}.
                    {" "}A exclusão fica registrada na auditoria.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-lg bg-[#B91C1C] hover:bg-[#991B1B]"
                onClick={() => {
                  if (deleteTarget) {
                    // Excluir o registro aberto no formulário fecharia o modal
                    // sobre um id que não existe mais.
                    if (editing?.id === deleteTarget.id) fecharForm();
                    deleteMutation.mutate(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
                data-testid="button-confirm-delete"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
