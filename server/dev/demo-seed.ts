/**
 * Seed do MODO DEMONSTRAÇÃO (25/09) — dados realistas num Postgres embutido.
 *
 * Usado por `npm run dev:demo` (server/dev/demo.ts) para conferir as telas ao
 * vivo sem tocar em produção, e pelo teste server/test/demo-seed.test.ts.
 *
 * O que entra (tudo determinístico — PRNG com semente fixa; as datas são
 * relativas a HOJE para haver evento passado, em andamento e futuro):
 *  - 6 usuários, um por papel + um aprovador com canApproveCenotecnica
 *    (DEMO_USUARIOS; senha de todos: DEMO_SENHA);
 *  - 12 funções (cenotécnica, sup ceno, percurseiro, KA, gerente, produtor…)
 *    com valores padrão, responsáveis e aprovador da Escala;
 *  - 60 colaboradores (casa/freela/local, cidades variadas, alguns pendentes
 *    ou inativos);
 *  - 8 eventos (2 passados, 1 em andamento, 4 futuros, 1 excluído), sempre
 *    caindo em sábado/domingo;
 *  - 150 vagas cobrindo TODOS os status canônicos e fases (shared/vaga-status),
 *    com validationNote, empreita por empresa, tipos de atendimento/percurso/
 *    ceno freela;
 *  - passagens (ida/volta, conexão, emitidas), hospedagens, trocas (pendente/
 *    aprovada/rejeitada/permuta), pedidos de ajuste, grupos de Uber e quartos,
 *    Planejado/Realizado/Comparativo/NF/Flash para 2 eventos, bagagem,
 *    comentários, histórico da vaga e system_logs.
 *
 * Idempotente por atalho: se o admin de demonstração já existe, não semeia de
 * novo (o banco embutido nasce vazio a cada `dev:demo`, então isto só importa
 * para o teste, que compartilha o PGlite do arquivo).
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { faseParaStatus, type StatusDaVaga } from "@shared/vaga-status";
import { hojeISO } from "@shared/hoje-sp";
import { isCenotecnicaFunction } from "@shared/alimentacao";

type Db = NeonDatabase<typeof schema>;
/** Linha da vaga como o Drizzle grava (aceita createdAt/updatedAt, ao contrário do InsertTeamInclusion do zod). */
type LinhaDeVaga = typeof schema.teamInclusions.$inferInsert;

// ── Usuários ────────────────────────────────────────────────────────────────
export const DEMO_PAPEIS = ["admin", "production", "purchasing", "function_area", "financial", "aprovador"] as const;
export type DemoPapel = (typeof DEMO_PAPEIS)[number];

/** Senha de TODOS os usuários de demonstração (login por senha só existe fora de produção). */
export const DEMO_SENHA = "Demo@2026";

export const DEMO_USUARIOS: Record<DemoPapel, { email: string; name: string; role: string; area: string | null; canApproveCenotecnica: boolean }> = {
  admin: { email: "admin@demo.local", name: "Helena Martins", role: "admin", area: null, canApproveCenotecnica: false },
  production: { email: "producao@demo.local", name: "Rafael Nogueira", role: "production", area: "Logística Interna", canApproveCenotecnica: false },
  purchasing: { email: "compras@demo.local", name: "Camila Duarte", role: "purchasing", area: "Compras e Viagens", canApproveCenotecnica: false },
  function_area: { email: "area@demo.local", name: "Bruno Cardoso", role: "function_area", area: "Comercial", canApproveCenotecnica: false },
  financial: { email: "rh@demo.local", name: "Patrícia Lemos", role: "financial", area: "Recursos Humanos", canApproveCenotecnica: false },
  aprovador: { email: "aprovador@demo.local", name: "Marcos Vieira", role: "production", area: "Produção", canApproveCenotecnica: true },
};

// ── Catálogos ───────────────────────────────────────────────────────────────
const FUNCOES = [
  { name: "Cenotécnica", area: "Cenotecnia", cc: "1001", casa: 0, freela: 18_000, resp: "aprovador" },
  { name: "Sup Ceno", area: "Produção", cc: "1002", casa: 12_000, freela: 22_000, resp: "aprovador" },
  { name: "Percurseiro", area: "Percurso", cc: "1003", casa: 9_000, freela: 15_000, resp: "production" },
  { name: "Key Account", area: "Comercial", cc: "1004", casa: 20_000, freela: 32_000, resp: "function_area" },
  { name: "Gerente de Contas", area: "Comercial", cc: "1005", casa: 22_000, freela: 35_000, resp: "function_area" },
  { name: "Executivo de Contas", area: "Comercial", cc: "1006", casa: 15_000, freela: 25_000, resp: "function_area" },
  { name: "Produtor", area: "Produção", cc: "1007", casa: 14_000, freela: 24_000, resp: "production" },
  { name: "Ativação", area: "Marketing", cc: "1008", casa: 10_000, freela: 16_000, resp: "production" },
  { name: "Kit", area: "Operações", cc: "1009", casa: 9_000, freela: 14_000, resp: "production" },
  { name: "Montagem", area: "Operações", cc: "1010", casa: 9_000, freela: 15_000, resp: "production" },
  { name: "Atendimento", area: "Comercial", cc: "1011", casa: 12_000, freela: 20_000, resp: "function_area" },
  { name: "Fotografia", area: "Comunicação", cc: "1012", casa: 11_000, freela: 30_000, resp: "production" },
] as const;

const NOMES_M = ["João", "Pedro", "Lucas", "Mateus", "Gabriel", "Rafael", "Felipe", "Gustavo", "Thiago", "Bruno", "Diego", "André", "Carlos", "Eduardo", "Rodrigo", "Marcelo", "Fernando", "Leonardo", "Vinícius", "Henrique", "Caio", "Daniel", "Ricardo", "Paulo", "Renato", "Fábio", "Sérgio", "Alexandre", "Otávio", "Murilo"];
const NOMES_F = ["Maria", "Ana", "Juliana", "Fernanda", "Camila", "Beatriz", "Larissa", "Amanda", "Carolina", "Letícia", "Mariana", "Patrícia", "Renata", "Aline", "Bruna", "Daniela", "Gabriela", "Isabela", "Luana", "Natália", "Priscila", "Raquel", "Simone", "Tatiane", "Vanessa", "Débora", "Elaine", "Flávia", "Helena", "Ingrid"];
const SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes", "Freitas", "Cardoso", "Ramos", "Gonçalves", "Santana", "Teixeira", "Araújo", "Pinto", "Correia", "Cunha", "Batista"];
const CIDADES = ["São Paulo - SP", "Campinas - SP", "Rio de Janeiro - RJ", "Belo Horizonte - MG", "Curitiba - PR", "Porto Alegre - RS", "Salvador - BA", "Recife - PE", "Brasília - DF", "Florianópolis - SC", "Santos - SP", "Goiânia - GO"];
const AEROPORTOS: Record<string, string> = {
  "São Paulo - SP": "GRU", "Campinas - SP": "VCP", "Rio de Janeiro - RJ": "GIG", "Belo Horizonte - MG": "CNF", "Curitiba - PR": "CWB",
  "Porto Alegre - RS": "POA", "Salvador - BA": "SSA", "Recife - PE": "REC", "Brasília - DF": "BSB", "Florianópolis - SC": "FLN", "Santos - SP": "GRU", "Goiânia - GO": "GYN",
};
const CIAS = ["LATAM", "GOL", "Azul"];
const HOTEIS = ["Hotel Ibis Centro", "Mercure Executive", "Comfort Suites", "Novotel Arena", "Hotel Nacional Inn"];

// ── Utilidades determinísticas ──────────────────────────────────────────────
/** PRNG mulberry32: a mesma semente → a mesma sequência, em qualquer máquina. */
function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
/** Próximo sábado a partir de `iso` (o próprio dia, se já for sábado). */
function proximoSabado(iso: string): string {
  return addDias(iso, (6 - diaDaSemana(iso) + 7) % 7);
}
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
function em(iso: string, hora = "12:00"): Date {
  return new Date(`${iso}T${hora}:00-03:00`);
}
function cpf(n: number): string {
  const s = String(100_000_000 + n * 7919).padStart(9, "0").slice(-9);
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${String((n * 13) % 100).padStart(2, "0")}`;
}
function cnpjDeDemo(n: number): string {
  return `12.345.${String(600 + n).padStart(3, "0")}/0001-${String((n * 37) % 100).padStart(2, "0")}`;
}

// ── Plano das vagas por evento ──────────────────────────────────────────────
interface PlanoDeEvento {
  nome: string;
  local: string;
  cidade: string;
  /** Início relativo ao próximo sábado a partir de hoje, em dias. */
  inicioEmDias: number;
  duracaoDias: number;
  status: string;
  observacoes: string | null;
  /** Um status por vaga, na ordem em que as funções são sorteadas. */
  vagas: StatusDaVaga[];
}

const rep = (s: StatusDaVaga, n: number): StatusDaVaga[] => Array.from({ length: n }, () => s);

const PLANOS: PlanoDeEvento[] = [
  {
    nome: "Maratona Internacional de São Paulo", local: "Ibirapuera", cidade: "São Paulo - SP",
    inicioEmDias: -57, duracaoDias: 3, status: "concluido",
    observacoes: "Evento encerrado: prestação de contas e notas fiscais fechadas.",
    vagas: [...rep("concluido", 22), ...rep("cancelado", 2)],
  },
  {
    nome: "Meia Maratona do Rio", local: "Aterro do Flamengo", cidade: "Rio de Janeiro - RJ",
    inicioEmDias: -29, duracaoDias: 2, status: "planejado",
    observacoes: "Evento passado: Realizado em análise pelo RH.",
    vagas: [...rep("aprovado", 18), ...rep("cancelado", 2)],
  },
  {
    nome: "Circuito das Estações — Belo Horizonte", local: "Praça da Liberdade", cidade: "Belo Horizonte - MG",
    inicioEmDias: -1, duracaoDias: 3, status: "em_andamento",
    observacoes: "Em andamento — logística em campo.",
    vagas: [...rep("passagem_comprada", 5), ...rep("hospedagem_comprada", 4), ...rep("hospedagem_passagem_comprada", 8), ...rep("aprovado", 3), ...rep("aprovacao", 2), ...rep("cancelado", 2)],
  },
  {
    nome: "Corrida Noturna de Curitiba", local: "Parque Barigui", cidade: "Curitiba - PR",
    inicioEmDias: 14, duracaoDias: 2, status: "planejado",
    observacoes: null,
    vagas: [...rep("escalado", 8), ...rep("passagem", 5), ...rep("hospedagem", 3), ...rep("aguardando_producao", 3), ...rep("planejado", 4), "reaberto", "escalacao", "cancelado"],
  },
  {
    nome: "Night Run Porto Alegre", local: "Orla do Guaíba", cidade: "Porto Alegre - RS",
    inicioEmDias: 28, duracaoDias: 2, status: "planejado",
    observacoes: null,
    vagas: [...rep("planejado", 8), ...rep("escalado", 6), ...rep("passagem", 2), ...rep("hospedagem", 2)],
  },
  {
    nome: "Maratona de Salvador", local: "Farol da Barra", cidade: "Salvador - BA",
    inicioEmDias: 42, duracaoDias: 3, status: "planejado",
    observacoes: "Escala sugerida pela logística — em validação pelas áreas.",
    vagas: [...rep("sugestao_pendente", 6), ...rep("sugestao_validada", 5), ...rep("sugestao_ajuste", 3), ...rep("sugestao_negada", 2), "sugestao_aprovada", "planejado"],
  },
  {
    nome: "Track & Field Series — Recife", local: "Parque Dona Lindu", cidade: "Recife - PE",
    inicioEmDias: 63, duracaoDias: 2, status: "planejado",
    observacoes: null,
    vagas: [...rep("sugestao_pendente", 10), ...rep("sugestao_validada", 4)],
  },
  {
    nome: "Corrida de Rua Campinas (cancelada)", local: "Lagoa do Taquaral", cidade: "Campinas - SP",
    inicioEmDias: 21, duracaoDias: 1, status: "excluído",
    observacoes: "Evento excluído pelo administrador — patrocinador desistiu.",
    vagas: rep("cancelado", 6),
  },
];

const COM_PASSAGEM_COMPRADA = new Set<string>(["passagem_comprada", "hospedagem_passagem_comprada", "aprovado", "aprovacao", "concluido"]);
const COM_HOSPEDAGEM_COMPRADA = new Set<string>(["hospedagem_comprada", "hospedagem_passagem_comprada", "aprovado", "aprovacao", "concluido"]);
/** Status em que a vaga tem colaborador definido (as demais podem ficar "a definir"). */
const SEM_COLABORADOR_POSSIVEL = new Set<string>(["planejado", "escalacao", "reaberto", "sugestao_pendente"]);

export interface ResumoDoSeed {
  usuarios: Record<DemoPapel, string>;
  funcoes: number;
  colaboradores: number;
  eventos: number;
  vagas: number;
  passagens: number;
  hospedagens: number;
  trocas: number;
  pedidosDeAjuste: number;
  planejado: number;
  realizado: number;
  notasFiscais: number;
}

/** Semeia o banco; devolve um resumo com os ids dos usuários. */
export async function semearDemo(db: Db): Promise<ResumoDoSeed> {
  const jaTem = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.admin.email));
  if (jaTem.length > 0) {
    return resumoExistente(db);
  }

  const rnd = prng(20_260_925);
  const escolher = <T,>(lista: readonly T[]): T => lista[Math.floor(rnd() * lista.length)];
  const hoje = hojeISO();
  const sabado = proximoSabado(hoje);
  const senhaHash = await bcrypt.hash(DEMO_SENHA, 4);

  // ── Usuários ──────────────────────────────────────────────────────────────
  const usuarios = {} as Record<DemoPapel, schema.User>;
  for (const papel of DEMO_PAPEIS) {
    const u = DEMO_USUARIOS[papel];
    const [row] = await db.insert(schema.users).values({
      email: u.email, name: u.name, role: u.role, area: u.area, password: senhaHash,
      status: "approved", isActive: true, canApproveCenotecnica: u.canApproveCenotecnica,
      createdAt: em(addDias(hoje, -120)),
    }).returning();
    usuarios[papel] = row;
  }
  const u = usuarios;

  // ── Funções, valores, responsáveis ────────────────────────────────────────
  const funcoes: schema.Function[] = [];
  for (const f of FUNCOES) {
    const [row] = await db.insert(schema.functions).values({
      name: f.name, description: `Função de ${f.area.toLowerCase()} nos eventos`, responsibleArea: f.area,
      costCenter: f.cc, quantity: 1, userId: u[f.resp as DemoPapel].id, createdAt: em(addDias(hoje, -110)),
    }).returning();
    funcoes.push(row);
    await db.insert(schema.functionValues).values({
      functionId: row.id,
      dailyValue: f.casa, dailyValueWeekend: f.casa, dailyValueFreela: f.freela, dailyValueFreelaWeekend: Math.round(f.freela * 1.2),
      costAssistance: 0, weekdayLunch: 4000, weekdayDinner: 4000, weekendLunch: 4000, weekendDinner: 4000, mobility: 5800, transport: 0,
    });
    await db.insert(schema.functionUsers).values({ functionId: row.id, userId: u[f.resp as DemoPapel].id });
    // Escala: o aprovador decide os pedidos de todas as funções; validador é o responsável da área
    await db.insert(schema.scalingFunctionManagers).values([
      { functionId: row.id, userId: u.aprovador.id, role: "aprovador" },
      { functionId: row.id, userId: u[f.resp as DemoPapel].id, role: "validador" },
    ]);
    await db.insert(schema.functionManagers).values({ functionId: row.id, userId: u[f.resp as DemoPapel].id, role: "validador" });
  }
  const funcaoPorNome = (nome: string): schema.Function => funcoes.find((f) => f.name === nome)!;
  const valorDiaria = (fn: schema.Function, tipo: string): number => {
    const spec = FUNCOES.find((f) => f.name === fn.name)!;
    return tipo === "casa" ? spec.casa : spec.freela;
  };

  await db.insert(schema.systemSettings).values([
    { key: "escala_aprovador_padrao", value: u.aprovador.id, updatedBy: u.admin.id },
  ]);
  await db.insert(schema.paymentCompanies).values([
    { name: "Norte Eventos Esportivos Ltda", cnpj: cnpjDeDemo(1) },
    { name: "CSC do Esporte S/A", cnpj: cnpjDeDemo(2) },
  ]);

  // ── Colaboradores ─────────────────────────────────────────────────────────
  const colaboradores: schema.Collaborator[] = [];
  const nomesUsados = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const feminino = i % 2 === 1;
    let nome = "";
    do {
      nome = `${escolher(feminino ? NOMES_F : NOMES_M)} ${escolher(SOBRENOMES)} ${escolher(SOBRENOMES)}`;
    } while (nomesUsados.has(nome));
    nomesUsados.add(nome);
    const tipo = i % 5 === 4 ? "local" : i % 3 === 0 ? "casa" : "freela";
    const status = i >= 57 ? "pendente" : "aprovado";
    const ativo = !(i === 55 || i === 56);
    const cidade = tipo === "local" ? "São Paulo - SP" : CIDADES[i % CIDADES.length];
    const [row] = await db.insert(schema.collaborators).values({
      fullName: nome, officialDocument: cpf(i + 1), documentType: "cpf",
      secondaryDocument: `${10_000_000 + i * 3571}`, secondaryDocumentType: "rg",
      birthDate: addDias("1980-01-15", i * 97), type: tipo, phone: `(11) 9${String(8000_0000 + i * 12_345).slice(0, 4)}-${String(1000 + i * 17).slice(-4)}`,
      city: cidade, state: cidade.slice(-2), gender: feminino ? "female" : "male",
      status, approvedBy: status === "aprovado" ? u.admin.id : null, approvedAt: status === "aprovado" ? em(addDias(hoje, -90 + i)) : null,
      isCoordinator: i === 3 || i === 10,
      active: ativo, inactiveReason: ativo ? null : "Não atende mais aos requisitos da operação", inactivatedAt: ativo ? null : em(addDias(hoje, -10)),
      createdBy: u.production.id, createdByName: u.production.name, createdAt: em(addDias(hoje, -100 + i)),
    }).returning();
    colaboradores.push(row);
  }
  /** Só os escaláveis: aprovados e ativos. */
  const escalaveis = colaboradores.filter((c) => c.status === "aprovado" && c.active);

  // ── Eventos e vagas ───────────────────────────────────────────────────────
  const eventos: schema.Event[] = [];
  const vagas: schema.TeamInclusion[] = [];
  const vagasPorEvento = new Map<string, schema.TeamInclusion[]>();
  let passagens = 0;
  let hospedagens = 0;
  const logsDaVaga: schema.InsertTeamInclusionLog[] = [];
  const logsDoSistema: schema.InsertSystemLog[] = [];

  for (const plano of PLANOS) {
    const inicio = addDias(sabado, plano.inicioEmDias);
    const fim = addDias(inicio, plano.duracaoDias - 1);
    const [evento] = await db.insert(schema.events).values({
      name: plano.nome, location: `${plano.local}, ${plano.cidade}`, startDate: inicio, endDate: fim,
      observations: plano.observacoes, status: plano.status,
      paymentCompanyName: "Norte Eventos Esportivos Ltda", paymentCompanyCnpj: cnpjDeDemo(1),
      createdAt: em(addDias(inicio, -45)),
    }).returning();
    eventos.push(evento);
    logsDoSistema.push(logDoSistema("create", "event", evento.id, evento.name, `Evento "${evento.name}" criado`, u.production, em(addDias(inicio, -45))));

    const linhas: LinhaDeVaga[] = [];
    const doEvento: schema.TeamInclusion[] = [];
    const usadosNoEvento = new Set<string>();
    let ponteiro = Math.floor(rnd() * escalaveis.length);
    const proximoColaborador = (): schema.Collaborator => {
      for (let tentativas = 0; tentativas < escalaveis.length; tentativas++) {
        const c = escalaveis[(ponteiro + tentativas) % escalaveis.length];
        if (!usadosNoEvento.has(c.id)) {
          ponteiro = (ponteiro + tentativas + 1) % escalaveis.length;
          usadosNoEvento.add(c.id);
          return c;
        }
      }
      throw new Error("Seed: colaboradores insuficientes para o evento");
    };

    plano.vagas.forEach((status, i) => {
      // "Aguardando gestor" só existe em cenotécnica (Cenotécnica / Sup Ceno);
      // nas demais, a função gira pelo catálogo (módulo positivo — o offset pode ser negativo).
      const idxFuncao = (((i * 5 + plano.inicioEmDias) % funcoes.length) + funcoes.length) % funcoes.length;
      const fn = status === "aguardando_producao" ? funcaoPorNome(i % 3 === 2 ? "Sup Ceno" : "Cenotécnica") : funcoes[idxFuncao];
      const semColaborador = SEM_COLABORADOR_POSSIVEL.has(status) && i % 3 === 0;
      const empreita = status === "aguardando_producao" && fn.name === "Cenotécnica" && i % 2 === 0;
      const colab = semColaborador || empreita ? null : proximoColaborador();
      const ehSugestao = status.startsWith("sugestao_");
      const cidadeDoColab = colab?.city ?? plano.cidade;
      const precisaViajar = !!colab && colab.type !== "local" && cidadeDoColab !== plano.cidade;
      const diasTrabalho = plano.duracaoDias + (fn.name === "Montagem" || isCenotecnicaFunction(fn.name) ? 1 : 0);
      const inicioVaga = addDias(inicio, diasTrabalho > plano.duracaoDias ? -1 : 0);
      const criadaEm = em(addDias(inicio, -30 + (i % 7)), "09:30");
      const fase = ehSugestao ? "sugestao" : (faseParaStatus(status) ?? "inclusao");
      const validada = status === "sugestao_validada" || status === "sugestao_ajuste" || status === "sugestao_negada" || status === "sugestao_aprovada";
      const linha: LinhaDeVaga = {
        eventId: evento.id, functionId: fn.id, collaboratorId: colab?.id ?? null,
        area: fn.responsibleArea, emitsNf: colab ? colab.type === "freela" && i % 6 !== 5 : true,
        atendimentoTipo: fn.name === "Atendimento" ? (i % 2 ? "key_account" : "executivo_contas") : null,
        percurseiroTipo: fn.name === "Percurseiro" ? (i % 2 ? "tipo_1" : "tipo_2") : null,
        cenoFreelaTipo: fn.name === "Cenotécnica" && colab && colab.type !== "casa" ? (["viagem", "sp", "local_a", "local_b"] as const)[i % 4] : null,
        empreitaEmpresa: empreita ? "Cenotech Estruturas ME" : null,
        empreitaPessoas: empreita ? 6 : null,
        empreitaValor: empreita ? 1_800_000 : null,
        rowOrder: i + 1,
        scheduleStartDate: inicioVaga, scheduleEndDate: fim,
        actualStartDate: status === "concluido" ? inicioVaga : null, actualEndDate: status === "concluido" ? fim : null,
        flightDepartureDate: precisaViajar ? addDias(inicioVaga, -1) : null,
        flightDepartureSuggestedTime: precisaViajar ? "07:30" : null,
        flightArrivalSuggestedTime: precisaViajar ? "10:15" : null,
        flightReturnDate: precisaViajar ? addDias(fim, 1) : null,
        flightReturnSuggestedTime: precisaViajar ? "18:40" : null,
        needsTicket: precisaViajar, needsAccommodation: precisaViajar,
        transportModeIda: ehSugestao ? (precisaViajar ? "aereo" : "carro") : null,
        transportModeVolta: ehSugestao ? (precisaViajar ? "aereo" : "carro") : null,
        suggestionSentAt: ehSugestao || (plano.inicioEmDias === 42 && status === "planejado") ? em(addDias(inicio, -28)) : null,
        validatedAt: validada ? em(addDias(inicio, -25), "15:10") : null,
        validatedBy: validada ? u.function_area.id : null,
        validationNote: validada && i % 2 === 0 ? escolher([
          "Confirmado com a área: colaborador já trabalhou neste circuito.",
          "Pedimos atenção ao horário do voo de volta — evento termina tarde.",
          "Validado; sugerimos hospedagem próxima ao parque.",
        ]) : null,
        dailyRates: diasTrabalho, dailyValue: colab ? valorDiaria(fn, colab.type) : 0,
        actualDailyRates: status === "concluido" ? diasTrabalho : null,
        observations: i % 9 === 0 ? "Chegar 1h antes da abertura do portão." : null,
        actualObservations: status === "concluido" && i % 4 === 0 ? "Ficou até o fim da desmontagem." : null,
        emergencyRecord: false, skipUber: colab?.type === "local" || i % 11 === 0,
        city: cidadeDoColab,
        status, previousStatus: status === "cancelado" ? "escalado" : null, phase: fase,
        userId: fn.userId ?? u.production.id,
        updatedBy: u.production.id,
        deletedAt: null, deletedBy: null,
        approvedByProduction: status === "concluido" || status === "aprovado" ? (isCenotecnicaFunction(fn.name) ? u.aprovador.id : null) : null,
        approvedByProductionAt: null,
        createdAt: criadaEm, updatedAt: em(addDias(inicio, -20 + (i % 5)), "16:45"),
      };
      linhas.push(linha);
    });

    for (const linha of linhas) {
      const [vaga] = await db.insert(schema.teamInclusions).values(linha).returning();
      vagas.push(vaga);
      doEvento.push(vaga);
      logsDaVaga.push({
        teamInclusionId: vaga.id, action: "created", details: `Vaga #${vaga.inclusionNumber} criada (${funcoes.find((f) => f.id === vaga.functionId)?.name})`,
        previousValue: null, newValue: vaga.status, userId: u.production.id, userName: u.production.name, createdAt: vaga.createdAt,
      } as schema.InsertTeamInclusionLog);
      if (vaga.status !== "planejado" && !vaga.status.startsWith("sugestao_")) {
        logsDaVaga.push({
          teamInclusionId: vaga.id, action: "status_changed", details: `Status alterado de planejado para ${vaga.status}`,
          previousValue: "planejado", newValue: vaga.status, userId: u.production.id, userName: u.production.name,
          createdAt: em(addDias(inicio, -18), "10:05"),
        } as schema.InsertTeamInclusionLog);
      }

      // Passagem
      const colab = vaga.collaboratorId ? colaboradores.find((c) => c.id === vaga.collaboratorId) : null;
      if (vaga.needsTicket && COM_PASSAGEM_COMPRADA.has(vaga.status) && colab) {
        const conexao = passagens % 4 === 3;
        const emitida = vaga.status === "concluido" || vaga.status === "aprovado" || passagens % 2 === 0;
        const origemAeroporto = AEROPORTOS[colab.city] ?? "GRU";
        const destinoAeroporto = AEROPORTOS[plano.cidade] ?? "GRU";
        await db.insert(schema.tickets).values({
          teamInclusionId: vaga.id, transportType: "aereo",
          purchaseDate: addDias(inicio, -12),
          actualDepartureDate: vaga.flightDepartureDate, actualDepartureTime: conexao ? "05:50" : "07:30", actualArrivalTime: conexao ? "12:35" : "09:10",
          actualReturnDate: vaga.flightReturnDate, actualReturnTime: "18:40", returnArrivalTime: conexao ? "23:55" : "20:20",
          departureCityOrigin: colab.city, departureCityDestination: plano.cidade,
          returnCityOrigin: plano.cidade, returnCityDestination: colab.city,
          departureAirport: origemAeroporto, destinationAirport: destinoAeroporto,
          returnOriginAirport: destinoAeroporto, returnDestinationAirport: origemAeroporto,
          value: 78_000 + (passagens % 7) * 12_500,
          purchaseOrderNumber: `OC-2026-${String(4100 + passagens).padStart(4, "0")}`,
          cardLastFourDigits: escolher(["4412", "0087", "9931"]),
          ticketObservations: conexao ? "Conexão em Brasília (BSB) — 1h40 de espera." : null,
          ticketCompany: escolher(CIAS), ticketStatus: "comprada",
          emittedAt: emitida ? em(addDias(inicio, -11), "11:20") : null, emittedBy: emitida ? u.purchasing.id : null,
          locator: `${escolher(["ABC", "XKQ", "MZP", "TRW"])}${String(100 + passagens)}`,
          checkIn3: vaga.status === "concluido" ? "OK" : null,
          baggageTotalCents: passagens % 5 === 0 ? 15_000 : null, baggageOc: passagens % 5 === 0 ? `OC-BAG-${passagens}` : null,
          updatedBy: u.purchasing.id, createdAt: em(addDias(inicio, -12), "14:00"),
        });
        passagens++;
      }
      // Hospedagem
      if (vaga.needsAccommodation && COM_HOSPEDAGEM_COMPRADA.has(vaga.status) && colab) {
        const noites = diasEntre(vaga.scheduleStartDate ?? inicio, fim) + 1;
        const diaria = 28_000 + (hospedagens % 4) * 6_000;
        await db.insert(schema.accommodations).values({
          teamInclusionId: vaga.id,
          checkInDate: addDias(vaga.scheduleStartDate ?? inicio, -1), checkInTime: "14:00",
          checkOutDate: addDias(fim, 1), checkOutTime: "12:00",
          hotelLocation: plano.cidade, hotelName: escolher(HOTEIS),
          dailyRate: diaria, nightsCount: noites, totalCents: diaria * noites,
          reservationNumber: `RES-${String(7000 + hospedagens)}`,
          roomType: hospedagens % 3 === 0 ? "single" : "duplo",
          lateCheckout: hospedagens % 6 === 0,
          paymentCompany: "Norte Eventos Esportivos Ltda", hotelOc: `OC-2026-${String(5200 + hospedagens).padStart(4, "0")}`,
          hotelStatus: vaga.status === "concluido" ? "confirmada" : "reservada",
          checkIn4: vaga.status === "concluido" ? "OK" : null,
          updatedBy: u.purchasing.id, createdAt: em(addDias(inicio, -10), "10:00"),
        });
        hospedagens++;
      }
    }
    vagasPorEvento.set(evento.id, doEvento);
  }

  await db.insert(schema.teamInclusionLogs).values(logsDaVaga);

  const [evSP, evRio, evBH, evCuritiba, , evSalvador] = eventos;
  const vagasDe = (ev: schema.Event): schema.TeamInclusion[] => vagasPorEvento.get(ev.id) ?? [];
  const nomeDoColab = (id: string | null | undefined): string => colaboradores.find((c) => c.id === id)?.fullName ?? "—";

  // ── Trocas (Curitiba) ─────────────────────────────────────────────────────
  const escaladasCuritiba = vagasDe(evCuritiba).filter((v) => v.status === "escalado" && v.collaboratorId);
  const livres = escalaveis.filter((c) => !vagasDe(evCuritiba).some((v) => v.collaboratorId === c.id));
  const trocas: (typeof schema.swapRequests.$inferInsert)[] = [
    {
      teamInclusionId: escaladasCuritiba[0].id, requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      currentCollaboratorId: escaladasCuritiba[0].collaboratorId, newCollaboratorId: livres[0].id, newCity: livres[0].city,
      reason: "Colaborador atual teve imprevisto familiar e não poderá viajar.", swapKind: "substituicao", status: "pendente",
      createdAt: em(addDias(hoje, -2), "09:12"),
    },
    {
      teamInclusionId: escaladasCuritiba[1].id, requestedBy: u.production.id, requestedByName: u.production.name,
      currentCollaboratorId: livres[1].id, newCollaboratorId: escaladasCuritiba[1].collaboratorId, newCity: escaladasCuritiba[1].city,
      reason: "Troca por disponibilidade de agenda.", swapKind: "substituicao", status: "aprovado",
      reviewComment: "Aprovado — passagem será remarcada.", reviewedBy: u.purchasing.id, reviewedByName: u.purchasing.name, reviewedAt: em(addDias(hoje, -4), "17:30"),
      createdAt: em(addDias(hoje, -5), "11:00"),
    },
    {
      teamInclusionId: escaladasCuritiba[2].id, requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      currentCollaboratorId: escaladasCuritiba[2].collaboratorId, newCollaboratorId: livres[2].id, newCity: livres[2].city,
      reason: "Preferência da área por perfil mais experiente.", swapKind: "substituicao", status: "rejeitado",
      reviewComment: "Recusado — passagem já emitida e sem tempo hábil.", reviewedBy: u.purchasing.id, reviewedByName: u.purchasing.name, reviewedAt: em(addDias(hoje, -3), "10:45"),
      createdAt: em(addDias(hoje, -6), "08:20"),
    },
    {
      teamInclusionId: escaladasCuritiba[3].id, requestedBy: u.production.id, requestedByName: u.production.name,
      currentCollaboratorId: escaladasCuritiba[3].collaboratorId, newCollaboratorId: escaladasCuritiba[4].collaboratorId, newCity: escaladasCuritiba[4].city,
      reason: "Permuta: os dois pediram para trocar de função entre si.", swapKind: "permuta", status: "pendente",
      pairedInclusionId: escaladasCuritiba[4].id, pairedNewCity: escaladasCuritiba[3].city,
      createdAt: em(addDias(hoje, -1), "14:05"),
    },
  ];
  await db.insert(schema.swapRequests).values(trocas);

  // ── Pedidos de ajuste (Salvador) ──────────────────────────────────────────
  const vagasSalvador = vagasDe(evSalvador);
  const emAjuste = vagasSalvador.filter((v) => v.status === "sugestao_ajuste");
  const negadas = vagasSalvador.filter((v) => v.status === "sugestao_negada");
  const pedidos: (typeof schema.scalingChangeRequests.$inferInsert)[] = [
    {
      teamInclusionId: emAjuste[0].id, eventId: evSalvador.id, functionId: emAjuste[0].functionId, area: emAjuste[0].area,
      requestType: "ajuste", requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      // jsonb tipado (25/09): só campos de proposedChangesSchema
      proposedChanges: { v: 1, flightDepartureDate: addDias(emAjuste[0].scheduleStartDate!, -1), transportModeIda: "onibus" },
      reason: "Precisa chegar um dia antes para a reunião de alinhamento.", status: "pendente", createdAt: em(addDias(hoje, -3), "10:00"),
    },
    {
      teamInclusionId: emAjuste[1].id, eventId: evSalvador.id, functionId: emAjuste[1].functionId, area: emAjuste[1].area,
      requestType: "exclusao", requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      reason: "Função não será necessária neste evento (patrocinador reduziu a ativação).", status: "pendente", createdAt: em(addDias(hoje, -2), "16:30"),
    },
    {
      teamInclusionId: emAjuste[2].id, eventId: evSalvador.id, functionId: emAjuste[2].functionId, area: emAjuste[2].area,
      requestType: "ajuste", requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      proposedChanges: { v: 1, observations: `Trocar por ${livres[3].fullName}, que já conhece o circuito.` },
      reason: "Trocar pelo colaborador que já conhece o circuito.", status: "aprovado",
      reviewComment: "Aprovado pelo aprovador.", reviewedBy: u.aprovador.id, reviewedByName: u.aprovador.name, reviewedAt: em(addDias(hoje, -1), "09:00"),
      createdAt: em(addDias(hoje, -4), "11:15"),
    },
    {
      teamInclusionId: negadas[0].id, eventId: evSalvador.id, functionId: negadas[0].functionId, area: negadas[0].area,
      requestType: "exclusao", requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      reason: "Vaga duplicada.", status: "negado",
      reviewComment: "A vaga é necessária — negado.", reviewedBy: u.aprovador.id, reviewedByName: u.aprovador.name, reviewedAt: em(addDias(hoje, -2), "13:40"),
      createdAt: em(addDias(hoje, -5), "15:00"),
    },
    {
      teamInclusionId: null, eventId: evSalvador.id, functionId: funcaoPorNome("Fotografia").id, area: "Comunicação",
      requestType: "inclusao", requestedBy: u.function_area.id, requestedByName: u.function_area.name,
      proposedChanges: { v: 1, quantity: 1, workDays: [evSalvador.startDate, evSalvador.endDate], dailyRates: 2 },
      reason: "Cobertura fotográfica extra para o patrocinador principal.", status: "pendente", createdAt: em(addDias(hoje, -1), "08:50"),
    },
  ];
  await db.insert(schema.scalingChangeRequests).values(pedidos);

  // ── Grupos de Uber e quartos (BH e Curitiba) ──────────────────────────────
  for (const [ev, sufixo] of [[evBH, "BH"], [evCuritiba, "CWB"]] as const) {
    const viajantes = vagasDe(ev).filter((v) => v.needsTicket && v.collaboratorId && v.status !== "cancelado");
    const [gIda] = await db.insert(schema.uberGroups).values({
      eventId: ev.id, groupName: `Carro 1 — chegada ${sufixo}`, direction: "ida", origin: "Aeroporto", destination: "Hotel",
      date: addDias(ev.startDate, -1), time: "10:30", suggestedTime: "10:30", manualTime: null, estimatedTotalCents: 9_500,
      titularCollaboratorId: viajantes[0]?.collaboratorId ?? null, status: "confirmado", suggested: true, confirmed: true,
    }).returning();
    const [gVolta] = await db.insert(schema.uberGroups).values({
      eventId: ev.id, groupName: `Carro 2 — retorno ${sufixo}`, direction: "volta", origin: "Hotel", destination: "Aeroporto",
      date: addDias(ev.endDate, 1), time: "16:00", suggestedTime: "15:30", manualTime: "16:00", estimatedTotalCents: 11_000,
      titularCollaboratorId: viajantes[1]?.collaboratorId ?? null, status: "sugerido", suggested: true, confirmed: false,
    }).returning();
    const membros = viajantes.slice(0, 4);
    if (membros.length > 0) {
      await db.insert(schema.uberGroupMembers).values(membros.map((v, i) => ({
        uberGroupId: i < 2 ? gIda.id : gVolta.id, collaboratorId: v.collaboratorId!, estimatedShareCents: 2_750, confirmed: i < 2,
      })));
    }
    const homens = viajantes.filter((v) => colaboradores.find((c) => c.id === v.collaboratorId)?.gender === "male").slice(0, 2);
    const mulheres = viajantes.filter((v) => colaboradores.find((c) => c.id === v.collaboratorId)?.gender === "female").slice(0, 2);
    for (const [grupo, regra] of [[homens, "male"], [mulheres, "female"]] as const) {
      if (grupo.length === 0) continue;
      const [quarto] = await db.insert(schema.hotelRoomGroups).values({
        eventId: ev.id, hotelName: HOTEIS[0], roomType: grupo.length > 1 ? "double" : "single", genderRule: regra,
        checkInDate: addDias(ev.startDate, -1), checkOutDate: addDias(ev.endDate, 1), suggested: true, confirmed: regra === "male",
      }).returning();
      await db.insert(schema.hotelRoomGroupMembers).values(grupo.map((v) => ({
        hotelRoomGroupId: quarto.id, collaboratorId: v.collaboratorId!, checkInDate: null, checkOutDate: null, confirmed: regra === "male",
      })));
    }
  }

  // ── Orçamento: Planejado / Realizado / Comparativo / NF / Flash ───────────
  let planejado = 0;
  let realizado = 0;
  let notasFiscais = 0;
  const invoicesStatus = ["aprovada_checkin", "aprovada", "enviada", "devolvida", "recusada", "pendente"] as const;

  for (const [ev, modo] of [[evSP, "fechado"], [evRio, "em_analise"], [evBH, "planejado"]] as const) {
    const ativas = vagasDe(ev).filter((v) => v.status !== "cancelado" && v.collaboratorId);
    let totalPlanejado = 0;
    let totalRealizado = 0;
    for (let i = 0; i < ativas.length; i++) {
      const v = ativas[i];
      const colab = colaboradores.find((c) => c.id === v.collaboratorId)!;
      const dias = v.dailyRates;
      const almoco = dias * 4000;
      const mobilidade = v.needsTicket ? 5800 * 2 : 0;
      const total = dias * v.dailyValue + almoco + almoco + mobilidade;
      const [pl] = await db.insert(schema.budgetPlanned).values({
        eventId: ev.id, collaboratorId: colab.id, functionId: v.functionId, collaboratorType: colab.type,
        dailyQuantity: dias, dailyValue: v.dailyValue, costAssistance: 0,
        weekdayLunch: almoco, weekdayDinner: almoco, weekendLunch: 0, weekendDinner: 0,
        mobility: mobilidade, mobilityIda: mobilidade / 2, mobilityVolta: mobilidade / 2, transport: 0, totalValue: total,
        status: modo === "planejado" ? "pendente" : "aprovado_rh",
        approvedBy: modo === "planejado" ? null : u.financial.id, approvedAt: modo === "planejado" ? null : em(addDias(ev.startDate, -7)),
        createdBy: u.financial.id, createdAt: em(addDias(ev.startDate, -9), "09:00"), updatedAt: em(addDias(ev.startDate, -8), "09:00"),
      }).returning();
      planejado++;
      totalPlanejado += total;
      if (modo === "planejado") continue;
      // Realizado: no evento em análise, nem todos enviaram
      if (modo === "em_analise" && i >= 14) continue;
      const naoParticipou = modo === "fechado" && i === ativas.length - 1;
      const diasReais = naoParticipou ? 0 : dias + (i % 5 === 0 ? 1 : 0);
      const totalReal = naoParticipou ? 0 : diasReais * v.dailyValue + diasReais * 8000 + mobilidade;
      let rhStatus = "aprovado";
      let sentForReview = true;
      if (modo === "em_analise") {
        const ciclo = ["pendente", "pendente", "pendente", "pendente", "pendente", "aprovado", "aprovado", "aprovado", "aprovado", "devolvido", "devolvido", "rejeitado", "pendente", "pendente"] as const;
        rhStatus = ciclo[i];
        sentForReview = !(i >= 12); // os dois últimos ainda não enviaram
      }
      const [re] = await db.insert(schema.budgetActual).values({
        plannedId: pl.id, eventId: ev.id, collaboratorId: colab.id, functionId: v.functionId, collaboratorType: colab.type,
        dailyQuantity: diasReais, dailyValue: v.dailyValue, costAssistance: 0,
        weekdayLunch: naoParticipou ? 0 : diasReais * 4000, weekdayDinner: naoParticipou ? 0 : diasReais * 4000, weekendLunch: 0, weekendDinner: 0,
        mobility: naoParticipou ? 0 : mobilidade, mobilityIda: mobilidade / 2, mobilityVolta: mobilidade / 2, transport: 0, totalValue: totalReal,
        changeReason: diasReais !== dias && !naoParticipou ? "Ficou um dia a mais para a desmontagem." : null,
        paymentStatus: rhStatus === "aprovado" ? "confirmado" : "pendente",
        sentForReview, rhStatus, rhComment: rhStatus === "devolvido" ? "Confira a quantidade de diárias — o espelho registra 2." : rhStatus === "rejeitado" ? "Colaborador não consta no espelho operacional." : null,
        rhActionBy: rhStatus === "pendente" ? null : u.financial.id, rhActionAt: rhStatus === "pendente" ? null : em(addDias(ev.endDate, 3), "15:00"),
        resubmitted: false, workedDays: null, didNotAttend: naoParticipou, didNotAttendReason: naoParticipou ? "Atestado médico" : null,
        rhAdjusted: false, createdBy: u.production.id, createdAt: em(addDias(ev.endDate, 1), "10:00"), updatedAt: em(addDias(ev.endDate, 2), "11:30"),
      }).returning();
      realizado++;
      if (!naoParticipou) totalRealizado += totalReal;

      // Notas fiscais: só quem emite NF e já pode (Realizado enviado/aprovado)
      const emiteNf = v.emitsNf;
      const podeNf = rhStatus === "aprovado" || (sentForReview && rhStatus === "pendente");
      if (emiteNf && podeNf && !naoParticipou) {
        const st = modo === "fechado" ? invoicesStatus[i % invoicesStatus.length] : (i % 3 === 0 ? "aprovada" : i % 3 === 1 ? "enviada" : "pendente");
        if (st === "pendente") continue;
        const aprovada = st === "aprovada" || st === "aprovada_checkin";
        // Mesmo formato que a rota grava (type/at/…; jsonb desde 25/09)
        const historico: schema.HistoricoNfEntrada[] = [
          { type: "enviado", at: em(addDias(ev.endDate, 4)).toISOString(), by: colab.fullName },
          ...(aprovada ? [{ type: "aprovado", at: em(addDias(ev.endDate, 6)).toISOString(), by: u.financial.name }] : []),
        ];
        await db.insert(schema.invoices).values({
          eventId: ev.id, collaboratorId: colab.id, functionId: v.functionId, budgetActualId: re.id,
          oc: `OC-2026-${String(6100 + notasFiscais).padStart(4, "0")}`,
          attachmentUrl: `/objects/demo/nf-${notasFiscais}.pdf`, attachmentName: `NF-${String(1000 + notasFiscais)}-${colab.fullName.split(" ")[0]}.pdf`,
          paymentText: `NF ${1000 + notasFiscais} — ${colab.fullName} — ${v.dailyRates} diárias`,
          status: st === "aprovada_checkin" ? "aprovada" : st,
          returnComment: st === "devolvida" ? "Nota sem o número da OC — reenviar corrigida." : st === "recusada" ? "Valor diverge do Realizado aprovado." : null,
          paymentDate: st === "aprovada_checkin" ? addDias(ev.endDate, 20) : null,
          approvedAt: aprovada ? em(addDias(ev.endDate, 6)) : null,
          history: historico,
          checkinAt: st === "aprovada_checkin" ? em(addDias(ev.endDate, 21), "16:00") : null,
          checkinBy: st === "aprovada_checkin" ? u.financial.id : null,
          createdAt: em(addDias(ev.endDate, 4), "09:40"), updatedAt: em(addDias(ev.endDate, 6), "09:40"),
        });
        notasFiscais++;
        // Crédito automático do Flash na aprovação do comparativo (só o evento fechado)
        if (modo === "fechado" && aprovada && i % 2 === 0) {
          await db.insert(schema.flashMovements).values({
            collaboratorId: colab.id, eventId: ev.id, category: "alimentacao", type: "credito", amountCents: diasReais * 8000,
            movementDate: addDias(ev.endDate, 8), description: `Reposição alimentação — ${ev.name}`,
            createdBy: u.financial.id, createdByName: u.financial.name, sourceType: "comparativo", sourceRef: re.id,
          });
        }
      }
    }
    if (modo !== "planejado") {
      const variance = totalPlanejado - totalRealizado;
      await db.insert(schema.budgetComparison).values({
        eventId: ev.id, totalPlanned: totalPlanejado, totalActual: totalRealizado, variance,
        variancePercent: totalPlanejado > 0 ? Number(((variance / totalPlanejado) * 100).toFixed(2)) : 0,
        status: modo === "fechado" ? "aprovado" : "pendente",
        approvalObservation: modo === "fechado" ? "Aprovado sem ressalvas." : null,
        changesLog: [{ collaboratorId: null, changes: ["Realizado enviado"], reason: null }],
        approvedBy: modo === "fechado" ? u.financial.id : null, approvedAt: modo === "fechado" ? em(addDias(ev.endDate, 7)) : null,
        createdAt: em(addDias(ev.endDate, 2)), updatedAt: em(addDias(ev.endDate, 7)),
      });
    }
  }

  // ── Flash: crédito inicial de admissão para os 10 primeiros ───────────────
  await db.insert(schema.flashMovements).values(escalaveis.slice(0, 10).flatMap((c, i) => ([
    { collaboratorId: c.id, eventId: null, category: "alimentacao", type: "credito", amountCents: 35_000, movementDate: addDias(hoje, -80 + i), description: "Crédito inicial — admissão", createdBy: u.financial.id, createdByName: u.financial.name, sourceType: "manual", sourceRef: null },
    { collaboratorId: c.id, eventId: null, category: "mobilidade", type: "credito", amountCents: 15_000, movementDate: addDias(hoje, -80 + i), description: "Crédito inicial — admissão", createdBy: u.financial.id, createdByName: u.financial.name, sourceType: "manual", sourceRef: null },
  ])));
  await db.insert(schema.flashMovements).values({
    collaboratorId: escalaveis[0].id, eventId: evSP.id, category: "alimentacao", type: "debito", amountCents: 12_000, movementDate: addDias(evSP.endDate, 1),
    description: "Gasto no evento (extrato Flash)", createdBy: u.financial.id, createdByName: u.financial.name, sourceType: "manual", sourceRef: null,
  });

  // ── Bagagem ───────────────────────────────────────────────────────────────
  const comBagagem = [...vagasDe(evBH), ...vagasDe(evSP)].filter((v) => v.needsTicket && v.collaboratorId).slice(0, 6);
  await db.insert(schema.baggageRequests).values(comBagagem.map((v, i) => {
    const ev = eventos.find((e) => e.id === v.eventId)!;
    return {
      eventId: ev.id, collaboratorId: v.collaboratorId!, loc: `LOC${String(300 + i)}`, cia: ["Azul", "Gol", "TAM", "Outros"][i % 4],
      valueCents: 9_000 + i * 1_500, os: `OS-${String(88_000 + i)}`, quantity: 1 + (i % 2), agency: ["LCA", "Flytour", "Onfly", "Direto no site"][i % 4],
      requestDate: addDias(ev.startDate, -6), boardingDate: addDias(ev.startDate, -1),
      notes: i % 3 === 0 ? "Bagagem com material de ativação." : null,
      createdBy: u.purchasing.id, createdByName: u.purchasing.name, createdAt: em(addDias(ev.startDate, -6)),
    };
  }));
  await db.insert(schema.baggageHistory).values(escalaveis.slice(0, 3).map((c, i) => ({
    collaboratorId: c.id, cia: ["Azul", "Gol", "TAM"][i], quantity: 2 + i, sourceName: c.fullName.toUpperCase(),
  })));

  // ── Comentários e mural ───────────────────────────────────────────────────
  const comentaveis = [...vagasDe(evBH), ...vagasDe(evCuritiba)].filter((v) => v.collaboratorId).slice(0, 10);
  await db.insert(schema.comments).values(comentaveis.map((v, i) => ({
    teamInclusionId: v.id, userId: i % 2 ? u.purchasing.id : u.production.id, phase: v.phase,
    content: [
      "Voo remarcado para o dia anterior — chegada às 10h15.",
      "Colaborador confirmou presença por WhatsApp.",
      "Hotel próximo ao evento; check-in a partir das 14h.",
      "Aguardando confirmação da área para emitir a passagem.",
      "Precisa de crachá de acesso à área técnica.",
    ][i % 5],
    createdAt: em(addDias(hoje, -(i + 1)), "10:00"),
  })));
  await db.insert(schema.eventComments).values([
    { eventId: evBH.id, userId: u.production.id, content: "Reunião de alinhamento amanhã às 8h no hotel.", createdAt: em(addDias(hoje, -1), "18:20") },
    { eventId: evBH.id, userId: u.purchasing.id, content: "Todas as passagens do evento foram emitidas.", createdAt: em(addDias(hoje, -2), "12:10") },
    { eventId: evCuritiba.id, userId: u.admin.id, content: "Atenção ao prazo de compra: 10 dias antes do evento.", createdAt: em(addDias(hoje, -3), "09:00") },
    { eventId: evSalvador.id, userId: u.function_area.id, content: "Área Comercial validou 5 vagas; 3 com pedido de ajuste.", createdAt: em(addDias(hoje, -1), "16:40") },
  ]);

  // ── Histórico do sistema ──────────────────────────────────────────────────
  for (const c of colaboradores.slice(0, 12)) {
    logsDoSistema.push(logDoSistema("create", "collaborator", c.id, c.fullName, `Colaborador "${c.fullName}" cadastrado`, u.production, c.createdAt ?? new Date()));
    if (c.status === "aprovado") logsDoSistema.push(logDoSistema("approve", "collaborator", c.id, c.fullName, `Colaborador "${c.fullName}" aprovado`, u.admin, c.approvedAt ?? new Date()));
  }
  for (const v of vagasDe(evBH).slice(0, 8)) {
    logsDoSistema.push(logDoSistema("update", "team_inclusion", v.id, `Vaga #${v.inclusionNumber}`, `Escalação confirmada — ${nomeDoColab(v.collaboratorId)}`, u.production, v.updatedAt ?? new Date()));
  }
  logsDoSistema.push(logDoSistema("delete", "event", eventos[7].id, eventos[7].name, `Evento "${eventos[7].name}" excluído`, u.admin, em(addDias(hoje, -8))));
  logsDoSistema.push(logDoSistema("approve", "budget_comparison", evSP.id, evSP.name, "Comparativo aprovado pelo RH", u.financial, em(addDias(evSP.endDate, 7))));
  logsDoSistema.push(logDoSistema("update", "user", u.aprovador.id, u.aprovador.name, "Permissão de aprovar cenotécnica concedida", u.admin, em(addDias(hoje, -60))));
  await db.insert(schema.systemLogs).values(logsDoSistema);

  return {
    usuarios: Object.fromEntries(DEMO_PAPEIS.map((p) => [p, u[p].id])) as Record<DemoPapel, string>,
    funcoes: funcoes.length,
    colaboradores: colaboradores.length,
    eventos: eventos.length,
    vagas: vagas.length,
    passagens,
    hospedagens,
    trocas: trocas.length,
    pedidosDeAjuste: pedidos.length,
    planejado,
    realizado,
    notasFiscais,
  };
}

function logDoSistema(
  action: string, entityType: string, entityId: string, entityName: string, details: string,
  ator: schema.User, quando: Date,
): schema.InsertSystemLog & { createdAt: Date } {
  return {
    action, entityType, entityId, entityName, details, previousData: null, newData: null,
    userId: ator.id, userName: ator.name, ipAddress: "127.0.0.1", userAgent: "demo-seed", createdAt: quando,
  };
}

async function resumoExistente(db: Db): Promise<ResumoDoSeed> {
  const contar = async (tabela: { id?: unknown }): Promise<number> => {
    const rows = await db.select().from(tabela as never);
    return (rows as unknown[]).length;
  };
  const usuarios = {} as Record<DemoPapel, string>;
  for (const papel of DEMO_PAPEIS) {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS[papel].email));
    usuarios[papel] = row?.id ?? "";
  }
  return {
    usuarios,
    funcoes: await contar(schema.functions),
    colaboradores: await contar(schema.collaborators),
    eventos: await contar(schema.events),
    vagas: await contar(schema.teamInclusions),
    passagens: await contar(schema.tickets),
    hospedagens: await contar(schema.accommodations),
    trocas: await contar(schema.swapRequests),
    pedidosDeAjuste: await contar(schema.scalingChangeRequests),
    planejado: await contar(schema.budgetPlanned),
    realizado: await contar(schema.budgetActual),
    notasFiscais: await contar(schema.invoices),
  };
}
