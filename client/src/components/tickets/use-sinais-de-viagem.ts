// Sinais de viagem da tela de Passagens (09/10): viagem que cruza outra, data
// impossível e trecho direto entre eventos (confirmado, indicado ou sugerido).
// O cálculo é do servidor (GET /api/tickets/sinais-de-viagem — regra única em
// shared/janela-de-viagem.ts): a vaga do OUTRO evento do colaborador quase
// nunca está no recorte da tela, e é ela que decide.
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/queryClient";
import type { SinaisDeViagem, SinalDeViagem } from "@shared/janela-de-viagem";

export type { SinalDeViagem };

/** Recorte "?conflito=" que a Pendências usa para abrir a lista. */
export type RecorteDeConflito = "viagem" | "data";

export const SINAIS_DE_VIAGEM_KEY = ["/api/tickets", "sinais-de-viagem"] as const;

const VAZIO: Record<string, SinalDeViagem> = {};

/**
 * Só para quem registra passagem (admin, Compras, Produção) — o servidor
 * recusa os outros papéis. A chave começa com "/api/tickets": registrar ou
 * editar passagem já invalida.
 */
export function useSinaisDeViagem(habilitado: boolean) {
  const q = useQuery<SinaisDeViagem>({
    queryKey: SINAIS_DE_VIAGEM_KEY,
    queryFn: ({ signal }) => fetchJson<SinaisDeViagem>("/api/tickets/sinais-de-viagem", signal),
    enabled: habilitado,
    staleTime: 60_000,
  });
  return { porVaga: q.data?.porVaga ?? VAZIO, totais: q.data?.totais ?? null, carregando: q.isLoading && habilitado };
}

/** A vaga entra no recorte "?conflito="? */
export function passaNoRecorteDeConflito(sinal: SinalDeViagem | undefined, recorte: RecorteDeConflito | null): boolean {
  if (!recorte) return true;
  if (recorte === "viagem") return !!sinal?.cruzaCom?.length;
  return !!sinal?.dataImpossivel;
}

/** "?conflito=viagem|data" → recorte (ou null). */
export function recorteDaUrl(search: string): RecorteDeConflito | null {
  const v = new URLSearchParams(search).get("conflito");
  return v === "viagem" || v === "data" ? v : null;
}

/** "25/10" a partir de "AAAA-MM-DD". */
export function diaCurto(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}` : "";
}
