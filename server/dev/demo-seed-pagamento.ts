/**
 * Seed das ORDENS DE COMPRA, NOTAS e PAGAMENTOS no modo demonstração (28/10,
 * Fase 2 MANUAL do Módulo de Honorários) — SÓ no demo (`npm run dev:demo`),
 * nunca em produção nem nos testes de rota. Tudo FICTÍCIO.
 *
 * Um evento do FLUXO NOVO (termina na data de corte padrão ou depois) com
 * seis prestações já aprovadas pela Conferência DP, uma em cada estado:
 *  - aprovada SEM OC (contrato ativo — a OC sai sem justificativa);
 *  - com OC, sem NF (CNPJ sem contrato: OC com justificativa) — acesso ao
 *    portal, sem conta cadastrada (o portal pede a conta no envio);
 *  - NF ENVIADA, com o valor da nota R$ 50 abaixo da OC (a conferência destaca);
 *  - NF DEVOLVIDA com o comentário do DP — acesso ao portal (reenvio);
 *  - PROGRAMADO (NF aprovada e lançada no M4, pagamento em 5 dias);
 *  - PAGO (há 2 dias).
 * Senha do portal: DEMO_SENHA_DO_COLABORADOR (o CPF de quem entra sai no log).
 */
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { DATA_DE_CORTE_PADRAO } from "@shared/legado-honorarios";
import { CONFIGURACAO_PADRAO, instanteEmBrasilia } from "@shared/presenca";
import { faseParaStatus } from "@shared/vaga-status";
import { DEMO_USUARIOS } from "./demo-seed";
import { DEMO_SENHA_DO_COLABORADOR } from "./demo-seed-presenca";

type Db = NeonDatabase<typeof schema>;

const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Um PDF mínimo válido (abre no navegador) com o texto da "nota". */
function pdfDaNota(texto: string): Buffer {
  const conteudo = `BT /F1 14 Tf 60 760 Td (${texto.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let corpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  corpo += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, "latin1");
}

export interface ResumoDoPagamentoDemo {
  prestacoes: number;
  portal: { nome: string; cpf: string }[];
}

export async function semearPagamentoDemo(db: Db): Promise<ResumoDoPagamentoDemo> {
  const vazio: ResumoDoPagamentoDemo = { prestacoes: 0, portal: [] };
  const NOME_DO_EVENTO = "Corrida Noturna do Recife";
  const ja = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.name, NOME_DO_EVENTO)).limit(1);
  if (ja.length) return vazio;
  const hoje = hojeISO();
  const [dp] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.financial.email));
  const [producao] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.production.email));
  if (!dp || !producao) return vazio;
  const funcoes = await db.select().from(schema.functions).where(inArray(schema.functions.name, ["Produtor", "Montagem"]));
  const funcao = (nome: string) => funcoes.find((f) => f.name === nome);
  if (!funcao("Produtor") || !funcao("Montagem")) return vazio;

  // Os 14 primeiros aprovados são os dos contratos (1 vence em breve; 2–5 a empreiteira ativa);
  // da presença, os três primeiros freelas depois deles — aqui, os seguintes.
  const aprovados = await db.select().from(schema.collaborators)
    .where(and(eq(schema.collaborators.status, "aprovado"), eq(schema.collaborators.active, true)))
    .orderBy(asc(schema.collaborators.collaboratorNumber));
  const freelas = aprovados.slice(14).filter((c) => c.type === "freela" && c.documentType === "cpf");
  if (aprovados.length < 6 || freelas.length < 5) return vazio;
  const contratoDe = async (collaboratorId: string) => {
    const [l] = await db.select({ c: schema.contratos }).from(schema.contratosColaboradores)
      .innerJoin(schema.contratos, eq(schema.contratos.id, schema.contratosColaboradores.contratoId))
      .where(eq(schema.contratosColaboradores.collaboratorId, collaboratorId)).limit(1);
    return l?.c ?? null;
  };

  const fim = [addDias(hoje, -3), DATA_DE_CORTE_PADRAO].sort()[1];
  const [empresa] = await db.select().from(schema.paymentCompanies).limit(1);
  const [evento] = await db.insert(schema.events).values({
    name: NOME_DO_EVENTO, location: "Marco Zero, Recife - PE", startDate: addDias(fim, -2), endDate: fim, status: "concluido",
    paymentCompanyName: empresa?.name ?? "Norte Marketing Esportivo Ltda",
    paymentCompanyCnpj: empresa ? digitosDoCnpj(empresa.cnpj) : digitosDoCnpj(completarCnpj("123456780001")),
    observations: "Evento de demonstração das ordens de compra, notas e pagamentos (Fase 2).",
  }).returning();
  const dias = [addDias(fim, -2), addDias(fim, -1), fim];

  type Estado = "sem_oc" | "com_oc" | "nf_enviada" | "nf_devolvida" | "programado" | "pago";
  const pessoas: { colab: schema.Collaborator; funcao: string; estado: Estado; portal?: boolean }[] = [
    { colab: aprovados[2], funcao: "Montagem", estado: "sem_oc" },
    { colab: freelas[3], funcao: "Produtor", estado: "com_oc", portal: true },
    { colab: aprovados[3], funcao: "Montagem", estado: "nf_enviada" },
    { colab: freelas[4], funcao: "Produtor", estado: "nf_devolvida", portal: true },
    { colab: aprovados[4], funcao: "Montagem", estado: "programado" },
    { colab: aprovados[1], funcao: "Produtor", estado: "pago" },
  ];

  const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
  const armazenamento = new ObjectStorageService();
  const guardarNota = async (nome: string, texto: string, dono: string) => {
    try {
      const id = novoIdDeAnexo();
      await armazenamento.enviarAnexo(id, pdfDaNota(texto), "application/pdf", { ownerId: dono, nomeOriginal: nome });
      return id;
    } catch {
      return null; // sem armazenamento (fora da demo): a nota fica sem arquivo
    }
  };

  const aprovadoEm = instanteEmBrasilia(hoje, "09:00");
  let oc = 4_500_120_000;
  for (let i = 0; i < pessoas.length; i++) {
    const p = pessoas[i];
    const f = funcao(p.funcao)!;
    const diaria = p.funcao === "Produtor" ? 24_000 : 15_000;
    const total = dias.length * (diaria + 8_500);
    const contrato = await contratoDe(p.colab.id);
    const [vaga] = await db.insert(schema.teamInclusions).values({
      eventId: evento.id, functionId: f.id, collaboratorId: p.colab.id, userId: producao.id,
      status: "aprovado", phase: faseParaStatus("aprovado") ?? "aprovacao",
      scheduleStartDate: dias[0], scheduleEndDate: dias[2], dailyRates: dias.length, dailyValue: diaria,
      needsTicket: false, needsAccommodation: false, city: p.colab.city,
    }).returning();
    const valores = {
      collaboratorType: "freela", dailyQuantity: dias.length, dailyValue: diaria, weekdayLunch: dias.length * 4_000, weekdayDinner: dias.length * 4_500,
      totalValue: total,
    };
    const [planejado] = await db.insert(schema.budgetPlanned).values({
      eventId: evento.id, collaboratorId: p.colab.id, functionId: f.id, teamInclusionId: vaga.id, ...valores,
      status: "pre_aprovado", approvedBy: dp.id, approvedAt: instanteEmBrasilia(addDias(hoje, -10), "10:00"), createdBy: dp.id,
    }).returning();
    const comOc = p.estado !== "sem_oc";
    const numero = String(++oc);
    const ocData = addDias(hoje, -(6 - i));
    const [actual] = await db.insert(schema.budgetActual).values({
      plannedId: planejado.id, eventId: evento.id, collaboratorId: p.colab.id, functionId: f.id, ...valores, workedDays: dias, createdBy: dp.id,
      sentForReview: true, rhStatus: "aprovado", rhActionBy: dp.id, rhActionAt: aprovadoEm,
      cnpjEmissor: contrato?.cnpj ?? null, razaoSocialEmissor: contrato?.razaoSocial ?? null,
      checkoutFinalEm: instanteEmBrasilia(dias[2], "20:00"), checkoutFinalPor: producao.id, valorCalculado: total,
      ...(comOc ? {
        ocNumero: numero, ocValor: total, ocData, ocRegistradaEm: instanteEmBrasilia(ocData, "11:00"), ocRegistradaPor: dp.id,
        ocOrigem: i % 2 ? "lote" : "manual",
        ocJustificativa: contrato ? null : "Contrato do CNPJ em renovação no jurídico (demonstração).",
      } : {}),
      ...(p.estado === "pago" ? { pagoEm: addDias(hoje, -2), pagoRegistradoPor: dp.id, pagoRegistradoEm: instanteEmBrasilia(addDias(hoje, -2), "16:00"), pagamentoObs: "TED compensada (demonstração)." } : {}),
    }).returning();

    if (p.estado === "nf_enviada" || p.estado === "nf_devolvida" || p.estado === "programado" || p.estado === "pago") {
      const enviadaEm = instanteEmBrasilia(addDias(hoje, -(5 - i)), "14:00");
      const nfValor = p.estado === "nf_enviada" ? total - 5_000 : total;
      const anexo = await guardarNota(`nf-${numero}.pdf`, `NFS-e demonstracao - OC ${numero} - R$ ${(nfValor / 100).toFixed(2)}`, `colaborador:${p.colab.id}`);
      const historico: schema.HistoricoNfEntrada[] = [{ type: "enviado", oc: numero, attachmentName: `nf-${numero}.pdf`, por: "colaborador", at: enviadaEm.toISOString() }];
      const programada = p.estado === "programado" || p.estado === "pago";
      if (p.estado === "nf_devolvida") historico.push({ type: "devolvido", comment: "O valor da nota não bate com a OC — emita de novo com o valor da OC.", at: new Date(enviadaEm.getTime() + 86_400_000).toISOString() });
      if (programada) {
        historico.push({ type: "aprovado", at: new Date(enviadaEm.getTime() + 3_600_000).toISOString() });
        historico.push({ type: "checkin", paymentDate: p.estado === "pago" ? addDias(hoje, -2) : addDias(hoje, 5), at: new Date(enviadaEm.getTime() + 7_200_000).toISOString() });
      }
      await db.insert(schema.invoices).values({
        eventId: evento.id, collaboratorId: p.colab.id, functionId: f.id, budgetActualId: actual.id, oc: numero,
        attachmentUrl: anexo ? `/api/attachments/${anexo}/view` : null, attachmentName: `nf-${numero}.pdf`,
        status: p.estado === "nf_devolvida" ? "devolvida" : programada ? "aprovada" : "enviada",
        returnComment: p.estado === "nf_devolvida" ? "O valor da nota não bate com a OC — emita de novo com o valor da OC." : null,
        nfNumero: String(2026_0000 + i), nfValor, nfCnpj: contrato?.cnpj ?? null,
        approvedAt: programada ? new Date(enviadaEm.getTime() + 3_600_000) : null,
        checkinAt: programada ? new Date(enviadaEm.getTime() + 7_200_000) : null, checkinBy: programada ? dp.id : null,
        paymentDate: programada ? (p.estado === "pago" ? addDias(hoje, -2) : addDias(hoje, 5)) : null,
        history: historico, createdAt: enviadaEm,
      });
    }
  }

  // Acesso ao portal: senha conhecida e termo aceito.
  const hash = await bcrypt.hash(DEMO_SENHA_DO_COLABORADOR, 4);
  const portal: ResumoDoPagamentoDemo["portal"] = [];
  for (const p of pessoas.filter((x) => x.portal)) {
    const acesso = {
      senhaHash: hash, termoVersaoAceita: CONFIGURACAO_PADRAO.termoVersao,
      termoAceitoEm: instanteEmBrasilia(addDias(hoje, -10), "07:30"), termoAceitoIp: "127.0.0.1",
    };
    await db.insert(schema.colaboradoresAcesso).values({ collaboratorId: p.colab.id, ...acesso })
      .onConflictDoUpdate({ target: schema.colaboradoresAcesso.collaboratorId, set: acesso });
    portal.push({ nome: p.colab.fullName, cpf: p.colab.officialDocument });
  }
  return { prestacoes: pessoas.length, portal };
}
