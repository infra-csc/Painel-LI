/**
 * Rascunho do Planejado no servidor (08/10): carrega do servidor, migra o
 * rascunho antigo do localStorage, cai para o local quando o servidor falha,
 * grava com atraso e manda o pendente ao trocar de evento.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { criarWrapper } from "@/test/render";
import { mockarFetch, respostaJson } from "@/test/fixtures";
import { draftStorageKey, useBudgetDraft } from "./use-budget-draft";
import type { BudgetOverrides } from "@/components/budget/types";

const USUARIO = "user-ana";
const doServidor: BudgetOverrides = { "vaga-1": { inclusionId: "vaga-1", valorDiaria: 250 } };
const doLocal: BudgetOverrides = { "vaga-9": { inclusionId: "vaga-9", mobilidade: 40 } };

type Chamada = { metodo: string; url: string; corpo: unknown };

/** Servidor falso do rascunho: um mapa por evento + o registro das chamadas. */
function servidorDoRascunho(opcoes: { inicial?: Record<string, BudgetOverrides>; fora?: boolean } = {}) {
  const banco = new Map(Object.entries(opcoes.inicial ?? {}));
  const chamadas: Chamada[] = [];
  const estado = { fora: !!opcoes.fora };
  mockarFetch((url, init) => {
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    chamadas.push({ metodo, url, corpo });
    if (estado.fora) throw new TypeError("Failed to fetch");
    const eventId = new URL(url, "http://localhost").searchParams.get("eventId") ?? "";
    if (metodo === "GET") {
      const o = banco.get(eventId);
      return respostaJson(o ? { overrides: o, updatedAt: "2026-10-08T17:20:00.000Z" } : { overrides: {} });
    }
    if (metodo === "PUT") {
      banco.set(eventId, (corpo as { overrides: BudgetOverrides }).overrides);
      return respostaJson({ overrides: banco.get(eventId), updatedAt: "2026-10-08T17:21:00.000Z" });
    }
    banco.delete(eventId);
    return new Response(null, { status: 204 });
  });
  return { banco, chamadas, estado, gravacoes: () => chamadas.filter((c) => c.metodo !== "GET") };
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function montar(eventId = "evt-1") {
  const { Wrapper } = criarWrapper();
  return renderHook(({ ev }) => useBudgetDraft(ev, USUARIO), { wrapper: Wrapper, initialProps: { ev: eventId } });
}

afterEach(() => localStorage.clear());

describe("useBudgetDraft — rascunho no servidor (08/10)", () => {
  it("carrega o rascunho do servidor: ajustes de volta, aviso de restaurado e selo com a hora", async () => {
    const srv = servidorDoRascunho({ inicial: { "evt-1": doServidor } });
    const { result } = montar();
    expect(result.current.draftStatus).toBe("carregando");

    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"));
    expect(result.current.budgetOverrides).toEqual(doServidor);
    expect(result.current.draftRestored).toBe(true);
    expect(result.current.draftSavedAt).toBe(hora("2026-10-08T17:20:00.000Z"));
    expect(srv.chamadas[0]).toMatchObject({ metodo: "GET", url: "/api/budget-planned/rascunho?eventId=evt-1" });
    // O que acabou de chegar não é regravado.
    await new Promise((r) => setTimeout(r, 900));
    expect(srv.gravacoes()).toHaveLength(0);
  });

  it("migra: rascunho no localStorage com o servidor vazio sobe e o local é apagado", async () => {
    localStorage.setItem(draftStorageKey("evt-1", USUARIO), JSON.stringify(doLocal));
    const srv = servidorDoRascunho();
    const { result } = montar();

    await waitFor(() => expect(result.current.budgetOverrides).toEqual(doLocal));
    expect(result.current.draftRestored).toBe(true);
    await waitFor(() => expect(srv.gravacoes()).toHaveLength(1), { timeout: 2000 });
    expect(srv.gravacoes()[0]).toMatchObject({ metodo: "PUT", corpo: { overrides: doLocal } });
    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"));
    expect(localStorage.getItem(draftStorageKey("evt-1", USUARIO))).toBeNull();
    expect(srv.banco.get("evt-1")).toEqual(doLocal);
  });

  it("servidor com rascunho manda: o local mais velho é descartado sem subir", async () => {
    localStorage.setItem(draftStorageKey("evt-1", USUARIO), JSON.stringify(doLocal));
    const srv = servidorDoRascunho({ inicial: { "evt-1": doServidor } });
    const { result } = montar();
    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"));
    expect(result.current.budgetOverrides).toEqual(doServidor);
    expect(localStorage.getItem(draftStorageKey("evt-1", USUARIO))).toBeNull();
    expect(srv.gravacoes()).toHaveLength(0);
  });

  it("servidor fora: usa o rascunho deste navegador, avisa e guarda as edições no localStorage", async () => {
    localStorage.setItem(draftStorageKey("evt-1", USUARIO), JSON.stringify(doLocal));
    const srv = servidorDoRascunho({ fora: true });
    const { result } = montar();

    await waitFor(() => expect(result.current.draftStatus).toBe("local"));
    expect(result.current.budgetOverrides).toEqual(doLocal);
    expect(result.current.draftRestored).toBe(true);

    const editado = { ...doLocal, "vaga-2": { inclusionId: "vaga-2", valorDiaria: 300 } };
    act(() => result.current.setBudgetOverrides(editado));
    expect(result.current.draftStatus).toBe("salvando");
    await waitFor(() => expect(result.current.draftStatus).toBe("local"), { timeout: 2000 });
    expect(JSON.parse(localStorage.getItem(draftStorageKey("evt-1", USUARIO))!)).toEqual(editado);

    // O servidor volta: a próxima gravação sobe tudo e apaga a reserva.
    srv.estado.fora = false;
    act(() => result.current.clearDraftEntries(["vaga-9"]));
    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"), { timeout: 2000 });
    expect(srv.banco.get("evt-1")).toEqual({ "vaga-2": { inclusionId: "vaga-2", valorDiaria: 300 } });
    expect(localStorage.getItem(draftStorageKey("evt-1", USUARIO))).toBeNull();
    expect(result.current.draftSavedAt).toBe(hora("2026-10-08T17:21:00.000Z"));
  });

  it("grava UMA vez depois da última edição (atraso de ~800 ms) e o vazio apaga no servidor", async () => {
    const srv = servidorDoRascunho();
    const { result } = montar();
    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"));

    act(() => result.current.setBudgetOverrides({ "v1": { inclusionId: "v1", valorDiaria: 1 } }));
    act(() => result.current.setBudgetOverrides((p) => ({ ...p, "v2": { inclusionId: "v2", valorDiaria: 2 } })));
    await new Promise((r) => setTimeout(r, 300));
    expect(srv.gravacoes()).toHaveLength(0);
    await waitFor(() => expect(srv.gravacoes()).toHaveLength(1), { timeout: 2000 });
    expect(Object.keys((srv.gravacoes()[0].corpo as { overrides: BudgetOverrides }).overrides)).toEqual(["v1", "v2"]);

    // Descartar tudo (o "Descartar" da página) apaga o rascunho do servidor.
    act(() => { result.current.setBudgetOverrides({}); result.current.setDraftRestored(false); });
    await waitFor(() => expect(srv.gravacoes()).toHaveLength(2), { timeout: 2000 });
    expect(srv.gravacoes()[1].metodo).toBe("DELETE");
    await waitFor(() => expect(result.current.draftSavedAt).toBeNull());
  });

  it("trocar de evento grava na hora o pendente no evento ANTERIOR e carrega o do novo", async () => {
    const srv = servidorDoRascunho({ inicial: { "evt-2": doServidor } });
    const { result, rerender } = montar("evt-1");
    await waitFor(() => expect(result.current.draftStatus).toBe("salvo"));

    act(() => result.current.setBudgetOverrides(doLocal));
    rerender({ ev: "evt-2" });

    await waitFor(() => expect(result.current.budgetOverrides).toEqual(doServidor));
    await waitFor(() => expect(srv.banco.get("evt-1")).toEqual(doLocal));
    const put = srv.gravacoes().find((c) => c.metodo === "PUT");
    expect(put?.url).toContain("eventId=evt-1");
    expect(srv.banco.get("evt-2")).toEqual(doServidor);
  });
});
