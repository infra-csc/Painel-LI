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
  /** O que o operador precisa checar com o olho. */
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
 * CIDADES (o trecho só nomeia o aeroporto — "Congonhas" não é cidade). Só
 * vale para o caso ida-e-volta simples; com conexões, o nome do aeroporto
 * limpo continua sendo a melhor informação disponível.
 */
function cidadesDoRoteiro(texto: string): [string, string] | null {
  const cabecalho = texto.split(/\r?\n/)[0] ?? "";
  const rota = cabecalho.split(/\s+LOCALIZADOR/i)[0];
  const partes = rota.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
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
    campos.isOneWay = "true";
    avisos.push("Só encontrei o trecho de ida — confira se a passagem é somente ida.");
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

/** Reconhece o arquivo e devolve o que der para aproveitar. */
export function lerVoucher(texto: string): VoucherLeitura {
  return (
    lerVoucherPassagem(texto) ??
    lerVoucherHospedagem(texto) ?? {
      tipo: "desconhecido",
      campos: {},
      avisos: ["Não reconheci o layout deste arquivo — preencha os campos normalmente."],
    }
  );
}
