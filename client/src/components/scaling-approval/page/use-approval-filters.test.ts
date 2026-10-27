/**
 * Busca da fila da Aprovação de Escala (28/10): sem acento e sem caixa — o
 * campo promete "Função, evento, #ID, solicitante ou motivo".
 */
import { describe, it, expect } from "vitest";
import type { ChangeRequestItem } from "../types";
import { ALL, filtrarPedidos } from "./use-approval-filters";

const pedido = (over: Partial<ChangeRequestItem>) => ({
  id: "p1", status: "pendente", requestType: "ajuste", createdAt: "2026-10-20T12:00:00Z", canDecide: true,
  functionName: "Hidratação", eventName: "Circuito das Estações", requestedByName: "José Lima", reason: "Troca de horário",
  area: "Logística", inclusionNumber: 4321,
  ...over,
}) as ChangeRequestItem;

const filtros = (search: string) => ({ typeFilter: ALL, search, lateOnly: false, mineOnly: false }) as Parameters<typeof filtrarPedidos>[1];

describe("Aprovação de Escala — busca (28/10)", () => {
  const itens = [pedido({ id: "p1" }), pedido({ id: "p2", functionName: "Kit", eventName: "Night Run", requestedByName: "Ana", reason: "", area: "Kit", inclusionNumber: 99 })];
  it("acha sem acento: função, evento, solicitante", () => {
    expect(filtrarPedidos(itens, filtros("hidratacao")).map((r) => r.id)).toEqual(["p1"]);
    expect(filtrarPedidos(itens, filtros("estacoes")).map((r) => r.id)).toEqual(["p1"]);
    expect(filtrarPedidos(itens, filtros("JOSE")).map((r) => r.id)).toEqual(["p1"]);
    expect(filtrarPedidos(itens, filtros("logistica")).map((r) => r.id)).toEqual(["p1"]);
  });
  it("#ID continua achando", () => {
    expect(filtrarPedidos(itens, filtros("#99")).map((r) => r.id)).toEqual(["p2"]);
  });
});
