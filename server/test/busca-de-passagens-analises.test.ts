/**
 * Abas de análise da busca de passagens — desempenho sem mudar número (16/10).
 *
 * O "Melhor momento" trazia as opções de cada consulta linha a linha (dezenas
 * de milhares) só para somar o horário em 4 períodos do dia; agora o banco
 * soma (historico.ts · carregarHorarioDasOpcoes). Este teste prende a conta do
 * SQL à regra pura `horarioDasOpcoes` (a de antes, que continua testada em
 * shared/analise-da-busca.test.ts) nos casos de borda — mediana par com
 * meio centavo, consulta com menos de 3 opções, mediana 0, preço 0, partida
 * ausente/torta/fora das 24 h — e confere que a aba inteira devolve o mesmo
 * que a regra pura com as opções linha a linha.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { agenteLogado, criarApp, type Contexto, type TestAgent } from "./harness";
import type { OpcaoDoHistoricoNaAnalise } from "@shared/analise-da-busca";

let ctx: Contexto;
let admin: TestAgent;
type Historico = typeof import("../busca-de-passagens/historico");
let historico: Historico;
let analise: typeof import("@shared/analise-da-busca");

const DIA = 86_400_000;

async function consulta(id: string, diasAtras: number, precos: number[], partidas: Array<[string | null, string | null]>): Promise<void> {
  await ctx.db.execute(sql`
    INSERT INTO busca_passagens_consultas (id, consultado_em, fornecedor, chave, perna, origem, destino, data_ida, max_paradas, qtd_opcoes, menor_preco_centavos, antecedencia_dias)
    VALUES (${id}, ${new Date(Date.now() - diasAtras * DIA)}, 'teste', ${`ida|GRU>POA|2027-01-0${1 + (precos.length % 9)}|-|p1|-|-`}, 'ida', 'GRU', 'POA',
      ${`2027-01-0${1 + (precos.length % 9)}`}, 1, ${precos.length}, ${Math.min(...precos)}, 30)`);
  for (let k = 0; k < precos.length; k++) {
    const [ida, volta] = partidas[k % partidas.length];
    await ctx.db.execute(sql`
      INSERT INTO busca_passagens_opcoes (consulta_id, posicao, itinerario_id, companhia, voos, ida_partida, volta_partida, paradas, preco_centavos)
      VALUES (${id}, ${k + 1}, ${`${id}-${k}`}, 'LA', 'LA 1', ${ida}, ${volta}, 0, ${precos[k]})`);
  }
}

/** As opções linha a linha, como o servidor lia antes de 16/10. */
async function opcoesLinhaALinha(desde: Date | null): Promise<OpcaoDoHistoricoNaAnalise[]> {
  const { linhasDe } = await import("../db");
  const rows = await ctx.db.execute(sql`
    SELECT o.consulta_id, o.companhia, o.ida_partida, o.volta_partida, o.preco_centavos
    FROM busca_passagens_opcoes o JOIN busca_passagens_consultas c ON c.id = o.consulta_id
    WHERE ${desde ? sql`c.consultado_em >= ${desde}` : sql`TRUE`}
    ORDER BY o.consulta_id, o.posicao`);
  return linhasDe<Record<string, unknown>>(rows).map((l) => ({
    consultaId: String(l.consulta_id), companhia: String(l.companhia),
    idaPartida: (l.ida_partida as string | null) ?? null, voltaPartida: (l.volta_partida as string | null) ?? null,
    precoCentavos: Number(l.preco_centavos),
  }));
}

beforeAll(async () => {
  ctx = await criarApp();
  historico = await import("../busca-de-passagens/historico");
  analise = await import("@shared/analise-da-busca");
  admin = (await agenteLogado("admin")).agent;
  // Casos de borda (todos recentes).
  await consulta("borda-par", 5, [10001, 10002, 10003, 10004], [["2027-01-01T05:10", null], ["2027-01-01T13:00", null]]); // mediana 10002,5 → 10003
  await consulta("borda-duas", 5, [20000, 21000], [["2027-01-01T08:00", null]]); // < 3 opções: fora
  await consulta("borda-zero", 5, [0, 0, 0], [["2027-01-01T08:00", null]]); // mediana 0: fora
  await consulta("borda-partidas", 6, [30000, 0, 31000, 32000, 33000, 34000], [
    [null, "2027-01-05T19:30"], // ida sem hora → vale a volta
    [null, null], // sem partida: entra na conta, fora dos períodos
    ["sem hora", null], // torta
    ["2027-01-01T25:10", null], // minuto 1510: fora dos períodos
    ["2027-01-01T05:99", null], // 5h99 = 399 min → manhã, como minutoDoDia
    ["2027-01-01T23:59", "2027-01-05T06:00"],
  ]);
  // Volume determinístico, metade fora dos 180 dias.
  for (let i = 0; i < 60; i++) {
    const precos = Array.from({ length: 10 }, (_, k) => 40000 + ((i * 7919 + k * 104729) % 50000));
    const partidas: Array<[string | null, string | null]> = Array.from({ length: 10 }, (_, k) => [`2027-02-1${k % 10}T${String((i * 5 + k * 7) % 24).padStart(2, "0")}:${String((k * 13) % 60).padStart(2, "0")}`, null]);
    await consulta(`vol-${i}`, i * 6, precos, partidas);
  }
}, 120_000);

describe("análises da busca — horário somado no banco = regra pura", () => {
  for (const [nome, dias] of [["tudo", null], ["180 dias", 180]] as const) {
    it(`mesma soma por período (${nome})`, async () => {
      const desde = dias === null ? null : new Date(Date.now() - dias * DIA);
      const doBanco = await historico.carregarHorarioDasOpcoes(desde);
      const puro = analise.horarioDasOpcoes(await opcoesLinhaALinha(desde));
      expect(doBanco.itens).toBe(puro.itens);
      expect(Array.from(doBanco.somas.keys()).sort()).toEqual(Array.from(puro.somas.keys()).sort());
      for (const [k, s] of Array.from(puro.somas.entries())) {
        const b = doBanco.somas.get(k)!;
        expect({ n: b.n, somaPrecos: b.somaPrecos, nIndices: b.nIndices }, k).toEqual({ n: s.n, somaPrecos: s.somaPrecos, nIndices: s.nIndices });
        expect(b.somaIndices, k).toBeCloseTo(s.somaIndices, 9);
      }
      // Os casos de borda entraram como deviam (só no recorte que os contém).
      expect(puro.itens).toBeGreaterThan(0);
      expect(puro.somas.get("manha")?.n).toBeGreaterThan(0);
    });
  }

  it("a aba Melhor momento devolve o mesmo que a regra pura com as opções linha a linha", async () => {
    const r = await admin.get("/api/busca-de-passagens/analises/melhor-momento?periodo=tudo");
    expect(r.status).toBe(200);
    const esperado = analise.melhorMomento({
      consultas: await historico.carregarConsultas(null),
      opcoes: await opcoesLinhaALinha(null),
      passagens: await historico.carregarPassagens(null),
    });
    expect(r.body).toEqual(JSON.parse(JSON.stringify({ periodo: "tudo", ...esperado })));
    expect(r.body.base.opcoes).toBeGreaterThan(600);
    expect(r.body.pesquisado.horario.some((g: { n: number }) => g.n > 0)).toBe(true);
  });

  it("as consultas das análises não trazem as listas de vagas/eventos (peso morto)", async () => {
    const [c] = await historico.carregarConsultas(null);
    expect(c).toBeDefined();
    expect(c).not.toHaveProperty("vagaIds");
    expect(c).not.toHaveProperty("eventoIds");
  });
});
