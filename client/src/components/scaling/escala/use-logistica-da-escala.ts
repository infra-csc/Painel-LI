/**
 * Logística do quadro da aba Escala (23/10).
 *
 * Passagens e hospedagens já vêm carregadas pela Escalação (as mesmas listas
 * que a fila e o modal usam). O transporte terrestre (carro/van) não vinha:
 * aqui ele é lido do endpoint que Passagens já usa, com a MESMA chave de cache
 * (`["/api/tickets", "terrestres", …]`) — registrar um carro em Passagens
 * invalida "/api/tickets" e o quadro se atualiza junto. Só busca com a aba
 * Escala aberta.
 *
 * A conta é a regra pura de shared/logistica-da-escala.ts.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Accommodation, TeamInclusion, Ticket } from "@shared/schema";
import { resumirLogistica, type FontesDaLogistica, type ResumoDaLogistica } from "@shared/logistica-da-escala";
import type { TrechoTerrestre } from "@shared/transporte-terrestre";
import { fetchJson } from "@/lib/queryClient";
import { comoTrechoTerrestre, type TerrestreLido } from "@/components/tickets/use-transporte-terrestre";

const NADA: readonly never[] = [];

export interface EntradaDaLogistica {
  /** As vagas do quadro (o recorte da tela). Canceladas são ignoradas pela regra. */
  linhas: readonly TeamInclusion[];
  tickets: readonly Ticket[] | undefined;
  accommodations: readonly Accommodation[] | undefined;
  /** Um evento marcado: busca só o terrestre dele. */
  eventId: string | null;
  /** Recorte "Futuros": só os eventos que não terminaram. */
  futuros: boolean;
  habilitado: boolean;
}

export interface LogisticaDaEscala {
  resumo: ResumoDaLogistica;
  /** O terrestre ainda não chegou: a coluna Carro/van mostra "carregando". */
  carregandoTerrestre: boolean;
  erroTerrestre: boolean;
  fontes: FontesDaLogistica;
}

export function useLogisticaDaEscala({ linhas, tickets, accommodations, eventId, futuros, habilitado }: EntradaDaLogistica): LogisticaDaEscala {
  const chave = eventId ? ["/api/tickets", "terrestres", { eventId }] : futuros ? ["/api/tickets", "terrestres", { futuros: true }] : ["/api/tickets", "terrestres"];
  const url = eventId ? `/api/transportes-terrestres?eventId=${encodeURIComponent(eventId)}` : futuros ? "/api/transportes-terrestres?futuros=1" : "/api/transportes-terrestres";
  const terrestres = useQuery<TerrestreLido[]>({
    queryKey: chave,
    queryFn: ({ signal }) => fetchJson<TerrestreLido[]>(url, signal),
    enabled: habilitado,
    staleTime: 60_000,
  });

  const fontes = useMemo<FontesDaLogistica>(() => {
    const passagens = new Map<string, Ticket[]>();
    const saiDe = new Map<string, Ticket>();
    for (const t of tickets ?? []) {
      if (!t.teamInclusionId || t.archivedAt) continue;
      const lista = passagens.get(t.teamInclusionId) ?? [];
      lista.push(t);
      passagens.set(t.teamInclusionId, lista);
      if (t.idaVemDeInclusionId && !saiDe.has(t.idaVemDeInclusionId)) saiDe.set(t.idaVemDeInclusionId, t);
    }
    const hospedagens = new Map<string, Accommodation[]>();
    for (const a of accommodations ?? []) {
      if (!a.teamInclusionId) continue;
      const lista = hospedagens.get(a.teamInclusionId) ?? [];
      lista.push(a);
      hospedagens.set(a.teamInclusionId, lista);
    }
    const porVaga = new Map<string, TrechoTerrestre[]>();
    for (const r of terrestres.data ?? []) {
      const lista = porVaga.get(r.teamInclusionId) ?? [];
      lista.push(comoTrechoTerrestre(r));
      porVaga.set(r.teamInclusionId, lista);
    }
    return {
      passagensDe: (id) => passagens.get(id) ?? NADA,
      passagemQueSaiDe: (id) => saiDe.get(id),
      hospedagensDe: (id) => hospedagens.get(id) ?? NADA,
      terrestresDe: (id) => porVaga.get(id) ?? NADA,
    };
  }, [tickets, accommodations, terrestres.data]);

  const resumo = useMemo(() => resumirLogistica(linhas, fontes), [linhas, fontes]);

  return {
    resumo,
    fontes,
    carregandoTerrestre: habilitado && terrestres.isLoading,
    erroTerrestre: terrestres.isError && !terrestres.data,
  };
}
