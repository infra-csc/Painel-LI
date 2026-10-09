/**
 * Fornecedor SIMULADO (09/10) — demo e testes, nunca produção.
 *
 * Determinístico: a mesma rota e data devolvem sempre os mesmos voos (sem
 * rede, sem chave). Respeita os filtros do pedido como o fornecedor real
 * (conexões, janela de partida/chegada), então os estados da tela — sem
 * resultados, voo absurdo, volta noturna com +1 diária — aparecem de verdade.
 * A tela mostra "Preços simulados" sempre que é ele quem responde.
 */
import type { ConsultaDePassagens, FiltroDeHorario, ItinerarioDeVoo, PernaDeVoo, ResultadoDaConsulta } from "@shared/busca-de-passagens";
import type { FornecedorDePassagens, LinkDeCompra } from "./fornecedor";

const SITES: Record<string, string> = {
  LA: "https://www.latamairlines.com/br/pt",
  G3: "https://www.voegol.com.br",
  AD: "https://www.voeazul.com.br",
};
const HUBS = ["BSB", "GRU", "CNF", "VCP", "REC", "GIG"];
const CIAS = ["LA", "G3", "AD"];

/** PRNG mulberry32 sobre um hash do texto. */
function aleatorio(semente: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
function horario(dia: string, minutos: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCMinutes(minutos);
  return `${d.toISOString().slice(0, 10)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Voos de um dia numa rota (sempre os mesmos). */
function voosDoDia(origem: string, destino: string, dia: string): Array<PernaDeVoo & { base: number }> {
  const r = aleatorio(`${origem}>${destino}|${dia}`);
  const tempoDireto = 70 + Math.floor(r() * 170);
  const out: Array<PernaDeVoo & { base: number }> = [];
  for (let i = 0; i < 14; i++) {
    const cia = CIAS[Math.floor(r() * CIAS.length)];
    const partida = (5 * 60) + Math.floor(r() * 17 * 60 / 5) * 5;
    const tipo = i < 6 ? 0 : i < 12 ? 1 : 2; // diretos, 1 conexão, 2 conexões
    const segmentos: PernaDeVoo["segmentos"] = [];
    let t = partida;
    const paradas = tipo === 0 ? [] : HUBS.filter((h) => h !== origem && h !== destino).slice(i % 3, i % 3 + tipo);
    const pontos = [origem, ...paradas, destino];
    for (let s = 0; s < pontos.length - 1; s++) {
      const dur = Math.round(tempoDireto * (tipo === 0 ? 1 : 0.65 + r() * 0.3));
      const num = String(1000 + Math.floor(r() * 8999));
      segmentos.push({ companhia: cia, numero: num, operadaPor: null, origem: pontos[s], destino: pontos[s + 1], partida: horario(dia, t), chegada: horario(dia, t + dur), duracaoMin: dur });
      t += dur;
      if (s < pontos.length - 2) t += i === 11 ? 9 * 60 + 15 : 50 + Math.floor(r() * 160); // uma conexão bem longa
    }
    const base = Math.round((280 + r() * 1300 + (tipo === 0 ? 180 : 0) - tipo * 60) * 100) / 100;
    out.push({ companhia: cia, duracaoMin: t - partida, segmentos, base });
  }
  return out;
}

const hora = (iso: string) => Number(iso.slice(11, 13));
function passaNoFiltro(p: PernaDeVoo, f: FiltroDeHorario | null, maxParadas: number): boolean {
  if (p.segmentos.length - 1 > maxParadas) return false;
  if (!f) return true;
  const dep = hora(p.segmentos[0].partida);
  const ultima = p.segmentos[p.segmentos.length - 1];
  const chegaNoOutroDia = ultima.chegada.slice(0, 10) > p.segmentos[0].partida.slice(0, 10);
  const arr = chegaNoOutroDia ? 24 + hora(ultima.chegada) : hora(ultima.chegada);
  if (f.partidaDe !== undefined && dep < f.partidaDe) return false;
  if (f.partidaAte !== undefined && dep > f.partidaAte) return false;
  if (f.chegadaDe !== undefined && arr < f.chegadaDe) return false;
  if (f.chegadaAte !== undefined && arr > f.chegadaAte) return false;
  return true;
}

const semBase = ({ base: _b, ...p }: PernaDeVoo & { base: number }): PernaDeVoo => p;
const id = (cia: string, partes: string[]) => `sim-${cia}-${Math.floor(aleatorio(partes.join("|"))() * 1e12).toString(36)}`;

export function buscarSimulado(c: ConsultaDePassagens): ResultadoDaConsulta {
  const idas = voosDoDia(c.origem, c.destino, c.dataIda).filter((p) => passaNoFiltro(p, c.horarioIda, c.maxParadas));
  if (c.perna !== "ida_e_volta" || !c.dataVolta) {
    return {
      itinerarios: idas.map((p): ItinerarioDeVoo => ({
        id: id(p.companhia, [c.origem, c.destino, c.dataIda, p.segmentos.map((s) => s.numero).join("+")]),
        precoCentavos: Math.round(p.base * 100), moeda: "BRL", pernas: [semBase(p)],
        bagagem: { mao: 1, despachada: p.companhia === "AD" ? 1 : 0 },
      })),
      observadoEm: new Date().toISOString(),
    };
  }
  const voltas = voosDoDia(c.destino, c.origem, c.dataVolta).filter((p) => passaNoFiltro(p, c.horarioVolta, c.maxParadas));
  const itinerarios: ItinerarioDeVoo[] = [];
  idas.forEach((ida, i) => {
    // Cada ida combina com até 2 voltas da MESMA companhia (como a tarifa ida e volta).
    voltas.filter((v) => v.companhia === ida.companhia).slice(i % 2, (i % 2) + 2).forEach((volta) => {
      itinerarios.push({
        id: id(ida.companhia, [c.origem, c.destino, c.dataIda, c.dataVolta!, ida.segmentos[0].numero, volta.segmentos[0].numero]),
        precoCentavos: Math.round((ida.base + volta.base) * 0.93 * 100), moeda: "BRL",
        pernas: [semBase(ida), semBase(volta)],
        bagagem: { mao: 1, despachada: ida.companhia === "AD" ? 1 : 0 },
      });
    });
  });
  return { itinerarios, observadoEm: new Date().toISOString() };
}

export function criarSimulado(): FornecedorDePassagens {
  return {
    nome: "simulado",
    simulado: true,
    async buscar(c) {
      return buscarSimulado(c);
    },
    async linksDeCompra(itinerarioId): Promise<LinkDeCompra[]> {
      const cia = /^sim-(LA|G3|AD)-/.exec(itinerarioId)?.[1] ?? "LA";
      return [{ nome: cia === "LA" ? "LATAM" : cia === "G3" ? "GOL" : "Azul", url: SITES[cia], tipo: "airline", vooExato: false, precoCentavos: null }];
    },
  };
}
