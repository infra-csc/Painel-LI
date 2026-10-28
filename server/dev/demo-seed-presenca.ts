/**
 * Seed da PRESENÇA NO EVENTO e do PORTAL DO COLABORADOR no modo demonstração
 * (27/10, Fase 1 do Módulo de Honorários) — SÓ no demo (`npm run dev:demo`),
 * nunca em produção nem nos testes de rota. Tudo FICTÍCIO e relativo a hoje.
 *
 * Um evento do FLUXO NOVO em andamento (termina na data de corte padrão ou
 * depois), com 4 pessoas escaladas, pré-aprovadas e no Realizado:
 *  - Portal (senha conhecida, termo aceito): anteontem concluído, ontem com
 *    entrada e SEM saída, hoje livre para o check-in ao vivo;
 *  - Falta: anteontem concluído, FALTA ontem (ocorrência), hoje na arena;
 *  - Montagem (MEI com contrato ativo, senha conhecida): dois dias concluídos
 *    e a CONFIRMAÇÃO com o CNPJ do contrato;
 *  - Fotografia: anteontem sem registro, ontem concluído com 2 h extras, hoje
 *    check-in feito pelo representante (produção).
 * 28/10 (Fase 3 — prazos e cobranças), para a demo ter atrasos de verdade:
 *  - a confirmação da Montagem traz uma CONTESTAÇÃO aberta ("Algo não bate?");
 *  - Montagem 2 (senha conhecida): trabalhou de 6 a 4 dias atrás, sem
 *    confirmar — confirmação atrasada 2 dias e check-out final atrasado 1;
 *  - Fotografia 2: trabalhou de 6 a 4 dias atrás, confirmou e a produção fez o
 *    check-out final há 4 dias — Conferência DP atrasada 1 dia.
 * As selfies são PNGs gerados aqui e gravados no armazenamento em memória da
 * demo (server/objectStorage.ts). Senha do portal: DEMO_SENHA_DO_COLABORADOR
 * (docs/demo.md) — o CPF de quem entra sai no log da demo.
 */
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { deflateSync } from "node:zlib";
import * as schema from "@shared/schema";
import { hojeISO } from "@shared/hoje-sp";
import { DATA_DE_CORTE_PADRAO } from "@shared/legado-honorarios";
import { CONFIGURACAO_PADRAO, ehFimDeSemana, instanteEmBrasilia } from "@shared/presenca";
import { faseParaStatus } from "@shared/vaga-status";
import { DEMO_USUARIOS } from "./demo-seed";

type Db = NeonDatabase<typeof schema>;

/** Senha do portal do colaborador na demo (fictícia; só existe na demo). */
export const DEMO_SENHA_DO_COLABORADOR = "Portal@2026";

const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── PNG de "selfie" (degradê com uma silhueta), sem dependência ─────────────
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo: string, dados: Buffer): Buffer {
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}
function selfieDeDemo(cor: [number, number, number]): Buffer {
  const w = 96, h = 128;
  const linhas: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const linha = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const t = y / h;
      let [r, g, b] = cor.map((c) => Math.round(c * (1 - t * 0.45) + 40 * t));
      const cabeca = (x - 48) ** 2 + (y - 50) ** 2 < 22 ** 2;
      const ombros = y > 82 && (x - 48) ** 2 / 42 ** 2 + (y - 128) ** 2 / 44 ** 2 < 1;
      if (cabeca || ombros) [r, g, b] = [235, 225, 215];
      linha.writeUInt8(r, 1 + x * 3); linha.writeUInt8(g, 2 + x * 3); linha.writeUInt8(b, 3 + x * 3);
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr), bloco("IDAT", deflateSync(Buffer.concat(linhas))), bloco("IEND", Buffer.alloc(0)),
  ]);
}

export interface ResumoDaPresencaDemo {
  pessoas: number;
  /** Quem entra no portal (/colaborador) com DEMO_SENHA_DO_COLABORADOR. */
  portal: { nome: string; cpf: string }[];
}

export async function semearPresencaDemo(db: Db): Promise<ResumoDaPresencaDemo> {
  const vazio: ResumoDaPresencaDemo = { pessoas: 0, portal: [] };
  const NOME_DO_EVENTO = "Meia Maratona de Florianópolis";
  const ja = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.name, NOME_DO_EVENTO)).limit(1);
  if (ja.length) return vazio;
  const hoje = hojeISO();
  const [producao] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.production.email));
  const [dp] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.financial.email));
  if (!producao || !dp) return vazio;
  const funcoes = await db.select().from(schema.functions).where(inArray(schema.functions.name, ["Produtor", "Montagem", "Fotografia"]));
  const funcao = (nome: string) => funcoes.find((f) => f.name === nome);
  if (!funcao("Produtor") || !funcao("Montagem") || !funcao("Fotografia")) return vazio;

  // A Área de Função da demo responde também pela Fotografia: a tela da presença
  // mostra a ela só essa pessoa (o recorte das funções dela) — 27/10, telas internas.
  const [area] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.function_area.email));
  if (area) await db.insert(schema.functionManagers).values({ functionId: funcao("Fotografia")!.id, userId: area.id, role: "validador" }).onConflictDoNothing();

  // O primeiro aprovado (MEI com contrato ativo no seed dos contratos) e três freelas depois dos 14 dos contratos.
  const aprovados = await db.select().from(schema.collaborators)
    .where(and(eq(schema.collaborators.status, "aprovado"), eq(schema.collaborators.active, true)))
    .orderBy(asc(schema.collaborators.collaboratorNumber));
  const freelas = aprovados.slice(14).filter((c) => c.type === "freela" && c.documentType === "cpf");
  const mei = aprovados[0];
  if (!mei || freelas.length < 3) return vazio;

  const evento = (await db.insert(schema.events).values({
    name: NOME_DO_EVENTO, location: "Beira-Mar Norte, Florianópolis - SC",
    startDate: addDias(hoje, -6), endDate: [addDias(hoje, 2), DATA_DE_CORTE_PADRAO].sort()[1],
    status: "em_andamento", observations: "Evento de demonstração da presença no evento (check-in com selfie).",
  }).returning())[0];

  const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
  const armazenamento = new ObjectStorageService();
  const fotos = new Map<string, Buffer>();
  const guardarSelfie = async (collaboratorId: string, cor: [number, number, number], dia: string, tipo: "entrada" | "saida") => {
    try {
      const id = novoIdDeAnexo();
      const png = fotos.get(collaboratorId) ?? selfieDeDemo(cor);
      fotos.set(collaboratorId, png);
      await armazenamento.enviarAnexo(id, png, "image/png", { ownerId: `colaborador:${collaboratorId}`, nomeOriginal: `selfie-${tipo}-${dia}.png`, classe: "presenca" });
      return id;
    } catch {
      return null; // sem armazenamento (fora da demo): a presença fica sem selfie
    }
  };

  const ontem = addDias(hoje, -1);
  const anteontem = addDias(hoje, -2);
  const amanha = addDias(hoje, 1);
  const pessoas = [
    { colab: freelas[0], funcao: "Produtor", dias: [anteontem, ontem, hoje, amanha], cor: [64, 120, 200] as [number, number, number], portal: true },
    { colab: freelas[1], funcao: "Produtor", dias: [anteontem, ontem, hoje, amanha], cor: [200, 110, 70] as [number, number, number], portal: false },
    { colab: mei, funcao: "Montagem", dias: [anteontem, ontem], cor: [70, 160, 110] as [number, number, number], portal: true },
    { colab: freelas[2], funcao: "Fotografia", dias: [anteontem, ontem, hoje, amanha], cor: [150, 90, 180] as [number, number, number], portal: false },
  ];
  // 28/10 (Fase 3): duas pessoas que já terminaram há dias (prazos vencidos). Os
  // freelas 3 e 4 são do seed dos pagamentos; aqui, os seguintes (se houver).
  const semanaPassada = [addDias(hoje, -6), addDias(hoje, -5), addDias(hoje, -4)];
  const atrasada = freelas[5] ? pessoas.push({ colab: freelas[5], funcao: "Montagem", dias: semanaPassada, cor: [210, 160, 60], portal: true }) - 1 : -1;
  const comODp = freelas[6] ? pessoas.push({ colab: freelas[6], funcao: "Fotografia", dias: semanaPassada, cor: [90, 150, 170], portal: false }) - 1 : -1;

  const prestacoes: schema.BudgetActual[] = [];
  for (const p of pessoas) {
    const f = funcao(p.funcao)!;
    const diaria = p.funcao === "Produtor" ? 24_000 : p.funcao === "Montagem" ? 15_000 : 30_000;
    const uteis = p.dias.filter((d) => !ehFimDeSemana(d)).length;
    const fds = p.dias.length - uteis;
    const valores = {
      collaboratorType: "freela", dailyQuantity: p.dias.length, dailyValue: diaria, costAssistance: 0,
      weekdayLunch: uteis * 4_000, weekdayDinner: uteis * 4_500, weekendLunch: fds * 4_000, weekendDinner: fds * 4_500,
      mobility: 0, mobilityIda: 0, mobilityVolta: 0, transport: 0,
      totalValue: p.dias.length * (diaria + 8_500),
    };
    const [vaga] = await db.insert(schema.teamInclusions).values({
      eventId: evento.id, functionId: f.id, collaboratorId: p.colab.id, userId: producao.id,
      status: "aprovado", phase: faseParaStatus("aprovado") ?? "aprovacao",
      scheduleStartDate: p.dias[0], scheduleEndDate: p.dias[p.dias.length - 1], dailyRates: p.dias.length, dailyValue: diaria,
      needsTicket: false, needsAccommodation: false, city: p.colab.city,
    }).returning();
    const [planejado] = await db.insert(schema.budgetPlanned).values({
      eventId: evento.id, collaboratorId: p.colab.id, functionId: f.id, teamInclusionId: vaga.id, ...valores,
      status: "pre_aprovado", approvedBy: dp.id, approvedAt: instanteEmBrasilia(addDias(hoje, -6), "10:00"), createdBy: dp.id,
    }).returning();
    const [actual] = await db.insert(schema.budgetActual).values({
      plannedId: planejado.id, eventId: evento.id, collaboratorId: p.colab.id, functionId: f.id, ...valores,
      workedDays: p.dias, createdBy: dp.id,
    }).returning();
    prestacoes.push(actual);
  }

  const marcar = async (i: number, dia: string, m: { entrada?: string; saida?: string; representante?: boolean }) => {
    const p = pessoas[i];
    const a = prestacoes[i];
    const entradaFoto = m.entrada ? await guardarSelfie(p.colab.id, p.cor, dia, "entrada") : null;
    const saidaFoto = m.saida ? await guardarSelfie(p.colab.id, p.cor, dia, "saida") : null;
    const por = m.representante ? "representante" : "colaborador";
    await db.insert(schema.presencas).values({
      actualId: a.id, eventId: evento.id, collaboratorId: p.colab.id, dia,
      ...(m.entrada ? {
        checkinEm: instanteEmBrasilia(dia, m.entrada), checkinFotoId: entradaFoto, checkinPor: por, checkinUserId: m.representante ? producao.id : null,
        checkinLat: "-27.582300", checkinLng: "-48.548900", checkinPrecisaoM: 14,
      } : {}),
      ...(m.saida ? {
        checkoutEm: instanteEmBrasilia(dia, m.saida), checkoutFotoId: saidaFoto, checkoutPor: por,
        checkoutLat: "-27.582100", checkoutLng: "-48.548600", checkoutPrecisaoM: 18,
      } : {}),
    });
  };

  // Portal: anteontem concluído; ontem sem saída; hoje livre (check-in ao vivo).
  await marcar(0, anteontem, { entrada: "07:42", saida: "18:15" });
  await marcar(0, ontem, { entrada: "07:50" });
  // Falta: anteontem concluído, falta ontem, hoje na arena.
  await marcar(1, anteontem, { entrada: "07:35", saida: "17:58" });
  await marcar(1, hoje, { entrada: "07:55" });
  await db.insert(schema.presencaOcorrencias).values({
    actualId: prestacoes[1].id, tipo: "falta", dia: ontem, observacao: "Avisou pela manhã que estava doente.",
    criadoPor: producao.id, criadoPorNome: producao.name,
  });
  // Montagem: dois dias concluídos + confirmação com o CNPJ do contrato (MEI ativo).
  await marcar(2, anteontem, { entrada: "06:30", saida: "16:40" });
  await marcar(2, ontem, { entrada: "06:25", saida: "17:05" });
  const [contratoDoMei] = await db.select({ c: schema.contratos }).from(schema.contratosColaboradores)
    .innerJoin(schema.contratos, eq(schema.contratos.id, schema.contratosColaboradores.contratoId))
    .where(eq(schema.contratosColaboradores.collaboratorId, mei.id)).limit(1);
  await db.insert(schema.presencaConfirmacoes).values({
    actualId: prestacoes[2].id, confirmadoPor: "colaborador", collaboratorId: mei.id, diasConfirmados: [anteontem, ontem],
    valorVisto: null, cnpj: contratoDoMei?.c.cnpj ?? "11222333000181", razaoSocial: contratoDoMei?.c.razaoSocial ?? null,
    contratoId: contratoDoMei?.c.id ?? null, confirmadoEm: instanteEmBrasilia(ontem, "17:20"),
    // 28/10 (Fase 3): contestação ABERTA — o DP responde no Painel ou na Conferência DP.
    contestacao: "No segundo dia fiquei até as 19h desmontando a tenda do patrocinador — o check-out saiu 17h05 porque o celular descarregou.",
  });
  // Montagem 2: três dias concluídos, sem confirmar — confirmação e check-out final atrasados.
  if (atrasada >= 0) for (const dia of semanaPassada) await marcar(atrasada, dia, { entrada: "07:00", saida: "17:30" });
  // Fotografia 2: confirmou e a produção fez o check-out final há 4 dias — com o DP, atrasado.
  if (comODp >= 0) {
    for (const dia of semanaPassada) await marcar(comODp, dia, { entrada: "08:00", saida: "18:00" });
    const p = pessoas[comODp];
    await db.insert(schema.presencaConfirmacoes).values({
      actualId: prestacoes[comODp].id, confirmadoPor: "colaborador", collaboratorId: p.colab.id, diasConfirmados: semanaPassada,
      valorVisto: null, cnpj: "11222333000181", razaoSocial: `${p.colab.fullName.toUpperCase()} FOTOGRAFIA ME`, confirmadoEm: instanteEmBrasilia(semanaPassada[2], "18:30"),
    });
    const fechado = instanteEmBrasilia(semanaPassada[2], "20:10");
    await db.update(schema.budgetActual).set({
      sentForReview: true, rhStatus: "pendente", checkoutFinalEm: fechado, checkoutFinalPor: producao.id, updatedAt: fechado,
      cnpjEmissor: "11222333000181", razaoSocialEmissor: `${p.colab.fullName.toUpperCase()} FOTOGRAFIA ME`, valorCalculado: prestacoes[comODp].totalValue,
    }).where(eq(schema.budgetActual.id, prestacoes[comODp].id));
  }
  // Fotografia: anteontem sem registro, ontem concluído com 2 h extras, hoje pelo representante.
  await marcar(3, ontem, { entrada: "08:10", saida: "21:30" });
  await marcar(3, hoje, { entrada: "08:05", representante: true });
  await db.insert(schema.presencaOcorrencias).values({
    actualId: prestacoes[3].id, tipo: "horas_extras", dia: ontem, horas: "2", observacao: "Cobertura da premiação estendida.",
    criadoPor: producao.id, criadoPorNome: producao.name,
  });

  // Acesso ao portal: senha conhecida e termo aceito para duas pessoas.
  const hash = await bcrypt.hash(DEMO_SENHA_DO_COLABORADOR, 4);
  const portal: ResumoDaPresencaDemo["portal"] = [];
  for (const p of pessoas.filter((x) => x.portal)) {
    const acesso = {
      senhaHash: hash, termoVersaoAceita: CONFIGURACAO_PADRAO.termoVersao,
      termoAceitoEm: instanteEmBrasilia(anteontem, "07:30"), termoAceitoIp: "127.0.0.1", ultimoAcessoEm: instanteEmBrasilia(ontem, "07:50"),
    };
    await db.insert(schema.colaboradoresAcesso).values({ collaboratorId: p.colab.id, ...acesso })
      .onConflictDoUpdate({ target: schema.colaboradoresAcesso.collaboratorId, set: acesso });
    portal.push({ nome: p.colab.fullName, cpf: p.colab.officialDocument });
  }
  return { pessoas: pessoas.length, portal };
}
