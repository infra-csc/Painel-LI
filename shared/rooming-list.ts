/**
 * Rooming list para o hotel (09/10, pedido do dono: "no final precisamos de
 * uma exportação em PDF para mandar para hotéis").
 *
 * Aqui só se MONTAM os dados do documento — puro, testável, sem gerar o
 * binário (o PDF é desenhado no navegador a partir deste resultado). Um
 * documento por hotel — ou, desde 15/10 (dono: "aqui não necessariamente
 * precisa definir o hotel"), um documento com os quartos SEM hotel definido:
 * cabeçalho do evento e "Hotel: a definir" (ou o nome digitado só para o PDF).
 * O tipo de cada quarto vem da ocupação noite a noite: um quarto pode ser
 * Single até o colega chegar e Duplo depois.
 *
 * Valores (20/10): o documento do HOTEL nunca leva valores. Com `comValores`
 * sai a versão de USO INTERNO (conferência/fechamento): valor por hóspede e
 * por quarto, total e "Uso interno" no cabeçalho e no nome do arquivo.
 *
 * Hotel do evento (15/10, dono: "todos ficam no mesmo hotel por evento"): não
 * há coluna própria — é o hotel comum aos quartos (`hotelDoEvento`). Aplicá-lo
 * a todos segue `planoDoHotelDoEvento`: quarto confirmado fica como está, e
 * quarto em OUTRO hotel (exceção feita à mão) só muda se a pessoa pedir.
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
  /** Custo calculado da pessoa neste quarto (centavos) — só sai no PDF de uso interno. */
  valorCentavos?: number | null;
}

export interface QuartoDaRoomingList {
  hotelName: string | null | undefined;
  /** Observação escrita no quarto (a automática de datas não vai: os trechos já dizem). */
  observacao?: string | null;
  hospedes: HospedeDaRoomingList[];
  /** Total calculado do quarto (centavos) e se todas as noites têm tarifa — só no uso interno. */
  valorCentavos?: number | null;
  valorCompleto?: boolean;
}

export interface EntradaDaRoomingList {
  /** Hotel escolhido; `null` = os quartos SEM hotel definido. */
  hotel: string | null;
  /**
   * Só com `hotel: null`: nome digitado no diálogo para o cabeçalho deste
   * arquivo (não grava nos quartos). Vazio → "a definir".
   */
  nomeDoHotelNoPdf?: string | null;
  evento: { nome: string; local: string | null; inicio: string | null; fim: string | null };
  quartos: QuartoDaRoomingList[];
  incluirCpf: boolean;
  /** Versão de USO INTERNO, com valores (20/10). O PDF do hotel nunca tem. */
  comValores?: boolean;
  geradoEm: Date;
  contato: { nome: string; email: string | null };
}

export interface LinhaDaRoomingList {
  numero: number;
  /** "Duplo" ou "13/11→14/11 Single; 14/11→16/11 Duplo". */
  tipo: string;
  hospedes: { nome: string; cpf: string | null; checkIn: string; checkOut: string; valor: string | null }[];
  diarias: number;
  observacao: string | null;
  /** "R$ 1.092,00" (uso interno); `null` no PDF do hotel. */
  valor: string | null;
}

export interface RoomingList {
  titulo: string;
  /** Nome do hotel; sem hotel definido, o digitado para o PDF ou "a definir". */
  hotel: string;
  /** Falso quando o documento é dos quartos sem hotel: o cabeçalho passa a ser o evento. */
  hotelDefinido: boolean;
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
  /** Versão de uso interno, com valores. */
  comValores: boolean;
  /** Soma dos quartos do documento (uso interno); `null` no PDF do hotel. */
  totalDosValores: string | null;
  /** Algum quarto tem noite sem tarifa: o total é parcial. */
  valoresParciais: boolean;
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

/** Nome como deve ser gravado e mostrado: sem espaço sobrando. */
export const nomeDeHotelLimpo = (nome: string | null | undefined): string => String(nome ?? "").trim().replace(/\s+/g, " ");

/** Linha do hotel quando o documento é dos quartos sem hotel e ninguém digitou um nome. */
export const HOTEL_A_DEFINIR = "a definir";

/** Hotéis com quartos (nome como foi escrito na primeira vez) e quantos quartos não têm hotel. */
export function hoteisDosQuartos(quartos: readonly { hotelName: string | null | undefined }[]): { hoteis: { nome: string; quartos: number }[]; semHotel: number } {
  const porChave = new Map<string, { nome: string; quartos: number }>();
  let semHotel = 0;
  for (const q of quartos) {
    const chave = chaveDoHotel(q.hotelName);
    if (!chave) { semHotel += 1; continue; }
    const atual = porChave.get(chave);
    if (atual) atual.quartos += 1;
    else porChave.set(chave, { nome: nomeDeHotelLimpo(q.hotelName), quartos: 1 });
  }
  return { hoteis: Array.from(porChave.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), semHotel };
}

/**
 * O hotel do evento: o que tem MAIS quartos (empate → ordem alfabética, para
 * ser estável). Nenhum quarto com hotel → null.
 */
export function hotelDoEvento(quartos: readonly { hotelName: string | null | undefined }[]): string | null {
  let melhor: { nome: string; quartos: number } | null = null;
  for (const h of hoteisDosQuartos(quartos).hoteis) if (!melhor || h.quartos > melhor.quartos) melhor = h;
  return melhor?.nome ?? null;
}

export interface QuartoParaOHotelDoEvento {
  id: string;
  hotelName: string | null | undefined;
  confirmed: boolean | null | undefined;
}

export interface PlanoDoHotelDoEvento {
  /** Nome que será gravado (limpo). */
  hotel: string;
  /** Quartos que passam a ter o hotel. */
  aplicar: string[];
  /** Já estavam nele — nada a fazer. */
  jaNoHotel: number;
  /** Confirmados com outro hotel (ou sem): ficam como estavam. */
  confirmadosMantidos: number;
  /** Quartos abertos em OUTRO hotel (exceção feita à mão) — só mudam com `trocarOutros`. */
  emOutroHotel: { id: string; hotel: string }[];
  /** Dos `emOutroHotel`, os que ficaram como estavam. */
  outrosMantidos: number;
}

/**
 * O que "aplicar o hotel do evento" faz em cada quarto:
 *  - já está no hotel (qualquer grafia) → nada;
 *  - confirmado → fica como está (entra no aviso "N confirmados…");
 *  - sem hotel, ou no hotel do evento ATUAL (trocar o hotel do evento leva
 *    junto quem o seguia) → recebe o novo;
 *  - em OUTRO hotel → exceção feita à mão: só troca com `trocarOutros`.
 */
export function planoDoHotelDoEvento(
  quartos: readonly QuartoParaOHotelDoEvento[],
  novo: string,
  opcoes: { trocarOutros?: boolean } = {},
): PlanoDoHotelDoEvento {
  const hotel = nomeDeHotelLimpo(novo);
  const chaveNova = chaveDoHotel(hotel);
  const chaveAtual = chaveDoHotel(hotelDoEvento(quartos));
  const plano: PlanoDoHotelDoEvento = { hotel, aplicar: [], jaNoHotel: 0, confirmadosMantidos: 0, emOutroHotel: [], outrosMantidos: 0 };
  if (!chaveNova) return plano;
  for (const q of quartos) {
    const chave = chaveDoHotel(q.hotelName);
    if (chave === chaveNova) { plano.jaNoHotel += 1; continue; }
    if (q.confirmed) { plano.confirmadosMantidos += 1; continue; }
    if (!chave || chave === chaveAtual) { plano.aplicar.push(q.id); continue; }
    plano.emOutroHotel.push({ id: q.id, hotel: nomeDeHotelLimpo(q.hotelName) });
    if (opcoes.trocarOutros) plano.aplicar.push(q.id);
    else plano.outrosMantidos += 1;
  }
  return plano;
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

/** Nome de arquivo seguro em qualquer sistema. Sem hotel definido (`null`): só o evento. */
export function nomeDoArquivoDaRoomingList(hotel: string | null, evento: string, opcoes: { comValores?: boolean } = {}): string {
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const base = opcoes.comValores ? "USO INTERNO - Rooming list com valores" : "Rooming list";
  return hotel ? `${base} - ${limpo(hotel)} - ${limpo(evento)}.pdf` : `${base} - ${limpo(evento)}.pdf`;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** Centavos → "R$ 1.234,56" (o mesmo formato da tela). */
export const reaisDosCentavos = (c: number): string => BRL.format(Math.round(c) / 100);

export function montarRoomingList(e: EntradaDaRoomingList): RoomingList {
  const semHotel = e.hotel === null;
  const comValores = e.comValores === true;
  const chave = chaveDoHotel(e.hotel);
  const doHotel = e.quartos.filter((q) => q.hospedes.length > 0
    && (semHotel ? !chaveDoHotel(q.hotelName) : !!chave && chaveDoHotel(q.hotelName) === chave));

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
        valor: comValores && typeof h.valorCentavos === "number" ? reaisDosCentavos(h.valorCentavos) : null,
      })),
      diarias: diariasDosTrechos(trechos),
      observacao: q.observacao?.trim() || null,
      valor: comValores && typeof q.valorCentavos === "number" ? reaisDosCentavos(q.valorCentavos) : null,
    };
  });

  const lista = (m: Map<TipoDoTrecho, number>) => ORDEM.filter((t) => m.get(t)).map((t) => ({ tipo: rotuloDoTipo(t), quantidade: m.get(t) as number }));
  const hotel = semHotel
    ? nomeDeHotelLimpo(e.nomeDoHotelNoPdf) || HOTEL_A_DEFINIR
    : nomeDeHotelLimpo(doHotel[0]?.hotelName) || nomeDeHotelLimpo(e.hotel);
  return {
    titulo: "Rooming list",
    hotel,
    hotelDefinido: !semHotel,
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
    comValores,
    totalDosValores: comValores ? reaisDosCentavos(doHotel.reduce((s, q) => s + (q.valorCentavos ?? 0), 0)) : null,
    valoresParciais: comValores && doHotel.some((q) => q.valorCompleto === false),
    geradoEm: dataHoraDeSaoPaulo(e.geradoEm),
    contato: e.contato.email ? `${e.contato.nome} · ${e.contato.email}` : e.contato.nome,
    // Sem hotel definido o arquivo leva só o evento — o nome digitado no
    // diálogo vale para o cabeçalho, não para o arquivo.
    nomeDoArquivo: nomeDoArquivoDaRoomingList(semHotel ? null : hotel, e.evento.nome, { comValores }),
  };
}
