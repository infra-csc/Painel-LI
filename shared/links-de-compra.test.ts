import { describe, expect, it } from "vitest";
import {
  SITES_CONFIAVEIS, ciaComSite, ciaDoLink, confiavelDoLink, linkDaCompanhia, linksConfiaveis, sitesDeCompra, urlEmReais, viagemDoItinerario,
  type LinkDeCompra, type ViagemDoLink,
} from "./links-de-compra";

const GRU_BEL: ViagemDoLink = { cia: "LA", origem: "GRU", destino: "BEL", ida: "2026-11-12", volta: "2026-11-15" };
const L = (l: Partial<LinkDeCompra> & Pick<LinkDeCompra, "nome" | "url">): LinkDeCompra => ({ tipo: null, vooExato: false, precoCentavos: null, moeda: null, ...l });
const KIWI = L({ nome: "Kiwi.com", url: "https://www.kiwi.com/en/booking?token=abc&currency=EUR&lang=en", tipo: "third_party", vooExato: true, precoCentavos: 61974, moeda: "EUR" });

describe("linkDaCompanhia — busca no site oficial (português, reais, 1 adulto)", () => {
  it("LATAM: /br/pt, datas ao meio-dia UTC, ida e volta e só ida", () => {
    expect(linkDaCompanhia("LA", "GRU", "BEL", "2026-11-12", "2026-11-15")).toBe(
      "https://www.latamairlines.com/br/pt/oferta-voos?origin=GRU&outbound=2026-11-12T12%3A00%3A00.000Z&destination=BEL"
      + "&inbound=2026-11-15T12%3A00%3A00.000Z&adt=1&chd=0&inf=0&trip=RT&cabin=Economy&redemption=false&sort=RECOMMENDED",
    );
    const so = linkDaCompanhia("LA", "BEL", "GRU", "2026-11-15", null)!;
    expect(so).toContain("inbound=null");
    expect(so).toContain("trip=OW");
  });

  it("JJ é LATAM", () => {
    expect(linkDaCompanhia("JJ", "GRU", "BEL", "2026-11-12", null)).toMatch(/^https:\/\/www\.latamairlines\.com\/br\/pt\//);
  });

  it("GOL: ponto de venda BR, datas DD-MM-AAAA, DF (ida e volta) ou SO (só ida)", () => {
    expect(linkDaCompanhia("G3", "GRU", "BEL", "2026-11-12", "2026-11-15")).toBe(
      "https://b2c.voegol.com.br/compra/busca-parceiros?pv=br&tipo=DF&de=GRU&para=BEL&ida=12-11-2026&volta=15-11-2026&ADT=1&ADL=0&CHD=0&INF=0",
    );
    expect(linkDaCompanhia("G3", "BEL", "GRU", "2026-11-15", null)).toBe(
      "https://b2c.voegol.com.br/compra/busca-parceiros?pv=br&tipo=SO&de=BEL&para=GRU&ida=15-11-2026&ADT=1&ADL=0&CHD=0&INF=0",
    );
  });

  it("Azul: /br/pt, datas MM/DD/AAAA, um trecho por perna, moeda BRL", () => {
    expect(linkDaCompanhia("AD", "VCP", "BEL", "2026-11-12", "2026-11-15")).toBe(
      "https://www.voeazul.com.br/br/pt/home/selecao-voo?c[0].ds=VCP&c[0].std=11/12/2026&c[0].as=BEL"
      + "&c[1].ds=BEL&c[1].std=11/15/2026&c[1].as=VCP&p[0].t=ADT&p[0].c=1&p[0].cp=false&f.dl=3&f.dr=3&cc=BRL",
    );
    const so = linkDaCompanhia("AD", "VCP", "BEL", "2026-11-12", null)!;
    expect(so).not.toContain("c[1]");
    expect(so).toContain("cc=BRL");
  });

  it("dado inválido não monta link", () => {
    expect(linkDaCompanhia("TP", "GRU", "BEL", "2026-11-12", null)).toBeNull();
    expect(linkDaCompanhia("LA", "GR", "BEL", "2026-11-12", null)).toBeNull();
    expect(linkDaCompanhia("LA", "GRU", "GRU", "2026-11-12", null)).toBeNull();
    expect(linkDaCompanhia("LA", "GRU", "BEL", "12/11/2026", null)).toBeNull();
    expect(linkDaCompanhia("LA", "GRU", "BEL", "2026-11-12", "2026-11-10")).toBeNull();
  });

  it("ciaComSite: só as três (JJ → LA)", () => {
    expect(["LA", "JJ", "G3", "AD", "TP", "", null].map(ciaComSite)).toEqual(["LA", "LA", "G3", "AD", null, null, null]);
  });
});

describe("ciaDoLink — site da companhia pelo domínio, ou pelo nome quando o fornecedor diz que é companhia", () => {
  it("domínio oficial", () => {
    expect(ciaDoLink(L({ nome: "x", url: "https://www.latamairlines.com/br/pt/x" }))).toBe("LA");
    expect(ciaDoLink(L({ nome: "x", url: "https://b2c.voegol.com.br/compra" }))).toBe("G3");
    expect(ciaDoLink(L({ nome: "x", url: "https://www.voeazul.com.br/" }))).toBe("AD");
  });
  it("nome só vale com tipo airline (\"Azul Viagens\" agência não é a Azul)", () => {
    expect(ciaDoLink(L({ nome: "LATAM Airlines", url: "https://booking.example.com/x", tipo: "airline" }))).toBe("LA");
    expect(ciaDoLink(L({ nome: "Azul Viagens", url: "https://www.azulviagens.com.br/x", tipo: "third_party" }))).toBeNull();
    expect(ciaDoLink(KIWI)).toBeNull();
  });
});

describe("urlEmReais — agência em reais e português", () => {
  it("Kiwi: currency=BRL, lang=br e caminho /br/", () => {
    const u = new URL(urlEmReais(KIWI.url));
    expect(u.pathname).toBe("/br/booking");
    expect(u.searchParams.get("currency")).toBe("BRL");
    expect(u.searchParams.get("lang")).toBe("br");
    expect(u.searchParams.get("token")).toBe("abc");
  });
  it("Kiwi /deep (sem idioma no caminho) mantém o caminho", () => {
    const u = new URL(urlEmReais("https://www.kiwi.com/deep?from=GRU&to=BEL&currency=EUR"));
    expect(u.pathname).toBe("/deep");
    expect(u.searchParams.get("currency")).toBe("BRL");
  });
  it("outras agências e URL inválida ficam como vieram", () => {
    expect(urlEmReais("https://www.decolar.com/x?moeda=BRL")).toBe("https://www.decolar.com/x?moeda=BRL");
    expect(urlEmReais("não é url")).toBe("não é url");
  });
});

describe("sitesDeCompra — o botão abre a companhia; agência vai para \"Outros sites\"", () => {
  it("o caso do dono: só Kiwi em euro → botão monta a LATAM; Kiwi em reais, como agência, sem o preço em euro", () => {
    const r = sitesDeCompra([KIWI], GRU_BEL);
    expect(r.companhia).toMatchObject({ nome: "LATAM", tipo: "companhia", montado: true, vooExato: false, precoCentavos: null });
    expect(r.companhia!.url).toBe(linkDaCompanhia("LA", "GRU", "BEL", "2026-11-12", "2026-11-15"));
    expect(r.outros).toHaveLength(1);
    expect(r.outros[0]).toMatchObject({ nome: "Kiwi.com", tipo: "agencia", precoCentavos: null });
    expect(r.outros[0].url).toContain("currency=BRL");
  });

  it("prioridade: companhia do voo com voo exato > companhia sem voo exato > link montado", () => {
    const busca = L({ nome: "LATAM", url: "https://www.latamairlines.com/br/pt/busca", tipo: "airline" });
    const exato = L({ nome: "LATAM", url: "https://www.latamairlines.com/br/pt/exato", tipo: "airline", vooExato: true, precoCentavos: 100000, moeda: "BRL" });
    expect(sitesDeCompra([KIWI, busca, exato], GRU_BEL).companhia).toMatchObject({ url: exato.url, vooExato: true, montado: false, precoCentavos: 100000 });
    expect(sitesDeCompra([KIWI, busca], GRU_BEL).companhia).toMatchObject({ url: busca.url, vooExato: false, montado: false });
  });

  it("site de OUTRA companhia não vira o botão; fica em Outros, antes das agências, como companhia", () => {
    const gol = L({ nome: "GOL Linhas Aéreas", url: "https://b2c.voegol.com.br/x", tipo: "airline", vooExato: true });
    const r = sitesDeCompra([KIWI, gol], GRU_BEL);
    expect(r.companhia!.montado).toBe(true);
    expect(r.outros.map((o) => [o.nome, o.tipo])).toEqual([["GOL", "companhia"], ["Kiwi.com", "agencia"]]);
  });

  it("preço do link só em BRL; links do cache sem moeda não mostram preço", () => {
    const real = L({ nome: "MinhaAgencia", url: "https://minha.example/x", tipo: "third_party", precoCentavos: 250000, moeda: "BRL" });
    const semMoeda = L({ nome: "Outra", url: "https://outra.example/x", tipo: "third_party", precoCentavos: 250000, moeda: undefined });
    const r = sitesDeCompra([real, semMoeda], GRU_BEL);
    expect(r.outros.map((o) => o.precoCentavos)).toEqual([250000, null]);
  });

  it("links ainda não pedidos (null): companhia e confiáveis montados, sem outros", () => {
    const r = sitesDeCompra(null, { ...GRU_BEL, cia: "G3" });
    expect(r).toMatchObject({ companhia: { nome: "GOL", montado: true }, outros: [] });
    expect(r.confiaveis.map((c) => c.nome)).toEqual(["Google Voos", "Skyscanner", "Kayak", "Decolar"]);
    expect(r.confiaveis.every((c) => c.tipo === "confiavel" && c.montado && c.precoCentavos === null)).toBe(true);
  });

  it("ordem: companhia → confiáveis → resto; o link do fornecedor de um confiável só empresta o preço em BRL", () => {
    const decolarBrl = L({ nome: "Decolar", url: "https://www.decolar.com/checkout/abc", tipo: "third_party", vooExato: true, precoCentavos: 210000, moeda: "BRL" });
    const decolarMaisCaro = L({ nome: "Decolar", url: "https://www.decolar.com/checkout/def", tipo: "third_party", precoCentavos: 230000, moeda: "BRL" });
    const skyUsd = L({ nome: "Skyscanner", url: "https://www.skyscanner.net/x", tipo: "third_party", precoCentavos: 40000, moeda: "USD" });
    const r = sitesDeCompra([KIWI, decolarBrl, decolarMaisCaro, skyUsd], GRU_BEL);
    expect(r.companhia!.nome).toBe("LATAM");
    const porNome = Object.fromEntries(r.confiaveis.map((c) => [c.nome, c]));
    expect(porNome.Decolar).toMatchObject({ precoCentavos: 210000, montado: true });
    expect(porNome.Decolar.url).toMatch(/^https:\/\/www\.decolar\.com\/shop\/flights\/results\/roundtrip\//);
    expect(porNome.Skyscanner.precoCentavos).toBeNull();
    // Os links do fornecedor dos confiáveis não se repetem no fim; o Kiwi fica lá, como agência.
    expect(r.outros.map((o) => [o.nome, o.tipo])).toEqual([["Kiwi.com", "agencia"]]);
  });

  it("os outros links da mesma companhia não se repetem em Outros; URL repetida aparece uma vez", () => {
    const a = L({ nome: "LATAM", url: "https://www.latamairlines.com/a", tipo: "airline", vooExato: true });
    const b = L({ nome: "LATAM", url: "https://www.latamairlines.com/b", tipo: "airline" });
    const r = sitesDeCompra([a, b, KIWI, { ...KIWI }], GRU_BEL);
    expect(r.companhia!.url).toBe(a.url);
    expect(r.outros.map((o) => o.nome)).toEqual(["Kiwi.com"]);
  });

  it("companhia fora das três: usa o site de companhia que vier; sem nenhum, não há botão", () => {
    const tap = L({ nome: "TAP", url: "https://www.flytap.com/x", tipo: "airline" });
    expect(sitesDeCompra([KIWI, tap], { ...GRU_BEL, cia: "TP" }).companhia).toMatchObject({ nome: "TAP", url: tap.url });
    expect(sitesDeCompra([KIWI], { ...GRU_BEL, cia: "TP" }).companhia).toBeNull();
  });
});

describe("sites confiáveis — busca montada em reais e pt-BR, 1 adulto", () => {
  const rt = Object.fromEntries(linksConfiaveis(GRU_BEL).map(({ site, url }) => [site.id, url]));
  const ow = Object.fromEntries(linksConfiaveis({ origem: "BEL", destino: "GRU", ida: "2026-11-15", volta: null }).map(({ site, url }) => [site.id, url]));

  it("a lista é fixa e na ordem da tela", () => {
    expect(SITES_CONFIAVEIS.map((s) => s.id)).toEqual(["google", "skyscanner", "kayak", "decolar"]);
  });

  it("Google Voos: hl=pt-BR, gl=BR, curr=BRL; ida e volta ou só ida", () => {
    expect(rt.google).toBe("https://www.google.com/travel/flights?q=Flights%20to%20BEL%20from%20GRU%20on%202026-11-12%20through%202026-11-15&hl=pt-BR&gl=BR&curr=BRL");
    expect(ow.google).toContain(encodeURIComponent("Flights to GRU from BEL on 2026-11-15 one way"));
  });

  it("Skyscanner: site .com.br, currency=BRL, locale=pt-BR, market=BR, adultsv2=1", () => {
    expect(rt.skyscanner).toBe("https://www.skyscanner.com.br/transporte/passagens-aereas/gru/bel/261112/261115/?adultsv2=1&cabinclass=economy&rtn=1&currency=BRL&locale=pt-BR&market=BR");
    expect(ow.skyscanner).toBe("https://www.skyscanner.com.br/transporte/passagens-aereas/bel/gru/261115/?adultsv2=1&cabinclass=economy&rtn=0&currency=BRL&locale=pt-BR&market=BR");
  });

  it("Kayak: site .com.br (reais e português), 1adults", () => {
    expect(rt.kayak).toBe("https://www.kayak.com.br/flights/GRU-BEL/2026-11-12/2026-11-15/1adults?sort=bestflight_a");
    expect(ow.kayak).toBe("https://www.kayak.com.br/flights/BEL-GRU/2026-11-15/1adults?sort=bestflight_a");
  });

  it("Decolar: decolar.com (Brasil), 1 adulto 0 criança 0 bebê", () => {
    expect(rt.decolar).toBe("https://www.decolar.com/shop/flights/results/roundtrip/GRU/BEL/2026-11-12/2026-11-15/1/0/0");
    expect(ow.decolar).toBe("https://www.decolar.com/shop/flights/results/oneway/BEL/GRU/2026-11-15/1/0/0");
  });

  it("todo link montado (companhias e confiáveis) sai em BRL e pt-BR (domínio .br ou parâmetro)", () => {
    const companhias = (["LA", "G3", "AD"] as const).map((c) => linkDaCompanhia(c, "GRU", "BEL", "2026-11-12", "2026-11-15")!);
    for (const url of [...companhias, ...Object.values(rt), ...Object.values(ow)]) {
      const u = new URL(url);
      const ptBr = /\.com\.br$/.test(u.hostname) || /\/br\/pt\//.test(u.pathname) || u.searchParams.get("hl") === "pt-BR" || u.hostname === "www.decolar.com";
      const brl = /\.com\.br$/.test(u.hostname) || u.searchParams.get("curr") === "BRL" || u.searchParams.get("cc") === "BRL" || /\/br\/pt\//.test(u.pathname) || u.hostname === "www.decolar.com";
      expect([url, ptBr && brl]).toEqual([url, true]);
    }
  });

  it("dado inválido: nenhum confiável", () => {
    expect(linksConfiaveis(null)).toEqual([]);
    expect(linksConfiaveis({ origem: "GRU", destino: "GRU", ida: "2026-11-12", volta: null })).toEqual([]);
    expect(linksConfiaveis({ origem: "GRU", destino: "BEL", ida: "2026-11-12", volta: "2026-11-01" })).toEqual([]);
  });

  it("confiavelDoLink reconhece pelo domínio ou pelo nome", () => {
    expect(confiavelDoLink(L({ nome: "x", url: "https://www.kayak.com/y" }))?.id).toBe("kayak");
    expect(confiavelDoLink(L({ nome: "Decolar.com", url: "https://track.example/r" }))?.id).toBe("decolar");
    expect(confiavelDoLink(KIWI)).toBeNull();
  });
});

describe("viagemDoItinerario — do próprio voo (vale para data vizinha e outro aeroporto)", () => {
  const seg = (companhia: string, origem: string, destino: string, partida: string) => ({ companhia, numero: "1", origem, destino, partida, chegada: partida });
  it("ida e volta com conexão", () => {
    expect(viagemDoItinerario({
      pernas: [
        { companhia: "LA", duracaoMin: 300, segmentos: [seg("LA", "GRU", "BSB", "2026-11-12T08:00"), seg("LA", "BSB", "BEL", "2026-11-12T11:00")] },
        { companhia: "LA", duracaoMin: 200, segmentos: [seg("LA", "BEL", "GRU", "2026-11-15T20:00")] },
      ],
    })).toEqual(GRU_BEL);
  });
  it("só ida; sem pernas → null", () => {
    expect(viagemDoItinerario({ pernas: [{ companhia: "G3", duracaoMin: 1, segmentos: [seg("G3", "BEL", "GRU", "2026-11-15T03:25")] }] }))
      .toEqual({ cia: "G3", origem: "BEL", destino: "GRU", ida: "2026-11-15", volta: null });
    expect(viagemDoItinerario({ pernas: [] })).toBeNull();
  });
});
