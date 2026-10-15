/**
 * Aeroportos das cidades brasileiras mais comuns na logística (09/10 — busca de
 * passagens na internet). Mapa ESTÁTICO: cidade → aeroportos comerciais, o
 * PRINCIPAL primeiro (é o que a busca consulta; a tela deixa trocar pelos
 * outros da lista). Cidade sem aeroporto próprio aponta para o mais usado da
 * região (Santos → CGH/GRU; Balneário Camboriú → NVT).
 *
 * Não é cadastro: o aeroporto do EVENTO é confirmado uma vez por quem compra e
 * fica gravado em `events.aeroporto_iata`; daqui sai só a sugestão. O "Sai de"
 * da vaga é texto livre ("São Paulo - SP", "Sao Paulo/SP", "GRU") — por isso a
 * leitura tira acento, UF e pontuação antes de procurar.
 */

export interface Aeroporto {
  iata: string;
  nome: string;
  cidade: string;
}

/** Aeroportos conhecidos (nome curto, como Compras fala). */
export const AEROPORTOS: Record<string, Aeroporto> = Object.fromEntries(([
  ["GRU", "Guarulhos", "São Paulo"], ["CGH", "Congonhas", "São Paulo"], ["VCP", "Viracopos", "Campinas"],
  ["GIG", "Galeão", "Rio de Janeiro"], ["SDU", "Santos Dumont", "Rio de Janeiro"],
  ["CNF", "Confins", "Belo Horizonte"], ["PLU", "Pampulha", "Belo Horizonte"],
  ["BSB", "Brasília", "Brasília"], ["SSA", "Salvador", "Salvador"], ["REC", "Recife", "Recife"],
  ["FOR", "Fortaleza", "Fortaleza"], ["POA", "Salgado Filho", "Porto Alegre"], ["CWB", "Afonso Pena", "Curitiba"],
  ["FLN", "Florianópolis", "Florianópolis"], ["GYN", "Goiânia", "Goiânia"], ["MAO", "Manaus", "Manaus"],
  ["BEL", "Belém", "Belém"], ["VIX", "Vitória", "Vitória"], ["NAT", "Natal", "Natal"],
  ["JPA", "João Pessoa", "João Pessoa"], ["MCZ", "Maceió", "Maceió"], ["AJU", "Aracaju", "Aracaju"],
  ["THE", "Teresina", "Teresina"], ["SLZ", "São Luís", "São Luís"], ["CGB", "Cuiabá", "Cuiabá"],
  ["CGR", "Campo Grande", "Campo Grande"], ["PVH", "Porto Velho", "Porto Velho"], ["RBR", "Rio Branco", "Rio Branco"],
  ["MCP", "Macapá", "Macapá"], ["BVB", "Boa Vista", "Boa Vista"], ["PMW", "Palmas", "Palmas"],
  ["LDB", "Londrina", "Londrina"], ["MGF", "Maringá", "Maringá"], ["IGU", "Foz do Iguaçu", "Foz do Iguaçu"],
  ["CAC", "Cascavel", "Cascavel"], ["NVT", "Navegantes", "Navegantes"], ["JOI", "Joinville", "Joinville"],
  ["XAP", "Chapecó", "Chapecó"], ["CXJ", "Caxias do Sul", "Caxias do Sul"], ["PET", "Pelotas", "Pelotas"],
  ["RIA", "Santa Maria", "Santa Maria"], ["UDI", "Uberlândia", "Uberlândia"], ["UBA", "Uberaba", "Uberaba"],
  ["MOC", "Montes Claros", "Montes Claros"], ["IZA", "Zona da Mata", "Juiz de Fora"], ["IPN", "Ipatinga", "Ipatinga"],
  ["GVR", "Governador Valadares", "Governador Valadares"], ["RAO", "Ribeirão Preto", "Ribeirão Preto"],
  ["SJP", "São José do Rio Preto", "São José do Rio Preto"], ["SJK", "São José dos Campos", "São José dos Campos"],
  ["PPB", "Presidente Prudente", "Presidente Prudente"], ["JTC", "Bauru", "Bauru"], ["ARU", "Araçatuba", "Araçatuba"],
  ["MII", "Marília", "Marília"], ["CAW", "Campos dos Goytacazes", "Campos dos Goytacazes"], ["MEA", "Macaé", "Macaé"],
  ["CFB", "Cabo Frio", "Cabo Frio"], ["IOS", "Ilhéus", "Ilhéus"], ["BPS", "Porto Seguro", "Porto Seguro"],
  ["VDC", "Vitória da Conquista", "Vitória da Conquista"], ["PNZ", "Petrolina", "Petrolina"],
  ["JDO", "Juazeiro do Norte", "Juazeiro do Norte"], ["CPV", "Campina Grande", "Campina Grande"],
  ["IMP", "Imperatriz", "Imperatriz"], ["STM", "Santarém", "Santarém"], ["MAB", "Marabá", "Marabá"],
  ["JJD", "Jericoacoara", "Jijoca de Jericoacoara"], ["FEN", "Fernando de Noronha", "Fernando de Noronha"],
  ["BYO", "Bonito", "Bonito"], ["DOU", "Dourados", "Dourados"], ["OPS", "Sinop", "Sinop"], ["ROO", "Rondonópolis", "Rondonópolis"],
] as const).map(([iata, nome, cidade]) => [iata, { iata, nome, cidade }]));

/** Cidade (já normalizada por `chaveDaCidade`) → aeroportos, o principal primeiro. */
const POR_CIDADE: Record<string, readonly string[]> = {
  "sao paulo": ["GRU", "CGH", "VCP"],
  guarulhos: ["GRU", "CGH"],
  osasco: ["CGH", "GRU"], "santo andre": ["CGH", "GRU"], "sao bernardo do campo": ["CGH", "GRU"],
  "sao caetano do sul": ["CGH", "GRU"], barueri: ["CGH", "GRU"], diadema: ["CGH", "GRU"],
  santos: ["CGH", "GRU"], "sao vicente": ["CGH", "GRU"], guaruja: ["CGH", "GRU"],
  campinas: ["VCP", "GRU", "CGH"], jundiai: ["VCP", "GRU", "CGH"], piracicaba: ["VCP", "GRU"],
  sorocaba: ["VCP", "CGH", "GRU"], americana: ["VCP", "GRU"], limeira: ["VCP", "GRU"],
  "sao jose dos campos": ["SJK", "GRU"], taubate: ["SJK", "GRU"],
  "rio de janeiro": ["GIG", "SDU"], niteroi: ["SDU", "GIG"], "duque de caxias": ["GIG", "SDU"],
  "nova iguacu": ["GIG", "SDU"], "sao goncalo": ["GIG", "SDU"], petropolis: ["GIG", "SDU"],
  "belo horizonte": ["CNF", "PLU"], contagem: ["CNF", "PLU"], betim: ["CNF", "PLU"], "lagoa santa": ["CNF"],
  "nova lima": ["CNF", "PLU"],
  brasilia: ["BSB"], taguatinga: ["BSB"], salvador: ["SSA"], "lauro de freitas": ["SSA"], "feira de santana": ["SSA"],
  recife: ["REC"], olinda: ["REC"], jaboatao: ["REC"], "jaboatao dos guararapes": ["REC"], caruaru: ["REC"],
  fortaleza: ["FOR"], "porto alegre": ["POA"], canoas: ["POA"], gramado: ["POA", "CXJ"], "novo hamburgo": ["POA"],
  curitiba: ["CWB"], "sao jose dos pinhais": ["CWB"], "ponta grossa": ["CWB"],
  florianopolis: ["FLN"], "sao jose": ["FLN"], palhoca: ["FLN"],
  goiania: ["GYN"], anapolis: ["GYN", "BSB"], "aparecida de goiania": ["GYN"],
  manaus: ["MAO"], belem: ["BEL"], ananindeua: ["BEL"],
  vitoria: ["VIX"], "vila velha": ["VIX"], serra: ["VIX"], cariacica: ["VIX"], guarapari: ["VIX"],
  natal: ["NAT"], mossoro: ["NAT"], "joao pessoa": ["JPA"], maceio: ["MCZ"], aracaju: ["AJU"],
  teresina: ["THE"], "sao luis": ["SLZ"], cuiaba: ["CGB"], "varzea grande": ["CGB"], "campo grande": ["CGR"],
  "porto velho": ["PVH"], "rio branco": ["RBR"], macapa: ["MCP"], "boa vista": ["BVB"], palmas: ["PMW"],
  londrina: ["LDB"], maringa: ["MGF"], "foz do iguacu": ["IGU"], cascavel: ["CAC"],
  navegantes: ["NVT"], itajai: ["NVT"], "balneario camboriu": ["NVT"], blumenau: ["NVT"],
  joinville: ["JOI", "NVT"], chapeco: ["XAP"], "caxias do sul": ["CXJ", "POA"], pelotas: ["PET", "POA"],
  "santa maria": ["RIA", "POA"], uberlandia: ["UDI"], uberaba: ["UBA", "UDI"], "montes claros": ["MOC"],
  "juiz de fora": ["IZA", "GIG", "CNF"], ipatinga: ["IPN"], "governador valadares": ["GVR"],
  "ribeirao preto": ["RAO"], "sao jose do rio preto": ["SJP"], "presidente prudente": ["PPB"], bauru: ["JTC"],
  aracatuba: ["ARU"], marilia: ["MII"], "campos dos goytacazes": ["CAW"], macae: ["MEA"],
  "cabo frio": ["CFB"], buzios: ["CFB"], "armacao dos buzios": ["CFB"], ilheus: ["IOS"],
  "porto seguro": ["BPS"], trancoso: ["BPS"], "arraial d ajuda": ["BPS"], "vitoria da conquista": ["VDC"],
  petrolina: ["PNZ"], juazeiro: ["PNZ"], "juazeiro do norte": ["JDO"], "campina grande": ["CPV"],
  imperatriz: ["IMP"], santarem: ["STM"], maraba: ["MAB"], jericoacoara: ["JJD"], "jijoca de jericoacoara": ["JJD"],
  "fernando de noronha": ["FEN"], bonito: ["BYO"], dourados: ["DOU"], sinop: ["OPS"], rondonopolis: ["ROO"],
};

/** "São Paulo - SP" / "Sao Paulo/SP" / "são paulo, sp" → "sao paulo". */
export function chaveDaCidade(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[-/,(]\s*[a-z]{2}\)?\s*$/, "") // UF no fim
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Código IATA de 3 letras (maiúsculas ou não)? */
export function ehIata(texto: string | null | undefined): boolean {
  return /^[A-Za-z]{3}$/.test(String(texto ?? "").trim());
}

/**
 * Aeroportos de uma cidade em texto livre, o principal primeiro. Aceita o
 * próprio código ("GRU" → ["GRU"]). Desconhecida → [].
 */
export function aeroportosDaCidade(texto: string | null | undefined): string[] {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return [];
  if (ehIata(bruto)) {
    const iata = bruto.toUpperCase();
    return AEROPORTOS[iata] ? [iata] : [];
  }
  const lista = POR_CIDADE[chaveDaCidade(bruto)];
  return lista ? [...lista] : [];
}

/** "GRU" → "GRU · Guarulhos"; código desconhecido volta como veio. */
export function rotuloDoAeroporto(iata: string | null | undefined): string {
  const c = String(iata ?? "").trim().toUpperCase();
  const a = AEROPORTOS[c];
  return a ? `${c} · ${a.nome}` : c;
}
