/**
 * LINKS DE COMPRA da Busca de passagens (16/10) — regra pura, testada.
 *
 * O dono abriu "Abrir na companhia" num GRU → BEL e caiu no Kiwi.com em EURO,
 * com taxa da agência. Daqui em diante:
 *
 *  1. "Abrir na companhia" abre SEMPRE o site da própria companhia do voo
 *     (LATAM, GOL ou Azul): primeiro o link do voo exato que o fornecedor
 *     trouxer; depois o link da companhia sem o voo exato; se o fornecedor não
 *     trouxer nenhum, o app MONTA a busca no site oficial (português, reais,
 *     origem, destino, datas e 1 adulto) — sem gastar consulta.
 *  2. "Comparar em": uma lista FIXA de comparadores e agências CONFIÁVEIS
 *     (SITES_CONFIAVEIS, abaixo), sempre com a busca montada pelo app em
 *     reais e pt-BR — não dependem do fornecedor nem gastam consulta.
 *  3. Os demais links do fornecedor (Kiwi e outros) vão para o FIM do menu,
 *     em "Outros sites (menos conhecidos)", com o aviso de taxa própria —
 *     nunca como primeira opção. No Kiwi o link é forçado para reais e
 *     português (`currency=BRL`, `lang=br`, caminho `/br/`).
 *  4. Preço do link só aparece quando vem em BRL; em outra moeda (ou sem
 *     moeda) a tela diz que o preço no site pode variar.
 *
 * Ordem na tela: companhia → confiáveis → resto.
 *
 * Formatos conferidos no navegador em 16/10: LATAM, GOL e Azul leram origem,
 * destino, datas e 1 adulto da URL; Google Voos, Kayak e Decolar abriram os
 * resultados em reais e português; o Skyscanner pediu verificação anti-robô
 * antes dos resultados (formato público de busca deles, não conferido aqui).
 */
import { NOME_DA_CIA, type ItinerarioDeVoo } from "./busca-de-passagens";

/** Link como o fornecedor devolve (normalizado no servidor). */
export interface LinkDeCompra {
  /** "LATAM", "Kiwi.com"… */
  nome: string;
  url: string;
  /** "airline" quando é o site da própria companhia; "third_party" = agência. */
  tipo: string | null;
  /** Link do voo exato (true) ou de uma página de resultados (false). */
  vooExato: boolean;
  precoCentavos: number | null;
  /** Moeda do preço do link ("BRL", "EUR"…). Ausente nos links antigos do cache. */
  moeda?: string | null;
}

export type CiaComSite = "LA" | "G3" | "AD";

/** O que o link montado precisa saber do voo. Datas "AAAA-MM-DD". */
export interface ViagemDoLink {
  cia: string;
  origem: string;
  destino: string;
  ida: string;
  volta: string | null;
}

/** Um site na tela: o da companhia (botão), um confiável ("Comparar em") ou um dos menos conhecidos. */
export interface SiteDeCompra {
  nome: string;
  url: string;
  /** "confiavel" = da lista fixa; "agencia" = agência menos conhecida (pode cobrar taxa). */
  tipo: "companhia" | "confiavel" | "agencia";
  vooExato: boolean;
  /** Busca montada pelo app (não veio do fornecedor). */
  montado: boolean;
  /** Só quando o preço do link está em reais; senão null ("pode variar"). */
  precoCentavos: number | null;
}

const IATA = /^[A-Z]{3}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "JJ" (código antigo da TAM) é LATAM. Fora das três → null. */
export function ciaComSite(cia: string | null | undefined): CiaComSite | null {
  const c = String(cia ?? "").trim().toUpperCase();
  if (c === "LA" || c === "JJ") return "LA";
  if (c === "G3") return "G3";
  if (c === "AD") return "AD";
  return null;
}

const ddmmaaaa = (d: string, sep: string) => `${d.slice(8, 10)}${sep}${d.slice(5, 7)}${sep}${d.slice(0, 4)}`;
const mmddaaaa = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
/** Meio-dia UTC: a data não muda em nenhum fuso do Brasil. */
const meioDia = (d: string) => encodeURIComponent(`${d}T12:00:00.000Z`);

/**
 * Busca no site OFICIAL da companhia, em português e reais, com origem,
 * destino, ida (e volta, se houver) e 1 adulto. Dado inválido → null.
 */
export function linkDaCompanhia(cia: string, origem: string, destino: string, ida: string, volta: string | null): string | null {
  const c = ciaComSite(cia);
  const de = String(origem ?? "").toUpperCase(), para = String(destino ?? "").toUpperCase();
  if (!c || !IATA.test(de) || !IATA.test(para) || de === para || !DIA.test(ida ?? "")) return null;
  if (volta !== null && (!DIA.test(volta) || volta < ida)) return null;
  if (c === "LA") {
    return "https://www.latamairlines.com/br/pt/oferta-voos"
      + `?origin=${de}&outbound=${meioDia(ida)}&destination=${para}&inbound=${volta ? meioDia(volta) : "null"}`
      + `&adt=1&chd=0&inf=0&trip=${volta ? "RT" : "OW"}&cabin=Economy&redemption=false&sort=RECOMMENDED`;
  }
  if (c === "G3") {
    return "https://b2c.voegol.com.br/compra/busca-parceiros"
      + `?pv=br&tipo=${volta ? "DF" : "SO"}&de=${de}&para=${para}&ida=${ddmmaaaa(ida, "-")}${volta ? `&volta=${ddmmaaaa(volta, "-")}` : ""}`
      + "&ADT=1&ADL=0&CHD=0&INF=0";
  }
  const trechos = [`c[0].ds=${de}&c[0].std=${mmddaaaa(ida)}&c[0].as=${para}`];
  if (volta) trechos.push(`c[1].ds=${para}&c[1].std=${mmddaaaa(volta)}&c[1].as=${de}`);
  return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${trechos.join("&")}&p[0].t=ADT&p[0].c=1&p[0].cp=false&f.dl=3&f.dr=3&cc=BRL`;
}

// ── Comparadores e agências confiáveis (lista fixa) ────────────────────────

/**
 * CRITÉRIO da lista (dono, 16/10: "agregadores mais confiáveis"): empresa
 * grande e conhecida no Brasil, com site brasileiro que mostra o preço em
 * REAIS e em português, que vende (ou leva à compra) com nota fiscal/CNPJ ou
 * redireciona para a própria companhia, e cuja busca abre por URL com origem,
 * destino, datas e 1 adulto. Ficaram de fora sites de passagem com milhas de
 * terceiros e agências estrangeiras que cobram em outra moeda (o caso do Kiwi).
 * Para incluir um site: provar o formato no navegador e acrescentar o teste.
 */
export interface SiteConfiavel {
  id: "google" | "skyscanner" | "kayak" | "decolar";
  nome: string;
  /** Reconhece o mesmo site nos links do fornecedor (para mostrar o preço dele). */
  dominio: RegExp;
  nomeNoFornecedor: RegExp;
  montar: (v: { origem: string; destino: string; ida: string; volta: string | null }) => string;
}

const aammdd = (d: string) => `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;

export const SITES_CONFIAVEIS: readonly SiteConfiavel[] = [
  {
    // Comparador; a compra é feita na companhia ou na agência que ele listar.
    id: "google", nome: "Google Voos", dominio: /(^|\.)google\.[a-z.]+$/i, nomeNoFornecedor: /google/i,
    montar: ({ origem, destino, ida, volta }) =>
      `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${destino} from ${origem} on ${ida}${volta ? ` through ${volta}` : " one way"}`)}&hl=pt-BR&gl=BR&curr=BRL`,
  },
  {
    id: "skyscanner", nome: "Skyscanner", dominio: /(^|\.)skyscanner\.[a-z.]+$/i, nomeNoFornecedor: /skyscanner/i,
    montar: ({ origem, destino, ida, volta }) =>
      `https://www.skyscanner.com.br/transporte/passagens-aereas/${origem.toLowerCase()}/${destino.toLowerCase()}/${aammdd(ida)}/${volta ? `${aammdd(volta)}/` : ""}`
      + `?adultsv2=1&cabinclass=economy&rtn=${volta ? 1 : 0}&currency=BRL&locale=pt-BR&market=BR`,
  },
  {
    id: "kayak", nome: "Kayak", dominio: /(^|\.)kayak\.[a-z.]+$/i, nomeNoFornecedor: /kayak/i,
    montar: ({ origem, destino, ida, volta }) =>
      `https://www.kayak.com.br/flights/${origem}-${destino}/${ida}${volta ? `/${volta}` : ""}/1adults?sort=bestflight_a`,
  },
  {
    // Agência brasileira (Despegar): vende em reais, com taxa de serviço mostrada no checkout.
    id: "decolar", nome: "Decolar", dominio: /(^|\.)(decolar|despegar)\.[a-z.]+$/i, nomeNoFornecedor: /decolar|despegar/i,
    montar: ({ origem, destino, ida, volta }) =>
      `https://www.decolar.com/shop/flights/results/${volta ? `roundtrip/${origem}/${destino}/${ida}/${volta}` : `oneway/${origem}/${destino}/${ida}`}/1/0/0`,
  },
];

/**
 * Os links do fornecedor que NÃO são da companhia nem da lista confiável vão
 * para o fim do menu ("Outros sites (menos conhecidos)"). `false` = escondidos.
 */
export const MOSTRAR_SITES_MENOS_CONHECIDOS = true;

/** Qual site confiável é este link do fornecedor (pelo domínio ou pelo nome). */
export function confiavelDoLink(l: Pick<LinkDeCompra, "nome" | "url">): SiteConfiavel | null {
  const h = host(l.url);
  return SITES_CONFIAVEIS.find((s) => s.dominio.test(h) || s.nomeNoFornecedor.test(l.nome)) ?? null;
}

/** As buscas montadas nos sites confiáveis (vazia se a viagem não tem dado válido). */
export function linksConfiaveis(viagem: Omit<ViagemDoLink, "cia"> | null): Array<{ site: SiteConfiavel; url: string }> {
  if (!viagem) return [];
  const de = String(viagem.origem ?? "").toUpperCase(), para = String(viagem.destino ?? "").toUpperCase();
  if (!IATA.test(de) || !IATA.test(para) || de === para || !DIA.test(viagem.ida ?? "")) return [];
  if (viagem.volta !== null && (!DIA.test(viagem.volta) || viagem.volta < viagem.ida)) return [];
  return SITES_CONFIAVEIS.map((site) => ({ site, url: site.montar({ origem: de, destino: para, ida: viagem.ida, volta: viagem.volta }) }));
}

// ── Companhias ─────────────────────────────────────────────────────────────

const DOMINIOS: Array<[RegExp, CiaComSite]> = [
  [/(^|\.)(latamairlines\.com|latam\.com)$/i, "LA"],
  [/(^|\.)voegol\.com\.br$/i, "G3"],
  [/(^|\.)voeazul\.com\.br$/i, "AD"],
];
const NOMES: Array<[RegExp, CiaComSite]> = [
  [/\blatam\b/i, "LA"],
  [/\bgol\b/i, "G3"],
  [/\bazul\b/i, "AD"],
];

function host(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

/**
 * De qual das três companhias é o site deste link: pelo domínio oficial, ou
 * pelo nome quando o fornecedor diz que é companhia. Só o nome não basta
 * ("Azul Viagens" é agência de pacotes).
 */
export function ciaDoLink(l: Pick<LinkDeCompra, "nome" | "url" | "tipo">): CiaComSite | null {
  const h = host(l.url);
  for (const [re, cia] of DOMINIOS) if (re.test(h)) return cia;
  if (l.tipo === "airline") for (const [re, cia] of NOMES) if (re.test(l.nome)) return cia;
  return null;
}

/** Site de companhia aérea (qualquer uma): tipo "airline" ou domínio oficial. */
const ehCompanhia = (l: LinkDeCompra) => l.tipo === "airline" || ciaDoLink(l) !== null;

/** Agência com URL que aceita moeda e idioma → reais e português. Outras ficam como vieram. */
export function urlEmReais(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (/(^|\.)kiwi\.com$/i.test(u.hostname)) {
    u.searchParams.set("currency", "BRL");
    u.searchParams.set("lang", "br");
    const partes = u.pathname.split("/");
    // "/en/booking…" → "/br/booking…" (o primeiro pedaço é o idioma do site).
    if (partes.length > 2 && /^[a-z]{2}(-[a-z]{2})?$/i.test(partes[1])) {
      partes[1] = "br";
      u.pathname = partes.join("/");
    }
    return u.toString();
  }
  return url;
}

const emReais = (l: LinkDeCompra) =>
  l.precoCentavos !== null && Number.isFinite(l.precoCentavos) && String(l.moeda ?? "").toUpperCase() === "BRL" ? l.precoCentavos : null;

/** Origem, destino, datas e companhia do voo — do próprio itinerário (vale para datas vizinhas e outros aeroportos). */
export function viagemDoItinerario(it: Pick<ItinerarioDeVoo, "pernas">): ViagemDoLink | null {
  const ida = it.pernas[0];
  const ini = ida?.segmentos[0], fim = ida?.segmentos[ida.segmentos.length - 1];
  if (!ini || !fim) return null;
  const voltaIni = it.pernas[1]?.segmentos[0];
  return {
    cia: ini.companhia || ida.companhia,
    origem: ini.origem,
    destino: fim.destino,
    ida: ini.partida.slice(0, 10),
    volta: voltaIni ? voltaIni.partida.slice(0, 10) : null,
  };
}

/** Os sites da tela, na ordem: companhia → confiáveis → resto. */
export interface SitesDaOpcao {
  /** Botão "Abrir na companhia" (null = nenhum site da companhia possível). */
  companhia: SiteDeCompra | null;
  /** "Comparar em": a lista fixa, montada pelo app, com o preço do fornecedor quando em BRL. */
  confiaveis: SiteDeCompra[];
  /** "Outros sites (menos conhecidos)": o resto dos links do fornecedor, no fim. */
  outros: SiteDeCompra[];
}

/**
 * Separa os sites de um voo. `links` null = ainda não pedidos ao fornecedor:
 * companhia e confiáveis saem montados (sem consulta), `outros` vazio.
 */
export function sitesDeCompra(links: readonly LinkDeCompra[] | null, viagem: ViagemDoLink | null): SitesDaOpcao {
  const lista = (links ?? []).filter((l) => !!host(l.url));
  const cia = ciaComSite(viagem?.cia);
  // Companhia fora das três (não acontece na busca, mas não quebra): o site de companhia que vier.
  const daCia = cia ? lista.filter((l) => ciaDoLink(l) === cia) : lista.filter((l) => l.tipo === "airline");
  const escolhido = daCia.find((l) => l.vooExato) ?? daCia[0] ?? null;

  let companhia: SiteDeCompra | null = null;
  if (escolhido) {
    companhia = { nome: cia ? NOME_DA_CIA[cia] : escolhido.nome, url: escolhido.url, tipo: "companhia", vooExato: escolhido.vooExato, montado: false, precoCentavos: emReais(escolhido) };
  } else if (cia && viagem) {
    const url = linkDaCompanhia(cia, viagem.origem, viagem.destino, viagem.ida, viagem.volta);
    if (url) companhia = { nome: NOME_DA_CIA[cia], url, tipo: "companhia", vooExato: false, montado: true, precoCentavos: null };
  }

  // Confiáveis: SEMPRE a busca montada (reais e pt-BR garantidos); o fornecedor só empresta o preço em BRL.
  const resto = lista.filter((l) => !daCia.includes(l));
  const confiaveis: SiteDeCompra[] = linksConfiaveis(viagem).map(({ site, url }) => {
    const precos = resto.filter((l) => !ehCompanhia(l) && confiavelDoLink(l)?.id === site.id).map(emReais).filter((p): p is number => p !== null);
    return { nome: site.nome, url, tipo: "confiavel", vooExato: false, montado: true, precoCentavos: precos.length ? Math.min(...precos) : null };
  });

  const outros: SiteDeCompra[] = [];
  if (MOSTRAR_SITES_MENOS_CONHECIDOS) {
    const vistos = new Set<string>([companhia?.url ?? "", ...confiaveis.map((c) => c.url)]);
    const naoConfiaveis = resto.filter((l) => ehCompanhia(l) || !confiavelDoLink(l));
    // Outras companhias primeiro; agências depois, na ordem do fornecedor.
    for (const l of [...naoConfiaveis.filter(ehCompanhia), ...naoConfiaveis.filter((l) => !ehCompanhia(l))]) {
      const agencia = !ehCompanhia(l);
      const url = agencia ? urlEmReais(l.url) : l.url;
      if (vistos.has(url)) continue;
      vistos.add(url);
      const outraCia = ciaDoLink(l);
      outros.push({
        nome: !agencia && outraCia ? NOME_DA_CIA[outraCia] : (l.nome || "Site de compra"),
        url, tipo: agencia ? "agencia" : "companhia", vooExato: l.vooExato, montado: false, precoCentavos: emReais(l),
      });
    }
  }
  return { companhia, confiaveis, outros };
}
