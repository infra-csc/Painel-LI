/**
 * Rooming list para o hotel (09/10, pedido do dono: "no final precisamos de
 * uma exportação em PDF para mandar para hotéis").
 *
 * Aqui só se MONTAM os dados do documento — puro, testável, sem gerar o
 * binário (o PDF é desenhado no navegador a partir deste resultado). Um
 * documento por hotel; quartos sem hotel definido ficam de fora (a tela avisa).
 * O tipo de cada quarto vem da ocupação noite a noite: um quarto pode ser
 * Single até o colega chegar e Duplo depois.
 */
import { diariasDosTrechos, ocupacaoPorNoite, rotuloDoTipo, type TipoDoTrecho } from "./ocupacao-por-noite";

export interface HospedeDaRoomingList {
  collaboratorId: string | null;
  /** Nome completo, já formatado pela tela. */
  nome: string;
  checkIn: string | null;
  checkOut: string | null;
  /** Só chega aqui quando a pessoa pediu "Incluir CPF" e tem CPF no cadastro. */
  cpf?: string | null;
}

export interface QuartoDaRoomingList {
  hotelName: string | null | undefined;
  /** Observação escrita no quarto (a automática de datas não vai: os trechos já dizem). */
  observacao?: string | null;
  hospedes: HospedeDaRoomingList[];
}

export interface EntradaDaRoomingList {
  hotel: string;
  evento: { nome: string; local: string | null; inicio: string | null; fim: string | null };
  quartos: QuartoDaRoomingList[];
  incluirCpf: boolean;
  geradoEm: Date;
  contato: { nome: string; email: string | null };
}

export interface LinhaDaRoomingList {
  numero: number;
  /** "Duplo" ou "13/11→14/11 Single; 14/11→16/11 Duplo". */
  tipo: string;
  hospedes: { nome: string; cpf: string | null; checkIn: string; checkOut: string }[];
  diarias: number;
  observacao: string | null;
}

export interface RoomingList {
  titulo: string;
  hotel: string;
  evento: string;
  cidade: string | null;
  /** Período do evento, por extenso curto ("14/11/2026 a 15/11/2026"). */
  periodoDoEvento: string | null;
  /** Primeira entrada → última saída dos hóspedes deste hotel. */
  periodoDaHospedagem: string | null;
  totalDeQuartos: number;
  totalDeHospedes: number;
  /** Quartos pelo tipo de PICO (o quarto que o hotel precisa separar). */
  quartosPorTipo: { tipo: string; quantidade: number }[];
  /** Diárias de quarto (room-nights) por tipo, noite a noite. */
  diariasPorTipo: { tipo: string; quantidade: number }[];
  totalDeDiarias: number;
  linhas: LinhaDaRoomingList[];
  incluiCpf: boolean;
  geradoEm: string;
  contato: string;
  nomeDoArquivo: string;
}

const ORDEM: TipoDoTrecho[] = ["single", "double", "triple"];

const ymd = (v: string | null | undefined): string | null => {
  const m = v ? String(v).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const ddmmaaaa = (v: string | null | undefined): string => {
  const d = ymd(v);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
};
const ddmm = (v: string | null | undefined): string => {
  const d = ymd(v);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—";
};
const periodo = (de: string | null | undefined, ate: string | null | undefined): string | null =>
  ymd(de) && ymd(ate) ? `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}` : ymd(de) ? ddmmaaaa(de) : null;

/** Mesma comparação de nome de hotel da tela: sem caixa e sem espaço sobrando. */
export const chaveDoHotel = (nome: string | null | undefined): string => String(nome ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

/** Hotéis com quartos (nome como foi escrito na primeira vez) e quantos quartos não têm hotel. */
export function hoteisDosQuartos(quartos: readonly { hotelName: string | null | undefined }[]): { hoteis: { nome: string; quartos: number }[]; semHotel: number } {
  const porChave = new Map<string, { nome: string; quartos: number }>();
  let semHotel = 0;
  for (const q of quartos) {
    const chave = chaveDoHotel(q.hotelName);
    if (!chave) { semHotel += 1; continue; }
    const atual = porChave.get(chave);
    if (atual) atual.quartos += 1;
    else porChave.set(chave, { nome: String(q.hotelName).trim().replace(/\s+/g, " "), quartos: 1 });
  }
  return { hoteis: Array.from(porChave.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), semHotel };
}

/** CPF com máscara (só 11 dígitos; outro formato não é CPF e não sai). */
export function cpfFormatado(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : null;
}

/** "DD/MM/AAAA HH:MM" no fuso de São Paulo, independente do fuso da máquina. */
export function dataHoraDeSaoPaulo(d: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`;
}

/** Nome de arquivo seguro em qualquer sistema. */
export function nomeDoArquivoDaRoomingList(hotel: string, evento: string): string {
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `Rooming list - ${limpo(hotel)} - ${limpo(evento)}.pdf`;
}

export function montarRoomingList(e: EntradaDaRoomingList): RoomingList {
  const chave = chaveDoHotel(e.hotel);
  const doHotel = e.quartos.filter((q) => chave && chaveDoHotel(q.hotelName) === chave && q.hospedes.length > 0);

  const quartosPorTipo = new Map<TipoDoTrecho, number>();
  const diariasPorTipo = new Map<TipoDoTrecho, number>();
  let primeiraEntrada: string | null = null;
  let ultimaSaida: string | null = null;

  const linhas: LinhaDaRoomingList[] = doHotel.map((q, i) => {
    const trechos = ocupacaoPorNoite(q.hospedes);
    for (const t of trechos) diariasPorTipo.set(t.tipo, (diariasPorTipo.get(t.tipo) ?? 0) + t.noites);
    // Pico: o maior número de pessoas numa mesma noite (sem datas, quem está no quarto).
    const pico = trechos.length ? Math.max(...trechos.map((t) => t.ocupantes.length)) : q.hospedes.length;
    const tipoDoPico: TipoDoTrecho = pico <= 1 ? "single" : pico === 2 ? "double" : "triple";
    quartosPorTipo.set(tipoDoPico, (quartosPorTipo.get(tipoDoPico) ?? 0) + 1);
    for (const h of q.hospedes) {
      const ini = ymd(h.checkIn); const fim = ymd(h.checkOut);
      if (ini && (!primeiraEntrada || ini < primeiraEntrada)) primeiraEntrada = ini;
      if (fim && (!ultimaSaida || fim > ultimaSaida)) ultimaSaida = fim;
    }
    const tipo = trechos.length > 1
      ? trechos.map((t) => `${ddmm(t.de)}→${ddmm(t.ate)} ${rotuloDoTipo(t.tipo)}`).join("; ")
      : rotuloDoTipo(tipoDoPico);
    return {
      numero: i + 1,
      tipo,
      hospedes: q.hospedes.map((h) => ({
        nome: h.nome,
        cpf: e.incluirCpf ? cpfFormatado(h.cpf) : null,
        checkIn: ddmmaaaa(h.checkIn),
        checkOut: ddmmaaaa(h.checkOut),
      })),
      diarias: diariasDosTrechos(trechos),
      observacao: q.observacao?.trim() || null,
    };
  });

  const lista = (m: Map<TipoDoTrecho, number>) => ORDEM.filter((t) => m.get(t)).map((t) => ({ tipo: rotuloDoTipo(t), quantidade: m.get(t) as number }));
  const hotel = doHotel[0]?.hotelName ? String(doHotel[0].hotelName).trim().replace(/\s+/g, " ") : e.hotel.trim();
  return {
    titulo: "Rooming list",
    hotel,
    evento: e.evento.nome,
    cidade: e.evento.local,
    periodoDoEvento: periodo(e.evento.inicio, e.evento.fim),
    periodoDaHospedagem: periodo(primeiraEntrada, ultimaSaida),
    totalDeQuartos: linhas.length,
    totalDeHospedes: linhas.reduce((n, l) => n + l.hospedes.length, 0),
    quartosPorTipo: lista(quartosPorTipo),
    diariasPorTipo: lista(diariasPorTipo),
    totalDeDiarias: linhas.reduce((n, l) => n + l.diarias, 0),
    linhas,
    incluiCpf: e.incluirCpf,
    geradoEm: dataHoraDeSaoPaulo(e.geradoEm),
    contato: e.contato.email ? `${e.contato.nome} · ${e.contato.email}` : e.contato.nome,
    nomeDoArquivo: nomeDoArquivoDaRoomingList(hotel, e.evento.nome),
  };
}
