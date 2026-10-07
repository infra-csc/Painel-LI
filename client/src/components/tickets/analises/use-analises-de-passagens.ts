/**
 * Consulta da aba Análises de passagens (07/10) — só admin.
 *
 * Os filtros da aba são DELA (não os da Lista): período pelo início do
 * evento, evento, companhia e transporte. O cálculo é do servidor
 * (shared/analise-de-passagens.ts); aqui só montamos a URL e guardamos o
 * último resultado na tela enquanto o próximo chega — trocar um filtro não
 * apaga a aba inteira para mostrar o esqueleto de novo.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import { somarMeses, type AnaliseDePassagens } from "@shared/analise-de-passagens";

export type PresetDoPeriodo = "padrao" | "proximos" | "12m" | "ano" | "tudo" | "custom";

export const PRESETS_DO_PERIODO: { id: PresetDoPeriodo; nome: string }[] = [
  { id: "padrao", nome: "Últimos 3 meses e próximos" },
  { id: "proximos", nome: "Só os próximos eventos" },
  { id: "12m", nome: "Últimos 12 meses" },
  { id: "ano", nome: "Este ano" },
  { id: "tudo", nome: "Todo o histórico" },
  { id: "custom", nome: "Datas exatas" },
];

export interface FiltrosDaAba {
  preset: PresetDoPeriodo;
  /** Só no preset "custom". "AAAA-MM-DD"; vazio deixa a ponta aberta. */
  de: string;
  ate: string;
  /** "all" = todos. */
  eventId: string;
  /** Chave normalizada; "all" = todas; "" = sem companhia. */
  companhia: string;
  /** "all" = todos; "" = não informado. */
  transporte: string;
}

export const FILTROS_PADRAO: FiltrosDaAba = { preset: "padrao", de: "", ate: "", eventId: "all", companhia: "all", transporte: "all" };

export function temRecorte(f: FiltrosDaAba): boolean {
  return f.preset !== "padrao" || f.eventId !== "all" || f.companhia !== "all" || f.transporte !== "all";
}

/** O período que vai para o servidor. `hoje` em "AAAA-MM-DD" (São Paulo). */
export function periodoDoFiltro(f: FiltrosDaAba, hoje: string): { de: string | null; ate: string | null } {
  switch (f.preset) {
    case "padrao": return { de: somarMeses(hoje, -3), ate: null };
    case "proximos": return { de: hoje, ate: null };
    case "12m": return { de: somarMeses(hoje, -12), ate: hoje };
    case "ano": return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    case "tudo": return { de: null, ate: null };
    case "custom": return { de: f.de || null, ate: f.ate || null };
  }
}

export function urlDaAnalise(f: FiltrosDaAba, hoje: string): string {
  const p = new URLSearchParams();
  const { de, ate } = periodoDoFiltro(f, hoje);
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (f.eventId !== "all") p.set("eventId", f.eventId);
  if (f.companhia !== "all") p.set("companhia", f.companhia);
  if (f.transporte !== "all") p.set("transporte", f.transporte);
  const qs = p.toString();
  return `/api/tickets/analises${qs ? `?${qs}` : ""}`;
}

export function useAnalisesDePassagens(f: FiltrosDaAba, hoje: string) {
  const url = urlDaAnalise(f, hoje);
  // Datas exatas com a inicial depois da final: nem pergunta ao servidor.
  const invalido = f.preset === "custom" && !!f.de && !!f.ate && f.de > f.ate;
  return useQuery<AnaliseDePassagens>({
    queryKey: ["/api/tickets/analises", url],
    queryFn: ({ signal }) => fetchJson<AnaliseDePassagens>(url, signal),
    enabled: !invalido,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
