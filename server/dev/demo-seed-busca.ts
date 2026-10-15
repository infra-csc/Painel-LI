/**
 * Seed da BUSCA DE PASSAGENS no modo demonstração (09/10, etapa 2) — SÓ no
 * demo (`npm run dev:demo`), nunca em produção nem nos testes de rota.
 *
 * As abas de análise precisam de histórico para terem o que mostrar. Tudo é
 * determinístico (PRNG com semente fixa) e relativo a HOJE:
 *  - o aeroporto de cada evento (o que Compras confirmaria na busca);
 *  - ~6 meses de consultas reais simuladas por rota, com preço que depende da
 *    antecedência (mais caro perto do voo), do dia da semana e do horário —
 *    para "Melhor momento", "Preço por rota" e a curva da previsão;
 *  - consultas recentes das rotas/datas das escalações pendentes (preço atual
 *    e evolução da previsão);
 *  - datas de compra, valores, horário da volta e quem registrou nas
 *    passagens do seed (antecedências variadas para o "pago");
 *  - "Usar este voo" ligados a passagens (pago × encontrado);
 *  - acompanhamentos (dois com aviso no sino) e o consumo dos últimos meses.
 */
import { count, eq, inArray, isNull, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { hojeISO } from "@shared/hoje-sp";
import { aeroportosDaCidade } from "@shared/aeroportos-do-brasil";
import { cidadeDoEvento } from "@shared/janela-de-viagem";
import { chaveDaConsulta, type PernaDaRota } from "@shared/busca-de-passagens";
import { carregarPendentes } from "../busca-de-passagens/historico";
import { DEMO_USUARIOS } from "./demo-seed";

type Db = NeonDatabase<typeof schema>;

function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const addDias = (iso: string, n: number) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n)).toISOString().slice(0, 10);
const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const em = (iso: string, hora = "10:00") => new Date(`${iso}T${hora}:00-03:00`);

/** Curva de antecedência do demo: perto do voo é bem mais caro. */
const fatorDaAntecedencia = (dias: number) => (dias < 7 ? 1.38 : dias <= 14 ? 1.16 : dias <= 30 ? 1 : dias <= 60 ? 0.88 : 0.93);
/** Sexta e domingo mais caros; terça e quarta mais baratos. */
const fatorDoDia = (iso: string) => ([0, 5].includes(diaDaSemana(iso)) ? 1.08 : [2, 3].includes(diaDaSemana(iso)) ? 0.94 : 1);
const CIAS = ["LA", "G3", "AD"] as const;
const DESVIO_DA_CIA: Record<string, number> = { LA: 0.07, G3: 0, AD: 0.04 };
/** Horários das opções e quanto cada período costuma custar contra o menor da busca. */
const HORARIOS: Array<[string, number]> = [["05:40", 1.0], ["07:15", 1.1], ["09:30", 1.14], ["13:20", 1.06], ["16:45", 1.09], ["19:30", 1.17], ["21:50", 1.12]];

interface Rota { perna: PernaDaRota; origem: string; destino: string }
const basePreco = (r: Rota) => {
  const h = hash(`${r.origem}>${r.destino}`);
  return r.perna === "ida_e_volta" ? Math.round((92_000 + h * 48_000) / 100) * 100 : Math.round((46_000 + h * 30_000) / 100) * 100;
};

export async function semearBuscaDemo(db: Db): Promise<{ consultas: number }> {
  const [ja] = await db.select({ n: count() }).from(schema.buscaPassagensConsultas);
  if (Number(ja?.n ?? 0) > 0) return { consultas: Number(ja.n) };
  const rnd = prng(20_261_009);
  const hoje = hojeISO();
  const usuarios = await db.select().from(schema.users).where(inArray(schema.users.email, [DEMO_USUARIOS.admin.email, DEMO_USUARIOS.purchasing.email]));
  const admin = usuarios.find((u) => u.email === DEMO_USUARIOS.admin.email)!;
  const compras = usuarios.find((u) => u.email === DEMO_USUARIOS.purchasing.email)!;

  // 1) Aeroporto de cada evento (o principal da cidade).
  const eventos = await db.select().from(schema.events);
  for (const e of eventos) {
    const iata = aeroportosDaCidade(cidadeDoEvento(e.location))[0];
    if (iata && !e.aeroportoIata) await db.update(schema.events).set({ aeroportoIata: iata }).where(eq(schema.events.id, e.id));
  }

  // 2) Rotas: as das escalações pendentes + as das passagens já compradas.
  const pendentes = await carregarPendentes(hoje);
  const rotas = new Map<string, Rota>();
  const comRota = (r: Rota) => rotas.set(`${r.perna === "ida_e_volta" ? "rt" : "ow"}|${r.origem}>${r.destino}`, r);
  for (const v of pendentes) for (const r of v.rotas) comRota({ perna: r.perna, origem: r.origem, destino: r.destino });
  const passagens = await db.select().from(schema.tickets).where(and(isNull(schema.tickets.archivedAt), eq(schema.tickets.transportType, "aereo")));
  for (const t of passagens) if (t.departureAirport && t.destinationAirport && t.departureAirport !== t.destinationAirport) comRota({ perna: "ida_e_volta", origem: t.departureAirport, destino: t.destinationAirport });
  for (const extra of [["GRU", "POA"], ["GRU", "CWB"], ["CNF", "SSA"], ["GIG", "REC"]]) comRota({ perna: "ida", origem: extra[0], destino: extra[1] });

  type NovaConsulta = typeof schema.buscaPassagensConsultas.$inferInsert & { opcoes: Array<Omit<typeof schema.buscaPassagensOpcoes.$inferInsert, "consultaId">> };
  const consultas: NovaConsulta[] = [];
  const montar = (r: Rota, dataIda: string, dataVolta: string | null, consultadoEm: Date, preco: number, usuarioId: string, vagaIds: string[], eventoIds: string[], chave?: string): NovaConsulta => {
    const ant = Math.round((Date.parse(`${dataIda}T12:00:00Z`) - Date.parse(`${consultadoEm.toISOString().slice(0, 10)}T12:00:00Z`)) / 86_400_000);
    const menorPorCia: Record<string, number> = {};
    for (const c of CIAS) menorPorCia[c] = Math.round(preco * (1 + DESVIO_DA_CIA[c] + rnd() * 0.06) / 100) * 100;
    const ciaMaisBarata = CIAS[Math.floor(rnd() * 3)];
    menorPorCia[ciaMaisBarata] = preco;
    const opcoes = HORARIOS.slice(0, 5 + Math.floor(rnd() * 3)).map(([hora, f], i) => {
      const cia = i === 0 ? ciaMaisBarata : CIAS[Math.floor(rnd() * 3)];
      const p = i === 0 ? preco : Math.round(preco * f * (0.98 + rnd() * 0.06) / 100) * 100;
      return {
        posicao: i + 1, itinerarioId: `demo-${Math.floor(rnd() * 1e12).toString(36)}`, companhia: cia,
        voos: `${cia} ${1000 + Math.floor(rnd() * 8000)}`,
        idaPartida: r.perna === "volta" ? null : `${dataIda}T${hora}`, idaChegada: r.perna === "volta" ? null : `${dataIda}T${hora}`,
        voltaPartida: r.perna === "volta" ? `${dataIda}T${hora}` : dataVolta ? `${dataVolta}T${HORARIOS[(i + 2) % HORARIOS.length][0]}` : null,
        voltaChegada: null, paradas: i % 3 === 2 ? 1 : 0, duracaoMin: 150 + i * 20, precoCentavos: p,
      };
    }).sort((a, b) => a.precoCentavos - b.precoCentavos).map((o, i) => ({ ...o, posicao: i + 1 }));
    const consulta = { perna: r.perna, origem: r.origem, destino: r.destino, dataIda, dataVolta, maxParadas: 1 as const, horarioIda: null, horarioVolta: null };
    return {
      usuarioId, fornecedor: "simulado", chave: chave ?? chaveDaConsulta(consulta), perna: r.perna, origem: r.origem, destino: r.destino,
      dataIda, dataVolta, maxParadas: 1, filtros: { horarioIda: null, horarioVolta: null }, deslocamento: null,
      vagaIds, eventoIds, antecedenciaDias: ant, qtdOpcoes: opcoes.length + 3, menorPrecoCentavos: preco, menorPorCia,
      consultadoEm, observadoEm: consultadoEm, opcoes,
    };
  };

  // 3) Histórico: ~6 meses por rota, antecedências de 1 a 80 dias.
  for (const r of Array.from(rotas.values())) {
    const base = basePreco(r);
    const n = 14 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const diaConsulta = addDias(hoje, -(3 + Math.floor(rnd() * 170)));
      const ant = [2, 4, 6, 9, 12, 13, 18, 22, 27, 35, 42, 50, 58, 70, 80][Math.floor(rnd() * 15)];
      const dataIda = addDias(diaConsulta, ant);
      const dataVolta = r.perna === "ida_e_volta" ? addDias(dataIda, 3 + Math.floor(rnd() * 3)) : null;
      const preco = Math.round((base * fatorDaAntecedencia(ant) * fatorDoDia(dataIda) * (0.93 + rnd() * 0.14)) / 100) * 100;
      consultas.push(montar(r, dataIda, dataVolta, em(diaConsulta, `${String(8 + Math.floor(rnd() * 10)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`), preco, rnd() < 0.6 ? compras.id : admin.id, [], []));
    }
  }

  // 4) As rotas/datas das pendentes: 1 a 3 consultas recentes (preço atual e evolução).
  const vistas = new Set<string>();
  pendentes.forEach((v, k) => {
    for (const r of v.rotas) {
      if (vistas.has(r.chave)) continue;
      vistas.add(r.chave);
      const base = basePreco(r);
      const ant = Math.round((Date.parse(`${r.dataIda}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
      // Variedade honesta: umas subindo, umas caras (que costumam cair), umas estáveis.
      const perfil = k % 3;
      const pontos = perfil === 0 ? [0.97, 1.03, 1.1] : perfil === 1 ? [1.32, 1.27] : [1.0];
      pontos.forEach((f, i) => {
        const diasAtras = (pontos.length - i) * 3 - 2;
        const preco = Math.round((base * fatorDaAntecedencia(ant + diasAtras) * f) / 100) * 100;
        consultas.push(montar(r, r.dataIda, r.dataVolta, em(addDias(hoje, -diasAtras), "11:00"), preco, compras.id, [v.vagaId], [v.eventId], r.chave));
      });
    }
  });

  // Grava consultas + opções + consumo.
  let gravadas = 0;
  for (let i = 0; i < consultas.length; i += 50) {
    const lote = consultas.slice(i, i + 50);
    const linhas = await db.insert(schema.buscaPassagensConsultas).values(lote.map(({ opcoes: _o, ...c }) => c)).returning({ id: schema.buscaPassagensConsultas.id });
    const opcoes = lote.flatMap((c, j) => c.opcoes.map((o) => ({ ...o, consultaId: linhas[j].id })));
    if (opcoes.length) await db.insert(schema.buscaPassagensOpcoes).values(opcoes);
    await db.insert(schema.buscaPassagensConsumo).values(lote.map((c) => ({
      consultadoEm: c.consultadoEm as Date, tipo: c.perna, chave: c.chave, fornecedor: "simulado", usuarioId: c.usuarioId ?? null, doCache: false,
    })));
    gravadas += lote.length;
  }
  // Acertos do cache (aba Consumo).
  await db.insert(schema.buscaPassagensConsumo).values(consultas.slice(0, 40).map((c, i) => ({
    consultadoEm: new Date((c.consultadoEm as Date).getTime() + 3_600_000), tipo: c.perna, chave: c.chave, fornecedor: "simulado",
    usuarioId: i % 2 ? admin.id : compras.id, doCache: true,
  })));

  // 5) Passagens do seed: antecedências variadas (o "pago"), voltas noturnas e quem registrou.
  const ANTECEDENCIAS = [3, 5, 9, 12, 18, 25, 34, 45, 70];
  for (let i = 0; i < passagens.length; i++) {
    const t = passagens[i];
    if (!t.actualDepartureDate) continue;
    const ant = ANTECEDENCIAS[i % ANTECEDENCIAS.length];
    const base = basePreco({ perna: "ida_e_volta", origem: t.departureAirport ?? "GRU", destino: t.destinationAirport ?? "POA" });
    const valor = Math.round((base * fatorDaAntecedencia(ant) * fatorDoDia(String(t.actualDepartureDate)) * (0.95 + rnd() * 0.1)) / 100) * 100;
    await db.update(schema.tickets).set({
      purchaseDate: addDias(String(t.actualDepartureDate), -ant),
      value: valor,
      actualReturnTime: i % 3 === 0 ? "19:20" : i % 3 === 1 ? "16:10" : t.actualReturnTime,
      updatedBy: ant < 10 ? admin.id : compras.id,
    }).where(eq(schema.tickets.id, t.id));
  }

  // 6) "Usar este voo" que viraram passagem (pago × encontrado).
  const atualizadas = await db.select().from(schema.tickets).where(and(isNull(schema.tickets.archivedAt), eq(schema.tickets.transportType, "aereo")));
  const usos = atualizadas.filter((t) => t.departureAirport && t.destinationAirport && t.departureAirport !== t.destinationAirport && t.actualDepartureDate && t.actualReturnDate && t.value).slice(0, 14);
  for (let i = 0; i < usos.length; i++) {
    const t = usos[i];
    const r: Rota = { perna: "ida_e_volta", origem: t.departureAirport!, destino: t.destinationAirport! };
    const consulta = { ...r, dataIda: String(t.actualDepartureDate), dataVolta: String(t.actualReturnDate), maxParadas: 1 as const, horarioIda: null, horarioVolta: null };
    const chave = chaveDaConsulta(consulta);
    const encontrado = Math.round(((t.value as number) * (i % 4 === 0 ? 1 : 0.9 + rnd() * 0.08)) / 100) * 100;
    const quando = em(String(t.purchaseDate ?? hoje), "09:40");
    const nova = montar(r, consulta.dataIda, consulta.dataVolta, quando, Math.min(encontrado, Math.round(encontrado * (0.96 + rnd() * 0.04) / 100) * 100), compras.id, [t.teamInclusionId], [], chave);
    const [linha] = await db.insert(schema.buscaPassagensConsultas).values((({ opcoes: _o, ...c }) => c)(nova)).returning({ id: schema.buscaPassagensConsultas.id });
    await db.insert(schema.buscaPassagensOpcoes).values(nova.opcoes.map((o) => ({ ...o, consultaId: linha.id })));
    await db.insert(schema.buscaPassagensUsos).values({
      usadoEm: new Date(quando.getTime() + 25 * 60_000), usuarioId: (t.updatedBy as string | null) ?? compras.id, teamInclusionId: t.teamInclusionId, ticketId: t.id,
      consultaId: linha.id, chave, perna: "ida_e_volta", itinerarioId: nova.opcoes[0].itinerarioId as string, companhia: t.ticketCompany, voos: nova.opcoes[0].voos as string,
      precoEncontradoCentavos: encontrado, precoVistoEm: quando,
    });
    gravadas += 1;
  }

  // 7) Acompanhamentos: quatro escalações pendentes, duas com aviso novo no sino.
  const paraAcompanhar = pendentes.filter((v) => v.rotas.length > 0).slice(0, 4);
  for (let i = 0; i < paraAcompanhar.length; i++) {
    const v = paraAcompanhar[i];
    const base = v.rotas.reduce((s, r) => s + basePreco(r), 0);
    const inicial = Math.round(base * 1.12 / 100) * 100;
    const ultimo = i === 0 ? Math.round(inicial * 0.86 / 100) * 100 : Math.round(inicial * (0.98 + i * 0.01) / 100) * 100;
    await db.insert(schema.buscaPassagensAcompanhamentos).values({
      teamInclusionId: v.vagaId, criadoPor: i % 2 ? admin.id : compras.id, criadoEm: em(addDias(hoje, -6 + i), "15:00"),
      chaves: v.rotas.map((r) => r.chave), precoInicialCentavos: inicial, precoReferenciaCentavos: i === 0 ? ultimo : inicial,
      ultimoPrecoCentavos: ultimo, menorPrecoCentavos: Math.min(inicial, ultimo), ultimaChecagemEm: em(hoje, "07:05"),
      tendencia: i === 1 ? "subir" : i === 2 ? "estavel" : "baixar",
      ...(i === 0 ? { aviso: "caiu", avisoTexto: `Caiu ${Math.round((1 - ultimo / inicial) * 100)}% (R$ ${Math.round(inicial / 100).toLocaleString("pt-BR")} → R$ ${Math.round(ultimo / 100).toLocaleString("pt-BR")})`, avisoEm: em(hoje, "07:05") } : {}),
      ...(i === 1 ? { aviso: "subir", avisoTexto: "A tendência virou “subir” — compre logo", avisoEm: em(hoje, "07:05") } : {}),
    });
  }
  return { consultas: gravadas };
}
