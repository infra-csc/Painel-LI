/**
 * Nome do evento pelo id, lido do cache de `/api/events` (09/10 — trecho
 * direto: as indicações "vem direto de / segue para" guardam o id do evento).
 * As telas que mostram essas indicações já carregam a lista de eventos; sem o
 * cache, devolve "outro evento" em vez do id cru.
 */
import { queryClient } from "@/lib/queryClient";
import type { Event } from "@shared/schema";

export function nomeDoEventoNoCache(id: string | null | undefined): string {
  if (!id) return "outro evento";
  const eventos = queryClient.getQueryData<Event[]>(["/api/events"]);
  return eventos?.find((e) => e.id === id)?.name ?? "outro evento";
}
