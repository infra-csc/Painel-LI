/**
 * Dados do Painel da escala (30/10) — as MESMAS consultas e regras da
 * Escalação, sem os filtros dela.
 *
 * - Vagas, eventos, funções, colaboradores, passagens, hospedagens, trocas e
 *   pedidos: `useScalingData` com os filtros padrão (mesmas chaves de cache —
 *   abrir o painel depois da Escalação não vai ao servidor de novo), já com o
 *   recorte de quem vê o quê.
 * - Vagas na Validação/Aprovação: `/api/team-inclusions?phase=sugestao`, com
 *   o mesmo filtro das Análises (use-scaling-recorte.ts): sem excluídas nem
 *   negadas, evento não excluído, e a área de função só nas suas funções.
 * - O contexto das Análises é montado com as mesmas regras de
 *   use-scaling-recorte.ts (nome = colaborador ou empreita; hotel reservado =
 *   hospedagem com hotel e não cancelada; passagem = comprada).
 * - Quem age: validadores/aprovadores cadastrados no módulo de Escala
 *   (Funções → Responsáveis da Escala), com nome de /api/users; sem cadastro,
 *   o responsável da função (`getResponsavelDaFuncao`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/role-utils";
import { fixEncoding } from "@/lib/utils";
import { vagaComEmpreita } from "@shared/cenotecnica-empreita";
import { SUGESTAO_STATUS } from "@shared/scaling-validation-rules";
import type { TeamInclusion } from "@shared/schema";
import { DEFAULT_SCALING_FILTERS, useScalingData } from "@/components/scaling/use-scaling-data";
import { analisarPorEvento } from "@/components/scaling/scaling-analytics-data";
import { useDiasDosPrazos } from "@/components/scaling/scaling-analytics-quadro";
import type { ContextoDaComparacao, ContextoDoPainel, TipoDeEspera, TipoDoColaborador } from "./painel-escala-dados";

export const CHAVE_SUGESTOES = ["/api/team-inclusions?phase=sugestao"];

/** "Hoje" que vira à meia-noite — a tela fica aberta por dias. */
function useHoje(): Date {
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setHoje((atual) => (atual.toDateString() === new Date().toDateString() ? atual : new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return hoje;
}

export function usePainelEscala() {
  const { user } = useAuth();
  const hoje = useHoje();
  const dias = useDiasDosPrazos();
  const data = useScalingData({ filters: DEFAULT_SCALING_FILTERS, sortConfig: null, user });
  const podeVerValores = hasPermission(user ?? null, "canAccessFinanceiro");

  const sugestoesQ = useQuery<TeamInclusion[]>({ queryKey: CHAVE_SUGESTOES, staleTime: 60_000 });
  const escalaManagersQ = useQuery<{ functionId: string; userId: string; role: "validador" | "aprovador" }[]>({
    queryKey: ["/api/scaling-function-managers"], staleTime: 300_000, enabled: !!user,
  });
  // /api/users: admin, RH, Compras e Logística — os mesmos papéis que abrem os Painéis.
  const usuariosQ = useQuery<{ id: string; name: string }[]>({ queryKey: ["/api/users"], staleTime: 300_000, enabled: !!user });

  const sugestoes = useMemo(() => {
    const veemTodas = ["production", "function_area", "purchasing", "financial"];
    return (sugestoesQ.data ?? []).filter((i) => {
      if (i.deletedAt || i.status === SUGESTAO_STATUS.NEGADA) return false;
      const ev = data.eventById.get(i.eventId);
      if (!ev || ev.status === "excluído" || ev.status === "excluido") return false;
      return data.isAdminRole || veemTodas.includes(String(user?.role ?? "")) || data.userFunctionIds.has(i.functionId);
    });
  }, [sugestoesQ.data, data.eventById, data.isAdminRole, data.userFunctionIds, user?.role]);

  const vagasComHotel = useMemo(() => {
    const s = new Set<string>();
    (data.accommodations || []).forEach((a) => {
      if (a.teamInclusionId && a.hotelName?.trim() && a.hotelStatus !== "cancelada") s.add(a.teamInclusionId);
    });
    return s;
  }, [data.accommodations]);

  const nomeDoUsuario = useMemo(() => new Map((usuariosQ.data ?? []).map((u) => [u.id, fixEncoding(u.name) || u.name])), [usuariosQ.data]);
  const cadastroDaEscala = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of escalaManagersQ.data ?? []) {
      const nome = nomeDoUsuario.get(r.userId);
      if (!nome) continue;
      const k = `${r.role}:${r.functionId}`;
      const l = m.get(k) ?? [];
      if (!l.includes(nome)) l.push(nome);
      m.set(k, l);
    }
    return m;
  }, [escalaManagersQ.data, nomeDoUsuario]);

  // Pela ref (como em use-scaling-recorte): a função é recriada a cada render.
  const responsavel = useRef(data.getResponsavelDaFuncao);
  responsavel.current = data.getResponsavelDaFuncao;

  const ctx = useMemo<ContextoDoPainel>(() => {
    const doCadastro = (papel: "validador" | "aprovador", functionId: string) => cadastroDaEscala.get(`${papel}:${functionId}`) ?? [];
    const daFuncao = (functionId: string) => {
      const r = responsavel.current(functionId);
      return r ? [r] : [];
    };
    const quemAge = (tipo: TipoDeEspera, functionId: string): string[] => {
      switch (tipo) {
        case "validacao": { const v = doCadastro("validador", functionId); return v.length ? v : daFuncao(functionId); }
        case "aprovacao":
        case "ajuste": { const a = doCadastro("aprovador", functionId); return a.length ? a : ["Administrador"]; }
        case "gestor": { const a = doCadastro("aprovador", functionId); return a.length ? a : ["Gestor da cenotécnica"]; }
        case "troca": return ["Compras"];
        default: return [];
      }
    };
    return {
      temNome: (i) => !!i.collaboratorId || vagaComEmpreita(i),
      temTroca: (i) => data.pendingSwapByInclusion.has(i.id),
      temPedido: (i) => !!data.pendingChangeByInclusion?.get(i.id),
      getEventName: data.getEventName,
      getFunctionName: data.getFunctionName,
      getCollaboratorName: data.getCollaboratorName,
      getEventDates: (id) => (id ? data.eventById.get(id) : undefined),
      temPassagem: (i) => data.purchasedTicketByInclusion.has(i.id),
      temHotel: (i) => vagasComHotel.has(i.id),
      getResponsavelDaFuncao: (functionId) => responsavel.current(functionId),
      quemAge,
      desdeDaTroca: (i) => data.pendingSwapByInclusion.get(i.id)?.createdAt ?? null,
      desdeDoPedido: (i) => data.pendingChangeByInclusion?.get(i.id)?.createdAt ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.pendingSwapByInclusion, data.pendingChangeByInclusion, data.eventById, data.functionById, data.collaboratorById, data.purchasedTicketByInclusion, vagasComHotel, cadastroDaEscala]);

  const ctxComparacao = useMemo<ContextoDaComparacao>(() => ({
    temNome: ctx.temNome,
    getFunctionName: ctx.getFunctionName,
    tipoDoColaborador: (id) => (id ? (data.collaboratorById.get(id)?.type as TipoDoColaborador) : null),
  }), [ctx, data.collaboratorById]);

  /** Escalação + Validação/Aprovação, todas as vivas (o cálculo tira canceladas). */
  const todas = useMemo(() => [...data.filteredTeamInclusions, ...sugestoes], [data.filteredTeamInclusions, sugestoes]);
  const eventos = useMemo(() => analisarPorEvento(todas, ctx, hoje), [todas, ctx, hoje]);

  const carregando = (data.isLoading && !data.teamInclusions) || (sugestoesQ.isLoading && !sugestoesQ.data);
  const erro = (data.isErrorInclusions && !data.teamInclusions) || (sugestoesQ.isError && !sugestoesQ.data);

  return {
    user, hoje, dias, ctx, ctxComparacao, todas, eventos, podeVerValores,
    events: data.events ?? [], eventById: data.eventById,
    carregando, erro, atualizando: data.isFetchingInclusions || sugestoesQ.isFetching,
  };
}

export type PainelEscala = ReturnType<typeof usePainelEscala>;
