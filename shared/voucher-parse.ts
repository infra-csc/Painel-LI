/**
 * Leitura de vouchers (28/08) — o comprador anexa o PDF e a tela oferece os
 * campos já preenchidos, para ele CONFERIR antes de salvar.
 *
 * Aqui mora só a interpretação do TEXTO: funções puras, sem PDF e sem rede,
 * para poderem ser testadas com o conteúdo real dos vouchers. Quem transforma
 * o arquivo em texto é o servidor (server/voucher-extract.ts).
 *
 * Decisões do dono (28/08):
 * - Valor da passagem = o **Total** do voucher (tarifa + taxas/repasse).
 * - Data sem ano no voucher: deduzir; se ficar ambíguo, devolver vazio e avisar.
 * - Sempre UM passageiro/hóspede por arquivo.
 *
 * Nada aqui grava: a saída é uma SUGESTÃO. Layout desconhecido devolve
 * `tipo: "desconhecido"` — a tela avisa e o preenchimento segue manual.
 */

export type VoucherTipo = "passagem" | "hospedagem" | "desconhecido";

export interface VoucherLeitura {
  tipo: VoucherTipo;
  /** Nome do formato reconhecido, para a tela dizer o que leu. */
  formato?: string;
  /** Campos no MESMO nome usado pelos formulários — a tela aplica direto. */
  campos: Record<string, string>;
  /** Passageiro/hóspede lido, para conferir se o voucher é da vaga certa. */
  pessoa?: string;
  /**
   * Vouchers de grupo (Onfly) trazem o bilhete de várias pessoas no mesmo
   * arquivo. A tela confere a vaga contra a LISTA, não contra o primeiro nome.
   */
  pessoas?: string[];
  /**
   * Relatório de reservas do hotel (31/08): um arquivo com VÁRIOS quartos e
   * vários hóspedes, cada um com suas datas e seu valor. Uma leitura só não dá
   * conta — cada item vira uma hospedagem a registrar.
   */
  hospedagens?: HospedagemLida[];
  /**
   * O voucher trouxe UM trecho só. Não diz qual: quem sabe é a tela, pelo
   * recorte escolhido no formulário (ida e volta / só ida / só volta).
   */
  trechoUnico?: boolean;
  /** O que o operador precisa checar com o olho. */
  avisos: string[];
}

/** Uma hospedagem lida — de um voucher individual ou de uma linha do relatório. */
export interface HospedagemLida {
  /** Hóspede desta reserva. */
  pessoa: string;
  /** Campos no mesmo nome usado pelo formulário de hospedagem. */
  campos: Record<string, string>;
  /** Quantas pessoas dividem este quarto (1 = quarto individual). */
  pax: number;
  avisos: string[];
}

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

/** "15/jul/2026" ou "04 ago 2026" → "2026-07-15". Sem ano, devolve null. */
export function dataComAno(texto: string): string | null {
  const m = texto.match(/(\d{1,2})[\/\s]([a-zç]{3})[a-zç]*[\/\s](\d{4})/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

/**
 * "19/ago" (sem ano) resolvido pela data de emissão do voucher: a viagem é
 * emitida ANTES de acontecer, então o ano é o da emissão — e se a data cair
 * antes dela, é viagem que vira o ano. Sem emissão para se apoiar, devolve
 * null e quem chamou avisa em vez de chutar.
 */
export function dataSemAno(diaMes: string, emissaoIso: string | null): string | null {
  const m = diaMes.match(/(\d{1,2})\/([a-zç]{3})/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes || !emissaoIso) return null;
  const dia = m[1].padStart(2, "0");
  const anoEmissao = Number(emissaoIso.slice(0, 4));
  const candidata = `${anoEmissao}-${mes}-${dia}`;
  return candidata >= emissaoIso ? candidata : `${anoEmissao + 1}-${mes}-${dia}`;
}

/** "BRL 564,44" / "R$ 1.250,00" → "564,44" (formato que o formulário aceita). */
export function valorBr(texto: string): string | null {
  const m = texto.match(/(?:BRL|R\$)\s*([\d.]+,\d{2})/i);
  return m ? m[1] : null;
}

/** "19h00" → "19:00"; "19:55" fica como está. */
const hora = (t: string): string => t.replace(/^(\d{1,2})h(\d{2})$/i, "$1:$2").replace(/^(\d{1,2})h$/i, "$1:00");

// ─── Passagem aérea — formato das agências (LCA Viagens e semelhantes) ──────
//
// As linhas de voo vêm em pares: a primeira é a ORIGEM (com cia e número do
// voo), a segunda o DESTINO. Ida e volta repetem o mesmo par.
//   G3 1202 O Congonhas (CGH) 19/ago 19:55
//   GOL Escalas 0 Joinville (JOI) 19/ago 21:05
const LINHA_TRECHO = /([A-Za-zÀ-ú.\s'-]+?)\s*\(([A-Z]{3})\)\s+(\d{1,2}\/[a-zç]{3})\s+(\d{1,2}:\d{2})/i;

interface Trecho { cidade: string; aeroporto: string; diaMes: string; horario: string }

/** "SÃO PAULO" → "São Paulo" (o voucher grita; os campos da tela não). */
function capitalizar(nome: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

function lerTrechos(linhas: string[]): Trecho[] {
  const achados: Trecho[] = [];
  for (const linha of linhas) {
    const m = linha.match(LINHA_TRECHO);
    if (!m) continue;
    achados.push({
      // O texto cola a classe/assento e a contagem de escalas no nome do
      // aeroporto ("G3 1202 O Congonhas", "GOL Escalas 0 Joinville"): fora
      // as palavras conhecidas, sobra uma letra solta que também não é nome.
      cidade: capitalizar(
        m[1]
          .replace(/\b(Escalas|Term\.?|Embarque|Cia|Voo|Classe|Assento)\b/gi, "")
          .replace(/^\s*[A-Z0-9]\s+/, "")
          .trim(),
      ),
      aeroporto: m[2].toUpperCase(),
      diaMes: m[3],
      horario: m[4],
    });
  }
  return achados;
}

/**
 * "SÃO PAULO - JOINVILLE - SÃO PAULO" no topo do voucher: é ele que diz as
 * CIDADES (o trecho só nomeia o aeroporto — "Congonhas" não é cidade).
 * Bilhete de um trecho só escreve o roteiro com dois nomes ("SÃO PAULO - RIO
 * DE JANEIRO"), e vale igual. Com conexões, o nome do aeroporto limpo
 * continua sendo a melhor informação disponível.
 */
function cidadesDoRoteiro(texto: string): [string, string] | null {
  const cabecalho = texto.split(/\r?\n/)[0] ?? "";
  const rota = cabecalho.split(/\s+LOCALIZADOR/i)[0];
  const partes = rota.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 2) return [capitalizar(partes[0]), capitalizar(partes[1])];
  if (partes.length !== 3 || partes[0].toLowerCase() !== partes[2].toLowerCase()) return null;
  return [capitalizar(partes[0]), capitalizar(partes[1])];
}

export function lerVoucherPassagem(texto: string): VoucherLeitura | null {
  if (!/LOCALIZADOR:/i.test(texto)) return null;

  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];
  const campos: Record<string, string> = { transportType: "aereo" };

  const loc = texto.match(/LOCALIZADOR:\s*([A-Z0-9]{5,8})/i);
  if (loc) campos.purchaseOrderNumber = loc[1].toUpperCase();

  const emissaoLinha = texto.match(/Data\s+Emiss[ãa]o:\s*(\d{1,2}\/[a-zç]{3}\/\d{4})/i);
  const emissao = emissaoLinha ? dataComAno(emissaoLinha[1]) : null;
  if (emissao) campos.purchaseDate = emissao;

  // Decisão do dono (28/08): o valor da passagem é o TOTAL do voucher, que
  // já inclui taxas e repasse ("Total: BRL 675,39"). A tarifa isolada só
  // serve de reserva para vouchers que não estampam o total.
  const total = texto.match(/Total:\s*(BRL\s*[\d.]+,\d{2})/i);
  const tarifa = texto.match(/Valor:\s*(BRL\s*[\d.]+,\d{2})/i);
  const valor = total ? valorBr(total[1]) : tarifa ? valorBr(tarifa[1]) : null;
  if (valor) campos.value = valor;
  else avisos.push("Não achei o valor no voucher — preencha o Valor da Passagem à mão.");
  if (!total && tarifa) avisos.push("O voucher não traz o total; usei a tarifa sem as taxas — confira.");

  const trechos = lerTrechos(linhas);
  if (trechos.length < 2) return null; // sem ao menos um par, não é este formato
  const roteiro = cidadesDoRoteiro(texto);
  let umTrechoSo = false;

  const aplicarTrecho = (saida: Trecho, chegada: Trecho, volta: boolean) => {
    const dataSaida = dataSemAno(saida.diaMes, emissao);
    if (volta) {
      campos.returnOriginAirport = saida.aeroporto;
      campos.returnDestinationAirport = chegada.aeroporto;
      campos.returnCityOrigin = roteiro ? roteiro[1] : saida.cidade;
      campos.returnCityDestination = roteiro ? roteiro[0] : chegada.cidade;
      campos.actualReturnTime = saida.horario;
      campos.returnArrivalTime = chegada.horario;
      if (dataSaida) campos.actualReturnDate = dataSaida;
    } else {
      campos.departureAirport = saida.aeroporto;
      campos.destinationAirport = chegada.aeroporto;
      campos.departureCityOrigin = roteiro ? roteiro[0] : saida.cidade;
      campos.departureCityDestination = roteiro ? roteiro[1] : chegada.cidade;
      campos.actualDepartureTime = saida.horario;
      campos.actualArrivalTime = chegada.horario;
      if (dataSaida) campos.actualDepartureDate = dataSaida;
    }
    if (!dataSaida) {
      avisos.push(
        `O voucher escreve "${saida.diaMes}" sem o ano e não consegui deduzir com segurança — confirme a data d${volta ? "a volta" : "a ida"}.`,
      );
    }
  };

  aplicarTrecho(trechos[0], trechos[1], false);
  if (trechos.length >= 4) {
    aplicarTrecho(trechos[2], trechos[3], true);
  } else {
    // Um trecho só NÃO quer dizer "viagem de ida apenas" (28/08): a volta pode
    // ter sido emitida por outra agência, em voucher separado. Marcar
    // "apenas ida" aqui apagaria a volta já registrada, então o leitor só
    // avisa e quem decide é a tela.
    umTrechoSo = true;
    avisos.push("Este voucher traz um trecho só. Confira se é a ida ou a volta antes de registrar.");
  }

  const cia = texto.match(/^\s*(GOL|LATAM|AZUL|TAM|AVIANCA)\b/im);
  if (cia) campos.ticketCompany = cia[1].toUpperCase();

  // Passageiro: linha em CAIXA ALTA logo antes da agência/O.S.
  const pass = texto.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{6,})\s+O\.S\./m)
    ?? texto.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{6,})$/m);

  return {
    tipo: "passagem",
    formato: "Voucher de passagem (agência)",
    campos,
    pessoa: pass ? pass[1].trim() : undefined,
    trechoUnico: umTrechoSo,
    avisos,
  };
}

// ─── Passagem aérea — voucher da Onfly ──────────────────────────────────────
//
// Layout bem diferente do da agência: o texto desce em coluna, as seções vêm
// nomeadas ("Ida" / "Volta"), o aeroporto ocupa uma linha só e a data sai em
// inglês ("30 Sep, 2026 • 15:55").
//
// Importante (30/08): quando a volta é emitida à parte, ela chega num arquivo
// que TAMBÉM se intitula "Ida" — o rótulo é do voucher, não da viagem. Por
// isso aqui só marcamos que veio um trecho só; quem diz se é ida ou volta é o
// recorte escolhido na tela.

const MESES_EN: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "30 Sep, 2026" → "2026-09-30". Aceita o mês em inglês ou em português. */
export function dataOnfly(texto: string): string | null {
  const m = texto.match(/(\d{1,2})\s+([A-Za-zç]{3})[a-zç]*,?\s*(\d{4})/);
  if (!m) return null;
  const chave = m[2].toLowerCase();
  const mes = MESES_EN[chave] ?? MESES[chave];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, "0")}`;
}

interface TrechoOnfly {
  cidadeOrigem?: string;
  cidadeDestino?: string;
  aeroportoOrigem?: string;
  aeroportoDestino?: string;
  data?: string;
  horaSaida?: string;
  horaChegada?: string;
  voo?: string;
  cia?: string;
}

/**
 * Um bloco de trecho vai do rótulo ("Ida"/"Volta") até a tabela de passageiros.
 * Cortar ali evita confundir siglas do rodapé com código de aeroporto.
 */
function blocoDoTrecho(linhas: string[], inicio: number, limite: number): string[] {
  const bloco: string[] = [];
  for (let i = inicio; i < limite && i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (/^(Passageiros|\*Consulte|Suporte ao Cliente|Centro de custo|Orienta[çc][õo]es)/i.test(l)) break;
    bloco.push(l);
  }
  return bloco;
}

function lerTrechoOnfly(bloco: string[]): TrechoOnfly {
  const t: TrechoOnfly = {};

  for (const l of bloco) {
    // "São Paulo para Fortaleza" — é daqui que saem as CIDADES.
    const rota = !t.cidadeOrigem && l.match(/^([A-Za-zÀ-ú'.\s]{3,})\s+para\s+([A-Za-zÀ-ú'.\s]{3,})$/);
    if (rota) { t.cidadeOrigem = rota[1].trim(); t.cidadeDestino = rota[2].trim(); continue; }

    // "LA3506 - Latam"
    const voo = !t.voo && l.match(/^([A-Z]{2}\s?\d{2,4})\s*[-–]\s*(.+)$/);
    if (voo) { t.voo = voo[1].replace(/\s/g, ""); t.cia = voo[2].trim(); continue; }

    // Aeroporto em linha própria: "GRU", "FOR".
    if (/^[A-Z]{3}$/.test(l)) {
      if (!t.aeroportoOrigem) t.aeroportoOrigem = l;
      else if (!t.aeroportoDestino && l !== t.aeroportoOrigem) t.aeroportoDestino = l;
      continue;
    }

    // "30 Sep, 2026 • 15:55" — a primeira é a saída, a segunda a chegada.
    const quando = l.match(/(\d{1,2}\s+[A-Za-z]{3},?\s*\d{4})\D{0,4}(\d{1,2}:\d{2})/);
    if (quando) {
      if (!t.horaSaida) { t.data = dataOnfly(quando[1]) ?? undefined; t.horaSaida = quando[2]; }
      else if (!t.horaChegada) t.horaChegada = quando[2];
    }
  }
  return t;
}

export function lerVoucherAereoOnfly(texto: string): VoucherLeitura | null {
  if (!/Voucher\s+A[ée]reo/i.test(texto)) return null;

  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];
  const campos: Record<string, string> = { transportType: "aereo" };

  const iIda = linhas.findIndex((l) => /^Ida$/i.test(l.trim()));
  const iVolta = linhas.findIndex((l) => /^Volta$/i.test(l.trim()));
  if (iIda < 0 && iVolta < 0) return null; // sem trecho nenhum, não dá para aproveitar

  const loc = texto.match(/Localizador\s+([A-Z0-9]{5,8})/);
  if (loc) campos.purchaseOrderNumber = loc[1].toUpperCase();

  // "Emitido em: 27/08/2026, 22:58"
  const emitido = texto.match(/Emitido em:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (emitido) campos.purchaseDate = `${emitido[3]}-${emitido[2]}-${emitido[1]}`;

  const ida = iIda >= 0 ? lerTrechoOnfly(blocoDoTrecho(linhas, iIda + 1, iVolta > iIda ? iVolta : linhas.length)) : null;
  const volta = iVolta >= 0 ? lerTrechoOnfly(blocoDoTrecho(linhas, iVolta + 1, linhas.length)) : null;

  if (ida) {
    if (ida.aeroportoOrigem) campos.departureAirport = ida.aeroportoOrigem;
    if (ida.aeroportoDestino) campos.destinationAirport = ida.aeroportoDestino;
    if (ida.cidadeOrigem) campos.departureCityOrigin = ida.cidadeOrigem;
    if (ida.cidadeDestino) campos.departureCityDestination = ida.cidadeDestino;
    if (ida.data) campos.actualDepartureDate = ida.data;
    if (ida.horaSaida) campos.actualDepartureTime = ida.horaSaida;
    if (ida.horaChegada) campos.actualArrivalTime = ida.horaChegada;
    if (!ida.data) avisos.push("Não consegui ler a data da ida — confira.");
  }
  if (volta) {
    if (volta.aeroportoOrigem) campos.returnOriginAirport = volta.aeroportoOrigem;
    if (volta.aeroportoDestino) campos.returnDestinationAirport = volta.aeroportoDestino;
    if (volta.cidadeOrigem) campos.returnCityOrigin = volta.cidadeOrigem;
    if (volta.cidadeDestino) campos.returnCityDestination = volta.cidadeDestino;
    if (volta.data) campos.actualReturnDate = volta.data;
    if (volta.horaSaida) campos.actualReturnTime = volta.horaSaida;
    if (volta.horaChegada) campos.returnArrivalTime = volta.horaChegada;
    if (!volta.data) avisos.push("Não consegui ler a data da volta — confira.");
  }

  const cia = ida?.cia ?? volta?.cia;
  if (cia) campos.ticketCompany = cia.toUpperCase();
  if (ida?.cia && volta?.cia && ida.cia !== volta.cia) {
    avisos.push(`Ida pela ${ida.cia} e volta pela ${volta.cia} — deixei a companhia da ida.`);
  }

  // Não existe campo de número de voo no cadastro: vai no aviso para quem
  // estiver conferindo não precisar reabrir o PDF.
  const voos = [ida?.voo && `ida ${ida.voo}`, volta?.voo && `volta ${volta.voo}`].filter(Boolean);
  if (voos.length) avisos.push(`Voo ${voos.join(" · ")}.`);

  // Este voucher não estampa preço nenhum — nem tarifa, nem total.
  avisos.push("Este voucher não traz o valor — preencha o Valor da Passagem à mão.");

  // Passageiros: o nome vem na linha logo acima do CPF. Voucher de grupo traz
  // vários, e o mesmo nome se repete na ida e na volta.
  const pessoas: string[] = [];
  for (let i = 1; i < linhas.length; i++) {
    if (!/^\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/.test(linhas[i])) continue;
    const nome = linhas[i - 1].trim();
    if (!/^[A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{5,}$/.test(nome)) continue;
    const arrumado = capitalizar(nome);
    if (!pessoas.includes(arrumado)) pessoas.push(arrumado);
  }
  if (pessoas.length > 1) {
    avisos.push(`Voucher de grupo, com ${pessoas.length} passageiros no mesmo arquivo.`);
  }

  const umTrechoSo = !(ida && volta);
  if (umTrechoSo) {
    avisos.push("Este voucher traz um trecho só. Confira se é a ida ou a volta antes de registrar.");
  }

  return {
    tipo: "passagem",
    formato: "Voucher aéreo (Onfly)",
    campos,
    pessoa: pessoas[0],
    pessoas,
    trechoUnico: umTrechoSo,
    avisos,
  };
}

// ─── Hospedagem — voucher da agência (LCA e semelhantes) ────────────────────
//
// Mesmo emissor do voucher de passagem, layout próprio: o nome do hotel abre a
// primeira linha junto do número do voucher, e as datas de entrada e saída
// aparecem espalhadas em duas linhas, cada uma seguida da hora.

/** "Duplo", "Single"… o tipo vem solto no meio da linha do endereço. */
const TIPOS_DE_QUARTO = ["Individual", "Single", "Duplo", "Twin", "Triplo", "Quádruplo", "Casal", "Standard", "Luxo", "Superior"];

export function lerVoucherHotelAgencia(texto: string): VoucherLeitura | null {
  const m = texto.match(/^(.+?)\s+VOUCHER:\s*(\S+)/m);
  if (!m) return null;
  // "Check-In / Check-Out" é o cabeçalho da tabela deste layout; sem ele, o
  // arquivo é o voucher de PASSAGEM da mesma agência.
  if (!/Check-?In\s*\/\s*Check-?Out/i.test(texto)) return null;

  const avisos: string[] = [];
  const campos: Record<string, string> = {};
  campos.hotelName = capitalizar(m[1].trim());
  campos.reservationNumber = m[2];

  // As duas únicas datas com HORA ao lado são entrada e saída — a emissão
  // aparece sozinha na mesma linha e não pode ser confundida com elas.
  const comHora: RegExpExecArray[] = [];
  const reComHora = /(\d{1,2}\/[a-zç]{3}\/\d{4})\s+(\d{1,2}:\d{2})/gi;
  for (let achado = reComHora.exec(texto); achado; achado = reComHora.exec(texto)) comHora.push(achado);
  if (comHora.length >= 2) {
    const entrada = dataComAno(comHora[0][1]);
    const saida = dataComAno(comHora[1][1]);
    if (entrada) campos.checkInDate = entrada;
    if (saida) campos.checkOutDate = saida;
    campos.checkInTime = comHora[0][2];
    campos.checkOutTime = comHora[1][2];
    if (entrada && saida) {
      const noites = Math.round((Date.parse(saida) - Date.parse(entrada)) / 86400000);
      if (noites > 0) campos.nightsCount = String(noites);
    }
  } else {
    avisos.push("Não consegui ler as datas de check-in/check-out — preencha à mão.");
  }

  const tipo = TIPOS_DE_QUARTO.find((t) => new RegExp(`\\b${t}\\b`, "i").test(texto));
  if (tipo) campos.roomType = tipo;

  const diaria = texto.match(/Di[áa]ria:\s*(BRL\s*[\d.]+,\d{2})/i);
  if (diaria) campos.dailyRate = valorBr(diaria[1]) ?? "";
  const total = texto.match(/Total:\s*(BRL\s*[\d.]+,\d{2})/i);
  if (total) campos.totalCents = valorBr(total[1]) ?? "";

  const pagamento = texto.match(/Pagamento:\s*([A-ZÀ-Ú]+)/);
  if (pagamento) campos.paymentCompany = capitalizar(pagamento[1]);

  // Hóspede: mesma posição do passageiro no voucher de passagem da agência.
  const hospede = texto.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{6,})\s+O\.S\./m);

  // O acompanhante divide o quarto: quem registra precisa saber que a diária
  // lida é do quarto, não da pessoa.
  const acompanhante = texto.match(/^\d{1,2}\/[a-zç]{3}\/\d{4}\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s+\d{1,2}\/[a-zç]{3}\/\d{4}/im);
  if (acompanhante) {
    avisos.push(`O quarto é dividido com ${capitalizar(acompanhante[1].trim())} — a diária lida é do quarto, não de cada pessoa.`);
  }

  const cafe = /Café da\s*Manhã:\s*sim/i.test(texto) || /Caf[ée] da\s*Manh[ãa]:\s*\n?\s*sim/i.test(texto);
  if (cafe) avisos.push("Com café da manhã.");

  return {
    tipo: "hospedagem",
    formato: "Voucher de hotel (agência)",
    campos,
    pessoa: hospede ? capitalizar(hospede[1].trim()) : undefined,
    avisos,
  };
}

// ─── Hospedagem — relatório de reservas do hotel ────────────────────────────
//
// Não é voucher de uma pessoa: é a confirmação que o HOTEL manda com todas as
// reservas da empresa — vários quartos, vários hóspedes, cada um com seu
// período. Um arquivo destes preenche o evento inteiro.

const SIGLA_DE_QUARTO: Record<string, string> = {
  SGL: "Single", DBL: "Duplo", TWN: "Twin", TPL: "Triplo", QUA: "Quádruplo",
};

/** "30/09/26" → "2026-09-30". Ano de dois dígitos é sempre 20xx aqui. */
function dataCurta(d: string): string | null {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}

export function lerRelatorioDeReservas(texto: string): VoucherLeitura | null {
  if (!/Confirma[çc][ãa]o de Reserva/i.test(texto) || !/H[óo]spede:/i.test(texto)) return null;

  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];
  const hospedagens: HospedagemLida[] = [];

  /**
   * O hotel se identifica pela própria palavra: a primeira linha em caixa alta
   * que diga HOTEL, POUSADA, RESORT… Pegar "a primeira linha maiúscula" trazia
   * a linha do CEP ("60160060 FORTALEZA CE"), que também é toda maiúscula.
   */
  const NOME_DE_HOTEL = /^([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .'-]*(?:HOTEL|POUSADA|RESORT|INN|FLAT|SUITES?)[A-ZÀ-Ú0-9 .'-]*)$/i;
  const hotel = texto.split(/\r?\n/).map((l) => l.trim()).map((l) => l.match(NOME_DE_HOTEL)).find(Boolean);
  const nomeDoHotel = hotel ? capitalizar(hotel[1].trim()) : "";
  const reserva = texto.match(/Confirma[çc][ãa]o de Reserva\s*N[ºo°]?\s*([\d.]+)/i);

  /**
   * Linha de apartamento. O total e a hora de entrada saem COLADOS do PDF
   * ("1.450,0014:00"), o que quebra qualquer leitura por espaços.
   */
  const LINHA_APTO = /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+\((\d+)\)\s+(\w+)\s+(\d+)\s+(\w+)\s+([\d.]+,\d{2})\s*([\d.]+,\d{2})(\d{2}:\d{2})\s+(\d{2}:\d{2})/;

  let atual: { entrada: string; saida: string; tipo: string; pax: number; diaria: string; total: string; horaIn: string; horaOut: string } | null = null;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    const apto = linha.match(LINHA_APTO);
    if (apto) {
      atual = {
        entrada: dataCurta(apto[1]) ?? "",
        saida: dataCurta(apto[2]) ?? "",
        tipo: SIGLA_DE_QUARTO[apto[4].toUpperCase()] ?? apto[4],
        pax: Number(apto[5]) || 1,
        diaria: apto[7],
        total: apto[8],
        horaIn: apto[9],
        horaOut: apto[10],
      };
      continue;
    }
    const h = linha.match(/^H[óo]spede:\s*(.+?)\s+ADULTO/i);
    if (!h || !atual) continue;

    let nome = h[1].trim();
    const campos: Record<string, string> = {};
    const meus: string[] = [];

    // Hóspede com período PRÓPRIO dentro do quarto — quem chega depois ou sai
    // antes do resto do grupo vem entre parênteses no nome.
    const proprio = nome.match(/^(.+?)\s*\((\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+à\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\)$/);
    if (proprio) {
      nome = proprio[1].trim();
      campos.checkInDate = dataCurta(proprio[2]) ?? "";
      campos.checkOutDate = dataCurta(proprio[4]) ?? "";
      campos.checkInTime = proprio[3];
      campos.checkOutTime = proprio[5];
      meus.push("Esta pessoa tem período próprio, diferente do resto do quarto.");
    } else {
      campos.checkInDate = atual.entrada;
      campos.checkOutDate = atual.saida;
      campos.checkInTime = atual.horaIn;
      campos.checkOutTime = atual.horaOut;
    }

    if (nomeDoHotel) campos.hotelName = nomeDoHotel;
    if (reserva) campos.reservationNumber = reserva[1];
    campos.roomType = atual.tipo;
    const noites = campos.checkInDate && campos.checkOutDate
      ? Math.round((Date.parse(campos.checkOutDate) - Date.parse(campos.checkInDate)) / 86400000)
      : 0;
    if (noites > 0) campos.nightsCount = String(noites);

    // A diária é do QUARTO. Preenchê-la em cada ocupante multiplicaria o custo
    // do evento pelo número de pessoas — por isso ela só entra quando o quarto
    // é de uma pessoa só; dividindo, quem registra decide como ratear.
    if (atual.pax === 1) {
      campos.dailyRate = atual.diaria;
      campos.totalCents = atual.total;
    } else {
      meus.push(`Quarto dividido por ${atual.pax} pessoas — a diária de R$ ${atual.diaria} é do quarto inteiro; decida como rateá-la antes de registrar.`);
    }

    hospedagens.push({ pessoa: capitalizar(nome), campos, pax: atual.pax, avisos: meus });
  }

  if (hospedagens.length === 0) return null;

  const totalGeral = texto.match(/R\$\s*([\d.]+,\d{2})\s+R\$\s*([\d.]+,\d{2})/);
  avisos.push(`Relatório com ${hospedagens.length} ${hospedagens.length === 1 ? "hóspede" : "hóspedes"}${totalGeral ? ` · total da reserva R$ ${totalGeral[1]}` : ""}.`);

  return {
    tipo: "hospedagem",
    formato: "Relatório de reservas (hotel)",
    // A primeira hospedagem vai nos campos para quem abrir o arquivo numa vaga
    // só; a lista inteira fica em `hospedagens`.
    campos: hospedagens[0].campos,
    pessoa: hospedagens[0].pessoa,
    pessoas: hospedagens.map((h) => h.pessoa),
    hospedagens,
    avisos,
  };
}

// ─── Hospedagem — voucher da Onfly ──────────────────────────────────────────
export function lerVoucherHospedagem(texto: string): VoucherLeitura | null {
  if (!/Voucher\s+Hotel/i.test(texto) && !/Check-?In/i.test(texto)) return null;

  const avisos: string[] = [];
  const campos: Record<string, string> = {};

  // "Check-In ter 04 ago 2026 às 14h00 Check-Out qua 05 ago 2026 às 12h00"
  const inOut = texto.match(
    /Check-?In[^\d]*(\d{1,2}\s+[a-zç]{3}\s+\d{4})\s*(?:às|as)?\s*(\d{1,2}[h:]\d{2})?[\s\S]*?Check-?Out[^\d]*(\d{1,2}\s+[a-zç]{3}\s+\d{4})\s*(?:às|as)?\s*(\d{1,2}[h:]\d{2})?/i,
  );
  if (inOut) {
    const entrada = dataComAno(inOut[1]);
    const saida = dataComAno(inOut[3]);
    if (entrada) campos.checkInDate = entrada;
    if (saida) campos.checkOutDate = saida;
    if (inOut[2]) campos.checkInTime = hora(inOut[2]);
    if (inOut[4]) campos.checkOutTime = hora(inOut[4]);
  } else {
    avisos.push("Não consegui ler as datas de check-in/check-out — preencha à mão.");
  }

  // Nome do hotel: linha seguinte ao cabeçalho de emissão/protocolo.
  const hotel = texto.match(/Protocolo:[^\n]*\n([^\n]+)/i);
  if (hotel) campos.hotelName = hotel[1].trim();

  const cidade = texto.match(/Hospedagem em\s+([^\n]+)/i);
  if (cidade) campos.hotelLocation = cidade[1].trim();

  const reserva = texto.match(/Localizador do hotel:\s*([A-Z0-9-]+)/i);
  if (reserva) campos.reservationNumber = reserva[1];

  const quarto = texto.match(/^(Quarto\s+(?:Duplo|Single|Triplo|Standard|Superior|Luxo)[^\n]*)$/im);
  if (quarto) campos.roomType = quarto[1].trim();

  const diarias = texto.match(/(\d+)\s+Di[áa]ria/i);
  if (diarias) campos.nightsCount = diarias[1];

  // O voucher da Onfly não estampa o valor da diária: só a taxa de balcão que
  // se paga no hotel. Melhor avisar do que oferecer um número errado.
  const balcao = texto.match(/Valor a pagar no hotel:\s*(R\$\s*[\d.]+,\d{2})/i);
  if (balcao) {
    const v = valorBr(balcao[1]);
    avisos.push(
      `Este voucher só mostra a taxa de balcão (R$ ${v}) — o valor da diária não vem no arquivo e precisa ser preenchido à mão.`,
    );
  }

  const hospede = texto.match(/^([A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{6,}?)\s+\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/m);

  return {
    tipo: "hospedagem",
    formato: "Voucher de hotel (Onfly)",
    campos,
    pessoa: hospede ? hospede[1].trim() : undefined,
    avisos,
  };
}

// ─── Passagem rodoviária (QueroPassagem e semelhantes) ─────────────────────
//
// Layout diferente do aéreo em tudo o que importa: os dois trechos vêm em
// blocos "VIAGEM DE IDA" / "VIAGEM DE VOLTA", cada um com o seu localizador,
// e as rodoviárias aparecem por extenso ("São Paulo, SP - Barra Funda") em
// vez da sigla de três letras.

/** "São Paulo, SP - Barra Funda" → cidade e terminal, separados. */
function rodoviaria(linha: string): { cidade: string; terminal: string } {
  const texto = linha.trim();
  // "Cidade, UF - Terminal". Sem o traço, o nome inteiro é o terminal.
  const m = texto.match(/^(.+?),\s*[A-Za-z]{2}\s*[-–—]\s*(.+)$/);
  if (m) return { cidade: capitalizar(m[1]), terminal: m[2].trim() };
  const semUf = texto.match(/^(.+?),\s*[A-Za-z]{2}$/);
  if (semUf) return { cidade: capitalizar(semUf[1]), terminal: "" };
  return { cidade: "", terminal: texto };
}

/**
 * A seção "RODOVIÁRIA DE EMBARQUE (IDA)" e suas três irmãs: o cabeçalho diz
 * qual ponta de qual trecho, e a linha seguinte traz o nome. É a fonte mais
 * confiável do arquivo — a linha "Trecho:" junta as duas pontas com uma seta
 * que nem sempre sobrevive à extração do PDF.
 */
function pontoRodoviario(
  linhas: string[],
  qual: "EMBARQUE" | "DESEMBARQUE",
  trecho: "IDA" | "VOLTA",
): { cidade: string; terminal: string } | null {
  const cabecalho = new RegExp(`RODOVI[ÁA]RIA\\s+DE\\s+${qual}\\s*\\(\\s*${trecho}\\s*\\)`, "i");
  const i = linhas.findIndex((l) => cabecalho.test(l));
  if (i < 0) return null;
  const nome = (linhas[i + 1] ?? "").trim();
  if (!nome) return null;
  return rodoviaria(nome);
}

/** "03/09/2026 07:00:00" → data ISO e hora sem os segundos. */
function dataEHoraRodoviaria(texto: string): { data: string; hora: string } | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { data: `${m[3]}-${m[2]}-${m[1]}`, hora: `${m[4].padStart(2, "0")}:${m[5]}` };
}

/** "2026-09-07" → "07/09" (só para caber na frase do aviso). */
function diaMesBr(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

interface TrechoRodoviario {
  partida: { data: string; hora: string } | null;
  chegada: { data: string; hora: string } | null;
  localizador: string;
  poltrona: string;
  classe: string;
}

/** Lê um bloco "VIAGEM DE IDA"/"VIAGEM DE VOLTA" inteiro. */
function lerTrechoRodoviario(bloco: string): TrechoRodoviario {
  // Rótulo e valor caem em linhas separadas na extração do PDF; o \s* depois
  // dos dois-pontos cobre os dois casos sem precisar de dois padrões.
  const acha = (rotulo: string, valor: string) =>
    bloco.match(new RegExp(`${rotulo}:\\s*(${valor})`, "i"))?.[1]?.trim() ?? "";
  const partida = acha("Partida", "\\d{2}/\\d{2}/\\d{4}\\s+[\\d:]+");
  const chegada = acha("Chegada", "\\d{2}/\\d{2}/\\d{4}\\s+[\\d:]+");
  return {
    partida: partida ? dataEHoraRodoviaria(partida) : null,
    chegada: chegada ? dataEHoraRodoviaria(chegada) : null,
    localizador: acha("Localizador", "[A-Za-z0-9]{4,10}").toUpperCase(),
    poltrona: acha("Poltrona", "\\d{1,3}"),
    classe: acha("Classe", "[A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+)?"),
  };
}

export function lerVoucherRodoviario(texto: string): VoucherLeitura | null {
  if (!/VIAGEM\s+DE\s+(IDA|VOLTA)/i.test(texto)) return null;
  if (!/RODOVI[ÁA]RIA|Poltrona/i.test(texto)) return null;

  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];
  const campos: Record<string, string> = { transportType: "rodoviario" };

  const iIda = texto.search(/VIAGEM\s+DE\s+IDA/i);
  const iVolta = texto.search(/VIAGEM\s+DE\s+VOLTA/i);
  // O bloco da ida termina onde começa o da volta; o da volta vai até as
  // seções de rodoviária, que já não pertencem a nenhum dos dois.
  const fimDosTrechos = texto.search(/RODOVI[ÁA]RIA\s+DE\s+EMBARQUE/i);
  const fim = (depois: number) => (fimDosTrechos > depois ? fimDosTrechos : texto.length);

  const ida = iIda >= 0
    ? lerTrechoRodoviario(texto.slice(iIda, iVolta > iIda ? iVolta : fim(iIda)))
    : null;
  const volta = iVolta >= 0 ? lerTrechoRodoviario(texto.slice(iVolta, fim(iVolta))) : null;

  // "Bilhete" no formulário é o número da compra, não o localizador: cada
  // trecho tem o seu e o campo é um só.
  const comprovante = texto.match(/Comprovante:\s*([A-Za-z0-9-]{4,20})/i);
  if (comprovante) campos.purchaseOrderNumber = comprovante[1].toUpperCase();

  if (ida) {
    const origem = pontoRodoviario(linhas, "EMBARQUE", "IDA");
    const destino = pontoRodoviario(linhas, "DESEMBARQUE", "IDA");
    if (origem?.terminal) campos.departureAirport = origem.terminal;
    if (origem?.cidade) campos.departureCityOrigin = origem.cidade;
    if (destino?.terminal) campos.destinationAirport = destino.terminal;
    if (destino?.cidade) campos.departureCityDestination = destino.cidade;
    if (ida.partida) {
      campos.actualDepartureDate = ida.partida.data;
      campos.actualDepartureTime = ida.partida.hora;
    } else {
      avisos.push("Não consegui ler o embarque da ida — confira.");
    }
    if (ida.chegada) campos.actualArrivalTime = ida.chegada.hora;
  }

  if (volta) {
    const origem = pontoRodoviario(linhas, "EMBARQUE", "VOLTA");
    const destino = pontoRodoviario(linhas, "DESEMBARQUE", "VOLTA");
    if (origem?.terminal) campos.returnOriginAirport = origem.terminal;
    if (origem?.cidade) campos.returnCityOrigin = origem.cidade;
    if (destino?.terminal) campos.returnDestinationAirport = destino.terminal;
    if (destino?.cidade) campos.returnCityDestination = destino.cidade;
    if (volta.partida) {
      campos.actualReturnDate = volta.partida.data;
      campos.actualReturnTime = volta.partida.hora;
    } else {
      avisos.push("Não consegui ler o embarque da volta — confira.");
    }
    if (volta.chegada) campos.returnArrivalTime = volta.chegada.hora;
    // Ônibus noturno desembarca no dia seguinte. Só o horário é gravado, e
    // "chega 06:30" lido sozinho parece o mesmo dia — é diferença que muda
    // diária de hotel e mobilidade de madrugada.
    if (volta.partida && volta.chegada && volta.chegada.data !== volta.partida.data) {
      avisos.push(
        `A volta embarca ${diaMesBr(volta.partida.data)} e desembarca ${diaMesBr(volta.chegada.data)} — vira o dia.`,
      );
    }
  }

  // Não existe campo para localizador, poltrona nem classe: vão no aviso,
  // para quem confere não precisar reabrir o PDF.
  const detalhe = (t: TrechoRodoviario) =>
    [t.localizador, t.poltrona && `poltrona ${t.poltrona}`, t.classe].filter(Boolean).join(" · ");
  const detalhes = [ida && `ida ${detalhe(ida)}`, volta && `volta ${detalhe(volta)}`].filter(Boolean);
  if (detalhes.length) avisos.push(`Localizador e assento: ${detalhes.join(" | ")}.`);

  // Igual ao voucher da Onfly: este comprovante não estampa preço nenhum.
  avisos.push("Este comprovante não traz o valor — preencha o Valor da Passagem à mão.");

  const passageiro = texto.match(/Passageiro:\s*(.+)/i);
  const pessoa = passageiro ? capitalizar(passageiro[1].trim()) : undefined;

  const umTrechoSo = !(ida && volta);
  if (umTrechoSo) {
    avisos.push("Este comprovante traz um trecho só. Confira se é a ida ou a volta antes de registrar.");
  }

  return {
    tipo: "passagem",
    formato: "Passagem rodoviária",
    campos,
    pessoa,
    pessoas: pessoa ? [pessoa] : undefined,
    trechoUnico: umTrechoSo,
    avisos,
  };
}

/** Reconhece o arquivo e devolve o que der para aproveitar. */
export function lerVoucher(texto: string): VoucherLeitura {
  return (
    // O rodoviário antes do voucher da agência: aquele detecta por
    // "LOCALIZADOR:", que o bilhete de ônibus também tem, e leria a viagem
    // de ônibus como se fosse um voo.
    lerVoucherRodoviario(texto) ??
    lerVoucherPassagem(texto) ??
    lerVoucherAereoOnfly(texto) ??
    // Os dois de hotel antes do da Onfly: o detector dele é genérico
    // ("Check-In") e engoliria qualquer arquivo com essa palavra.
    lerRelatorioDeReservas(texto) ??
    lerVoucherHotelAgencia(texto) ??
    lerVoucherHospedagem(texto) ?? {
      tipo: "desconhecido",
      campos: {},
      avisos: ["Não reconheci o layout deste arquivo — preencha os campos normalmente."],
    }
  );
}
