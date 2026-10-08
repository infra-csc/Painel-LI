/**
 * Barras de uma semana do Mês — função pura (07/10, junto do redesenho).
 * `.tsx` porque `week-bars` importa de `calendar-shared.tsx` (JSX): roda no
 * projeto "componentes", que tem o plugin React.
 *
 * Garante a distribuição em faixas sem sobreposição, o corte nas bordas da
 * semana (isStart/isEnd decidem a quina arredondada) e a deduplicação.
 */
import { describe, expect, it } from "vitest";
import type { Event } from "@shared/schema";
import { computeWeekBars } from "./week-bars";

const ev = (id: string, startDate: string, endDate: string) => ({ id, name: id, location: "", startDate, endDate, status: "planejado" }) as unknown as Event;
// Semana de domingo 11/10/2026 a sábado 17/10/2026 (a grade do Mês começa no domingo).
const semana = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 11 + i));

describe("computeWeekBars", () => {
  it("evento dentro da semana: colunas certas, começa e termina nela", () => {
    const [b] = computeWeekBars(semana, [ev("a", "2026-10-13", "2026-10-15")]);
    expect(b).toMatchObject({ startCol: 2, endCol: 4, lane: 0, isStart: true, isEnd: true });
  });

  it("evento que atravessa as bordas: cortado em 0 e 6, sem começo nem fim na semana", () => {
    const [b] = computeWeekBars(semana, [ev("a", "2026-10-06", "2026-10-21")]);
    expect(b).toMatchObject({ startCol: 0, endCol: 6, isStart: false, isEnd: false });
  });

  it("sobrepostos vão para faixas diferentes; quem cabe depois reaproveita a faixa", () => {
    const bars = computeWeekBars(semana, [
      ev("longo", "2026-10-11", "2026-10-14"),
      ev("junto", "2026-10-12", "2026-10-13"),
      ev("depois", "2026-10-16", "2026-10-17"),
    ]);
    const faixa = Object.fromEntries(bars.map(b => [b.event.id, b.lane]));
    expect(faixa).toEqual({ longo: 0, junto: 1, depois: 0 });
  });

  it("ignora eventos fora da semana e repetidos", () => {
    const a = ev("a", "2026-10-12", "2026-10-12");
    const bars = computeWeekBars(semana, [a, a, ev("fora", "2026-10-20", "2026-10-21")]);
    expect(bars.map(b => b.event.id)).toEqual(["a"]);
  });
});
