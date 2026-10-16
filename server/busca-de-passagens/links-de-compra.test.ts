import { afterEach, describe, expect, it, vi } from "vitest";
import { corpoDosLinksIgnav, criarIgnav, normalizarLinksIgnav } from "./ignav";
import { buscarSimulado, linksSimulados } from "./simulado";
import { sitesDeCompra, viagemDoItinerario } from "@shared/links-de-compra";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Ignav — links de compra (16/10)", () => {
  it("pede no mercado BR (o padrão do Ignav é US) e nada além do id", () => {
    expect(corpoDosLinksIgnav("abc")).toEqual({ ignav_id: "abc", market: "BR" });
  });

  it("guarda a moeda do preço de cada link; amount 0 (não verificado) não é preço", () => {
    const links = normalizarLinksIgnav({
      booking_options: [{
        legs: ["outbound", "inbound"],
        links: [
          { provider_name: "LATAM", provider_type: "airline", specificity: "exact_flight", url: "https://www.latamairlines.com/x", price: { amount: 1234.5, currency: "brl", status: "verified" } },
          { provider_name: "Kiwi.com", provider_type: "third_party", url: "https://www.kiwi.com/en/booking?x=1", price: { amount: 619.74, currency: "EUR", status: "verified" } },
          { provider_name: "Manual", url: "https://manual.example/x", price: { amount: 0, currency: "USD", status: "unverified" } },
          { provider_name: "Ruim", url: "javascript:alert(1)" },
        ],
      }],
    });
    expect(links).toEqual([
      { nome: "LATAM", url: "https://www.latamairlines.com/x", tipo: "airline", vooExato: true, precoCentavos: 123450, moeda: "BRL" },
      { nome: "Kiwi.com", url: "https://www.kiwi.com/en/booking?x=1", tipo: "third_party", vooExato: false, precoCentavos: 61974, moeda: "EUR" },
      { nome: "Manual", url: "https://manual.example/x", tipo: null, vooExato: false, precoCentavos: null, moeda: "USD" },
    ]);
  });

  it("se o Ignav recusar o market junto do id (400), repete só com o id", async () => {
    const corpos: unknown[] = [];
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(String(init.body)));
      if (corpos.length === 1) return new Response(JSON.stringify({ error: { code: "invalid_request" } }), { status: 400 });
      return new Response(JSON.stringify({ booking_options: [{ links: [{ provider_name: "GOL", provider_type: "airline", url: "https://b2c.voegol.com.br/x" }] }] }), { status: 200 });
    }));
    const links = await criarIgnav("chave-de-teste").linksDeCompra("id-1");
    expect(corpos).toEqual([{ ignav_id: "id-1", market: "BR" }, { ignav_id: "id-1" }]);
    expect(links.map((l) => l.nome)).toEqual(["GOL"]);
  });

  it("outro erro (limite, chave) não repete", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const f = vi.fn(async () => new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", f);
    await expect(criarIgnav("chave-de-teste").linksDeCompra("id-1")).rejects.toMatchObject({ codigo: "limite_do_fornecedor" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("Simulado — um link de companhia e um de agência (demo)", () => {
  const consulta = { perna: "ida_e_volta" as const, origem: "GRU", destino: "BEL", dataIda: "2027-03-10", dataVolta: "2027-03-14", maxParadas: 1, horarioIda: null, horarioVolta: null };
  const itinerarios = buscarSimulado(consulta).itinerarios;

  it("LATAM/GOL: site da companhia (busca da rota) + Kiwi em euro; a tela abre a companhia e põe o Kiwi no fim, em reais", () => {
    const it0 = itinerarios.find((i) => !i.id.startsWith("sim-AD-"))!;
    const links = linksSimulados(it0.id);
    expect(links.map((l) => [l.tipo, l.moeda])).toEqual([["airline", null], ["third_party", "EUR"]]);
    const sites = sitesDeCompra(links, viagemDoItinerario(it0));
    expect(sites.companhia).toMatchObject({ tipo: "companhia", montado: false });
    expect(sites.companhia!.url).toMatch(/latamairlines\.com\/br\/pt|voegol\.com\.br/);
    expect(sites.outros).toHaveLength(1);
    expect(sites.outros[0]).toMatchObject({ nome: "Kiwi.com", tipo: "agencia", precoCentavos: null });
    expect(sites.outros[0].url).toContain("currency=BRL");
  });

  it("Azul: só a agência — o app monta a busca no site da Azul", () => {
    const azul = ["BEL", "JPA", "REC", "POA", "FOR", "SSA", "CWB"]
      .flatMap((destino) => buscarSimulado({ ...consulta, destino }).itinerarios)
      .find((i) => i.id.startsWith("sim-AD-"));
    expect(azul).toBeTruthy();
    if (!azul) return;
    const sites = sitesDeCompra(linksSimulados(azul.id), viagemDoItinerario(azul));
    expect(sites.companhia).toMatchObject({ nome: "Azul", montado: true });
    expect(sites.companhia!.url).toContain("voeazul.com.br/br/pt/");
  });

  it("id antigo (sem a rota): continua devolvendo o site da companhia", () => {
    expect(linksSimulados("sim-G3-abc123")).toEqual([{ nome: "GOL", url: "https://www.voegol.com.br", tipo: "airline", vooExato: false, precoCentavos: null, moeda: null }]);
  });
});
