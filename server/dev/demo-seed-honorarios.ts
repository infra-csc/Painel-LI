/**
 * Seed dos HONORÁRIOS DA CENOTÉCNICA no modo demonstração (16/10) — SÓ no demo
 * (`npm run dev:demo`), nunca em produção nem nos testes de rota. Tudo
 * FICTÍCIO (colaboradores do seed, empreitas inventadas), relativo a hoje.
 *
 * Para as três telas terem o que mostrar em todos os estados:
 *  - Rafael Nogueira (production) passa a VALIDAR Cenotécnica e Sup Ceno —
 *    é quem pede; Marcos Vieira continua o aprovador; Patrícia Lemos (RH) libera;
 *  - vagas extras de cenotécnica escaladas (freela local/viagem e uma da casa)
 *    em quatro eventos, e os pedidos em todas as etapas:
 *      SP (passado)        → aprovados e liberados (um com ajuste) + empreita liberada;
 *      Rio (passado)       → aprovados a liberar e liberação parcial + empreita parcial;
 *      BH (em andamento)   → aguardando aprovação + um devolvido para negociar;
 *      Curitiba (futuro)   → rascunhos, vagas sem valor e uma empreita em rascunho.
 * Nada aqui muda as vagas que o seed principal criou.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { DEMO_USUARIOS } from "./demo-seed";

type Db = NeonDatabase<typeof schema>;

const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const em = (iso: string, hora = "10:00") => new Date(`${iso}T${hora}:00-03:00`);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;

type Etapa =
  | { s: "sem" }
  | { s: "rascunho"; valor: number; semSetor?: boolean }
  | { s: "aguardando"; valor: number; obs?: string }
  | { s: "devolvido"; valor: number; motivo: string }
  | { s: "aprovado"; valor: number; libs?: number[] }
  | { s: "ajuste"; valor: number; aprovado: number; motivo: string; libs?: number[] };

interface Plano {
  evento: string;
  statusDaVaga: string;
  vagas: { funcao: "Cenotécnica" | "Sup Ceno"; tipo: "freela" | "local" | "casa"; viagem?: boolean; setor: "sup_ceno" | "marceneiro" | "montagem"; dias: number; etapa: Etapa }[];
  empreitas: { nome: string; pessoas: number; descricao: string; setor: "montagem" | "marceneiro"; dias: number; etapa: Etapa }[];
}

const PLANOS: Plano[] = [
  {
    evento: "Maratona Internacional de São Paulo",
    statusDaVaga: "concluido",
    vagas: [
      { funcao: "Sup Ceno", tipo: "freela", viagem: true, setor: "sup_ceno", dias: 5, etapa: { s: "aprovado", valor: 280_000, libs: [280_000] } },
      { funcao: "Cenotécnica", tipo: "freela", viagem: true, setor: "marceneiro", dias: 5, etapa: { s: "ajuste", valor: 240_000, aprovado: 220_000, motivo: "Fechado em R$ 2.200 com a produção — mesma diária do ano passado.", libs: [220_000] } },
      { funcao: "Cenotécnica", tipo: "local", setor: "montagem", dias: 4, etapa: { s: "aprovado", valor: 140_000, libs: [140_000] } },
      { funcao: "Cenotécnica", tipo: "freela", setor: "montagem", dias: 4, etapa: { s: "aprovado", valor: 150_000, libs: [150_000] } },
      { funcao: "Cenotécnica", tipo: "casa", setor: "montagem", dias: 4, etapa: { s: "sem" } },
    ],
    empreitas: [
      { nome: "Equipe Montagem Sul (4x)", pessoas: 4, descricao: "R$ 4.400 + R$ 400 de ajuda de custo (R$ 100 por pessoa)", setor: "montagem", dias: 4, etapa: { s: "aprovado", valor: 480_000, libs: [240_000, 240_000] } },
    ],
  },
  {
    evento: "Meia Maratona do Rio",
    statusDaVaga: "aprovado",
    vagas: [
      { funcao: "Sup Ceno", tipo: "freela", viagem: true, setor: "sup_ceno", dias: 4, etapa: { s: "aprovado", valor: 240_000, libs: [120_000] } },
      { funcao: "Cenotécnica", tipo: "freela", viagem: true, setor: "marceneiro", dias: 4, etapa: { s: "aprovado", valor: 190_000 } },
      { funcao: "Cenotécnica", tipo: "local", setor: "montagem", dias: 3, etapa: { s: "ajuste", valor: 130_000, aprovado: 115_000, motivo: "3 diárias, não 4 — a desmontagem ficou com a casa." } },
      { funcao: "Cenotécnica", tipo: "casa", setor: "marceneiro", dias: 4, etapa: { s: "sem" } },
    ],
    empreitas: [
      { nome: "Marcenaria Bom Fim", pessoas: 3, descricao: "Valor fechado da estrutura do pórtico", setor: "marceneiro", dias: 3, etapa: { s: "aprovado", valor: 360_000, libs: [150_000] } },
    ],
  },
  {
    evento: "Circuito das Estações — Belo Horizonte",
    statusDaVaga: "hospedagem_passagem_comprada",
    vagas: [
      { funcao: "Sup Ceno", tipo: "freela", viagem: true, setor: "sup_ceno", dias: 4, etapa: { s: "aguardando", valor: 260_000, obs: "Inclui o carregamento na sexta." } },
      { funcao: "Cenotécnica", tipo: "freela", viagem: true, setor: "marceneiro", dias: 4, etapa: { s: "aguardando", valor: 200_000 } },
      { funcao: "Cenotécnica", tipo: "local", setor: "montagem", dias: 3, etapa: { s: "devolvido", valor: 165_000, motivo: "Acima do combinado para 3 diárias — rever com o freela." } },
      { funcao: "Cenotécnica", tipo: "freela", setor: "montagem", dias: 3, etapa: { s: "aguardando", valor: 120_000 } },
    ],
    empreitas: [
      { nome: "Equipe Carga e Descarga (3x)", pessoas: 3, descricao: "Descarregar na quinta e carregar no domingo", setor: "montagem", dias: 2, etapa: { s: "aguardando", valor: 180_000 } },
    ],
  },
  {
    evento: "Corrida Noturna de Curitiba",
    statusDaVaga: "escalado",
    vagas: [
      { funcao: "Sup Ceno", tipo: "freela", viagem: true, setor: "sup_ceno", dias: 4, etapa: { s: "rascunho", valor: 250_000 } },
      { funcao: "Cenotécnica", tipo: "freela", viagem: true, setor: "marceneiro", dias: 4, etapa: { s: "rascunho", valor: 185_000 } },
      { funcao: "Cenotécnica", tipo: "local", setor: "montagem", dias: 3, etapa: { s: "sem" } },
      { funcao: "Cenotécnica", tipo: "freela", setor: "montagem", dias: 3, etapa: { s: "sem" } },
      { funcao: "Cenotécnica", tipo: "casa", setor: "montagem", dias: 3, etapa: { s: "sem" } },
    ],
    empreitas: [
      { nome: "Equipe Pórtico Norte (2x)", pessoas: 2, descricao: "Montagem do pórtico de largada", setor: "montagem", dias: 2, etapa: { s: "rascunho", valor: 160_000 } },
    ],
  },
];

export async function semearHonorariosDemo(db: Db): Promise<{ pedidos: number }> {
  const [ja] = await db.select({ id: schema.honorariosCeno.id }).from(schema.honorariosCeno).limit(1);
  if (ja) return { pedidos: 0 };

  const usuario = async (email: string) => (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0];
  const rafael = await usuario(DEMO_USUARIOS.production.email);
  const marcos = await usuario(DEMO_USUARIOS.aprovador.email);
  const patricia = await usuario(DEMO_USUARIOS.financial.email);
  const funcoes = await db.select().from(schema.functions).where(inArray(schema.functions.name, ["Cenotécnica", "Sup Ceno"]));
  const funcao = (n: string) => funcoes.find((f) => f.name === n)!;
  if (!rafael || !marcos || !patricia || funcoes.length < 2) return { pedidos: 0 };

  // Quem pede: Rafael valida as duas funções de cenotécnica.
  await db.insert(schema.scalingFunctionManagers).values(funcoes.map((f) => ({ functionId: f.id, userId: rafael.id, role: "validador" })))
    .onConflictDoNothing();

  const colaboradores = await db.select().from(schema.collaborators).where(and(eq(schema.collaborators.status, "aprovado"), eq(schema.collaborators.active, true)));
  let pedidos = 0;

  for (const plano of PLANOS) {
    const [evento] = await db.select().from(schema.events).where(eq(schema.events.name, plano.evento));
    if (!evento) continue;
    const ocupados = new Set((await db.select({ c: schema.teamInclusions.collaboratorId }).from(schema.teamInclusions).where(eq(schema.teamInclusions.eventId, evento.id))).map((r) => r.c));
    const pegar = (tipo: string) => {
      const c = colaboradores.find((x) => x.type === tipo && !ocupados.has(x.id)) ?? colaboradores.find((x) => !ocupados.has(x.id) && x.type !== "casa");
      if (c) ocupados.add(c.id);
      return c;
    };
    const inicioEvento = String(evento.startDate);
    const fimEvento = String(evento.endDate);
    const passado = fimEvento < new Date().toISOString().slice(0, 10);
    const enviadoEm = passado ? em(addDias(fimEvento, 1), "09:40") : em(addDias(new Date().toISOString().slice(0, 10), -1), "11:15");
    const decididoEm = passado ? em(addDias(fimEvento, 3), "15:20") : em(new Date().toISOString().slice(0, 10), "08:50");

    const criarPedido = async (base: Omit<schema.InsertHonorarioCeno, "criadoPor" | "criadoPorNome" | "status" | "valorPedido">, etapa: Etapa, inicio: string, fim: string) => {
      if (etapa.s === "sem") return;
      const valorAprovado = etapa.s === "aprovado" ? etapa.valor : etapa.s === "ajuste" ? etapa.aprovado : null;
      const status = etapa.s === "ajuste" ? "aprovado_ajuste" : etapa.s;
      const enviado = etapa.s !== "rascunho";
      const decidido = etapa.s === "aprovado" || etapa.s === "ajuste" || etapa.s === "devolvido";
      const [h] = await db.insert(schema.honorariosCeno).values({
        ...base, inicio, fim, status, valorPedido: etapa.valor, valorAprovado,
        setor: etapa.s === "rascunho" && etapa.semSetor ? null : base.setor,
        observacao: etapa.s === "aguardando" ? etapa.obs ?? null : null,
        criadoPor: rafael.id, criadoPorNome: rafael.name,
        enviadoPor: enviado ? rafael.id : null, enviadoPorNome: enviado ? rafael.name : null, enviadoEm: enviado ? enviadoEm : null,
        decididoPor: decidido ? marcos.id : null, decididoPorNome: decidido ? marcos.name : null, decididoEm: decidido ? decididoEm : null,
        motivoDecisao: etapa.s === "ajuste" || etapa.s === "devolvido" ? etapa.motivo : null,
        versao: 3, createdAt: em(addDias(inicioEvento, -6)), updatedAt: decidido ? decididoEm : enviadoEm,
      }).returning();
      pedidos++;
      const hist: (typeof schema.honorariosCenoHistorico.$inferInsert)[] = [
        { honorarioId: h.id, acao: "criado", valorNovo: etapa.valor, detalhe: base.tipo === "empreita" ? "Empreita adicionada" : "Pedido iniciado", porId: rafael.id, porNome: rafael.name, em: em(addDias(inicioEvento, -6)) },
      ];
      if (enviado) hist.push({ honorarioId: h.id, acao: "enviado", valorNovo: etapa.valor, detalhe: "Enviado para aprovação", porId: rafael.id, porNome: rafael.name, em: enviadoEm });
      if (etapa.s === "aprovado") hist.push({ honorarioId: h.id, acao: "aprovado", valorNovo: etapa.valor, porId: marcos.id, porNome: marcos.name, em: decididoEm });
      if (etapa.s === "ajuste") hist.push({ honorarioId: h.id, acao: "aprovado_ajuste", valorAnterior: etapa.valor, valorNovo: etapa.aprovado, motivo: etapa.motivo, porId: marcos.id, porNome: marcos.name, em: decididoEm });
      if (etapa.s === "devolvido") hist.push({ honorarioId: h.id, acao: "devolvido", valorAnterior: etapa.valor, motivo: etapa.motivo, detalhe: "Devolvido para negociar", porId: marcos.id, porNome: marcos.name, em: decididoEm });
      const libs = etapa.s === "aprovado" || etapa.s === "ajuste" ? etapa.libs ?? [] : [];
      let acumulado = 0;
      for (let i = 0; i < libs.length; i++) {
        const valor = libs[i];
        acumulado += valor;
        const data = addDias(fimEvento, 8 + i * 7);
        const oc = String(45_100 + pedidos * 7 + i);
        await db.insert(schema.honorariosCenoLiberacoes).values({ honorarioId: h.id, data, oc, valor, porId: patricia.id, porNome: patricia.name, createdAt: em(data, "14:30") });
        const total = valorAprovado ?? 0;
        hist.push({ honorarioId: h.id, acao: "liberacao", valorNovo: valor, detalhe: `OC/DP ${oc} · ${acumulado >= total ? "verba liberada por completo" : "liberação parcial"}`, porId: patricia.id, porNome: patricia.name, em: em(data, "14:30") });
      }
      await db.insert(schema.honorariosCenoHistorico).values(hist);
    };

    for (let i = 0; i < plano.vagas.length; i++) {
      const v = plano.vagas[i];
      const colab = pegar(v.tipo);
      if (!colab) continue;
      const fn = funcao(v.funcao);
      const inicio = addDias(inicioEvento, -(v.dias - diasEntre(inicioEvento, fimEvento)));
      const [vaga] = await db.insert(schema.teamInclusions).values({
        eventId: evento.id, functionId: fn.id, collaboratorId: colab.id, area: fn.responsibleArea, emitsNf: v.tipo !== "casa",
        cenoFreelaTipo: fn.name === "Cenotécnica" && v.tipo !== "casa" ? (v.viagem ? "viagem" : v.tipo === "local" ? "local_a" : "sp") : null,
        rowOrder: 200 + i, scheduleStartDate: inicio, scheduleEndDate: fimEvento,
        needsTicket: !!v.viagem, needsAccommodation: !!v.viagem, dailyRates: v.dias, dailyValue: 0,
        city: colab.city, status: plano.statusDaVaga, phase: plano.statusDaVaga === "escalado" ? "escalacao" : plano.statusDaVaga === "concluido" || plano.statusDaVaga === "aprovado" ? "aprovacao" : "hospedagem",
        userId: rafael.id, updatedBy: rafael.id,
        approvedByProduction: marcos.id, approvedByProductionAt: em(addDias(inicioEvento, -10)),
        createdAt: em(addDias(inicioEvento, -20)), updatedAt: em(addDias(inicioEvento, -10)),
      }).returning();
      if (v.tipo === "casa") continue;
      await criarPedido({
        eventId: evento.id, tipo: "vaga", teamInclusionId: vaga.id, functionId: fn.id, collaboratorId: colab.id, nome: colab.fullName,
        setor: v.setor, posicao: v.viagem ? "freela_viagem" : "freela_local", diarias: v.dias,
      }, v.etapa, inicio, fimEvento);
    }
    for (const e of plano.empreitas) {
      await criarPedido({
        eventId: evento.id, tipo: "empreita", teamInclusionId: null, functionId: null, collaboratorId: null, nome: e.nome,
        pessoas: e.pessoas, descricao: e.descricao, setor: e.setor, posicao: "empreita", diarias: e.dias,
      }, e.etapa, addDias(fimEvento, -(e.dias - 1)), fimEvento);
    }
  }
  return { pedidos };
}
