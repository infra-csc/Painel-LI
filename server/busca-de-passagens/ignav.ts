/**
 * Ignav (https://ignav.com/docs) — preços verificados em BRL, mesma fonte do
 * Google Flights. Escolhido pelo dono em 09/10. Plano: 1.000 consultas
 * grátis, depois US$ 2 a cada mil.
 *
 *  - POST /api/fares/one-way      — uma perna (ida, volta ou trecho direto);
 *  - POST /api/fares/round-trip   — ida e volta numa consulta só;
 *  - POST /api/fares/booking-links — links de compra de um itinerário (só no clique).
 *
 * Autenticação: header `X-Api-Key` com a chave do Secret IGNAV_API_KEY.
 * NUNCA logar a chave nem a resposta: só status e código do erro.
 */
import {
  CIAS_DA_BUSCA,
  type ConsultaDePassagens,
  type FiltroDeHorario,
  type ItinerarioDeVoo,
  type PernaDeVoo,
  type ResultadoDaConsulta,
} from "@shared/busca-de-passagens";
import { ErroDoFornecedor, urlSegura, type FornecedorDePassagens, type LinkDeCompra } from "./fornecedor";

const BASE = "https://ignav.com/api";
const TEMPO_LIMITE_MS = 25_000;

interface FaixaIgnav { earliest_hour?: number; latest_hour?: number; arrival_earliest_hour?: number; arrival_latest_hour?: number }

function faixaIgnav(f: FiltroDeHorario | null): FaixaIgnav | undefined {
  if (!f) return undefined;
  const out: FaixaIgnav = {};
  if (f.partidaDe !== undefined) out.earliest_hour = f.partidaDe;
  if (f.partidaAte !== undefined) out.latest_hour = f.partidaAte;
  if (f.chegadaDe !== undefined) out.arrival_earliest_hour = f.chegadaDe;
  if (f.chegadaAte !== undefined) out.arrival_latest_hour = f.chegadaAte;
  return Object.keys(out).length ? out : undefined;
}

/** Corpo do pedido — exportado para o teste conferir que nada pessoal vai junto. */
export function corpoDaConsultaIgnav(c: ConsultaDePassagens): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    origin: c.origem,
    destination: c.destino,
    departure_date: c.dataIda,
    adults: 1,
    market: "BR",
    max_stops: c.maxParadas,
    airlines_include: [...CIAS_DA_BUSCA],
  };
  const ida = faixaIgnav(c.horarioIda);
  if (ida) corpo.departure_time_range = ida;
  if (c.perna === "ida_e_volta") {
    corpo.return_date = c.dataVolta;
    const volta = faixaIgnav(c.horarioVolta);
    if (volta) corpo.return_time_range = volta;
  }
  return corpo;
}

// ── Resposta → tipos normalizados ──────────────────────────────────────────

type Bruto = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** "2026-11-12T08:15:00-03:00" → "2026-11-12T08:15" (hora local do aeroporto, sem fuso). */
const horaLocal = (v: unknown) => texto(v).slice(0, 16);

function perna(bruta: unknown): PernaDeVoo | null {
  if (!bruta || typeof bruta !== "object") return null;
  const p = bruta as Bruto;
  const segs = Array.isArray(p.segments) ? (p.segments as Bruto[]) : [];
  if (segs.length === 0) return null;
  return {
    companhia: texto(p.carrier) || texto(segs[0].marketing_carrier_code),
    duracaoMin: numero(p.duration_minutes),
    segmentos: segs.map((s) => ({
      companhia: texto(s.marketing_carrier_code),
      numero: String(s.flight_number ?? ""),
      operadaPor: texto(s.operating_carrier_name) || null,
      origem: texto(s.departure_airport),
      destino: texto(s.arrival_airport),
      partida: horaLocal(s.departure_time_local),
      chegada: horaLocal(s.arrival_time_local),
      duracaoMin: numero(s.duration_minutes),
    })),
  };
}

export function normalizarRespostaIgnav(json: unknown, idaEVolta: boolean): ResultadoDaConsulta {
  const j = (json && typeof json === "object" ? json : {}) as Bruto;
  const lista = Array.isArray(j.itineraries) ? (j.itineraries as Bruto[]) : [];
  const itinerarios: ItinerarioDeVoo[] = [];
  for (const it of lista) {
    const preco = (it.price ?? {}) as Bruto;
    const valor = numero(preco.amount);
    const ida = perna(it.outbound);
    const volta = idaEVolta ? perna(it.inbound) : null;
    if (valor === null || !ida || (idaEVolta && !volta) || typeof it.ignav_id !== "string") continue;
    const bags = (it.bags ?? null) as Bruto | null;
    itinerarios.push({
      id: it.ignav_id,
      precoCentavos: Math.round(valor * 100),
      moeda: texto(preco.currency) || "BRL",
      pernas: volta ? [ida, volta] : [ida],
      bagagem: bags ? { mao: numero(bags.carry_on), despachada: numero(bags.checked) } : null,
      trocaDeCompanhia: it.requires_self_transfer === true,
    });
  }
  return { itinerarios, observadoEm: typeof j.observed_at === "string" ? j.observed_at : null };
}

// ── Chamada ────────────────────────────────────────────────────────────────

async function postar(chave: string, caminho: string, corpo: unknown): Promise<unknown> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": chave },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } catch (e) {
    const tempo = e instanceof Error && e.name === "AbortError";
    console.warn(`[busca-de-passagens] ignav ${caminho}: ${tempo ? "tempo esgotado" : "falha de rede"}`);
    throw new ErroDoFornecedor("indisponivel", tempo ? "O fornecedor demorou demais para responder." : "Não foi possível falar com o fornecedor de preços.");
  } finally {
    clearTimeout(relogio);
  }
  if (r.ok) return r.json();
  // Só o código do erro vai para o log — nunca o corpo do pedido nem a chave.
  const erro = ((await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null)?.error;
  const codigo = erro?.code ?? "";
  console.warn(`[busca-de-passagens] ignav ${caminho}: HTTP ${r.status}${codigo ? ` (${codigo})` : ""}`);
  if (r.status === 402 || r.status === 429) {
    throw new ErroDoFornecedor("limite_do_fornecedor", "O plano do fornecedor de preços chegou ao limite (crédito ou gasto do mês). Fale com o administrador.", codigo);
  }
  if (r.status === 401 || r.status === 403) throw new ErroDoFornecedor("chave_invalida", "A chave do fornecedor de preços foi recusada. O administrador precisa conferir o Secret IGNAV_API_KEY.", codigo);
  if (r.status === 404) throw new ErroDoFornecedor("nao_encontrado", "O fornecedor não encontrou este voo (o preço pode ter mudado). Atualize a busca.", codigo);
  if (r.status === 400) throw new ErroDoFornecedor("pedido_recusado", `O fornecedor recusou a consulta${codigo ? ` (${codigo})` : ""}.`, codigo);
  throw new ErroDoFornecedor("indisponivel", "O fornecedor de preços está indisponível agora. Tente de novo em alguns minutos.", codigo);
}

export function criarIgnav(chave: string): FornecedorDePassagens {
  return {
    nome: "ignav",
    simulado: false,
    async buscar(c) {
      const idaEVolta = c.perna === "ida_e_volta";
      try {
        const json = await postar(chave, idaEVolta ? "/fares/round-trip" : "/fares/one-way", corpoDaConsultaIgnav(c));
        return normalizarRespostaIgnav(json, idaEVolta);
      } catch (e) {
        // Rota que não existe (route_not_found) é resposta: nenhuma opção.
        if (e instanceof ErroDoFornecedor && e.codigo === "nao_encontrado") return { itinerarios: [], observadoEm: null };
        throw e;
      }
    },
    async linksDeCompra(itinerarioId) {
      const json = (await postar(chave, "/fares/booking-links", { ignav_id: itinerarioId })) as Bruto;
      const opcoes = Array.isArray(json?.booking_options) ? (json.booking_options as Bruto[]) : [];
      const links: LinkDeCompra[] = [];
      for (const o of opcoes) {
        for (const l of Array.isArray(o.links) ? (o.links as Bruto[]) : []) {
          const url = urlSegura(l.url);
          if (!url) continue;
          const preco = numero((l.price as Bruto | undefined)?.amount);
          links.push({
            nome: texto(l.provider_name) || "Site de compra",
            url,
            tipo: texto(l.provider_type) || null,
            vooExato: l.specificity === "exact_flight",
            precoCentavos: preco === null ? null : Math.round(preco * 100),
          });
        }
      }
      return links;
    },
  };
}
