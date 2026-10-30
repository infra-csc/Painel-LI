/**
 * Painel de hospedagem — "Comparação de hotéis": room nights, pessoa-noites,
 * custo por room night e mistura de apartamentos, por hotel, evento ou tipo.
 * A conta (e as definições) moram em room-nights.ts.
 */
import { useState } from "react";
import { Link } from "wouter";
import { FiltroDeLista } from "@/components/common/filter-popover";
import { Barra, Painel, Segmentado } from "@/components/tickets/analises/partes";
import { largura, moeda } from "@/components/tickets/analises/formato";
import { rotuloDaDataDoEvento } from "@/components/scaling/scaling-analytics-data";
import { plural } from "../passagens/pecas-dos-paineis";
import { PERIODOS_DO_PRECO, type PeriodoDoPreco } from "../passagens/comparacao-de-precos";
import {
  DIMENSOES_DO_HOTEL, numerosDoHotel, textoDeNoites,
  type DimensaoDoHotel, type EstadiaNoHotel, type GrupoDeHotel, type TipoDeApartamento,
} from "./room-nights";

const LIMITE = 10;

const NOME_DA_COLUNA: Record<DimensaoDoHotel, string> = { hotel: "Hotel", evento: "Evento", tipo: "Apartamento" };

/** "Ind 4 · Dup 10" — só os tipos que aparecem. */
function misturaDeTipos(t: Record<TipoDeApartamento, number>): string {
  const curto: Record<TipoDeApartamento, string> = { single: "Ind", double: "Dup", triple: "Tri", "": "sem tipo" };
  return (["single", "double", "triple", ""] as TipoDeApartamento[]).filter((k) => t[k] > 0).map((k) => `${curto[k]} ${t[k]}`).join(" · ");
}

function SubLinha({ g, dimensao }: { g: GrupoDeHotel; dimensao: DimensaoDoHotel }) {
  const partes: string[] = [];
  if (dimensao === "hotel") partes.push(g.outros.length === 1 ? g.outros[0] : plural(g.outros.length, "evento", "eventos"));
  if (dimensao === "evento") {
    if (g.dataEvento) partes.push(rotuloDaDataDoEvento({ dataEvento: g.dataEvento, dataEventoInicio: null }));
    partes.push(g.outros.length === 1 ? g.outros[0] : plural(g.outros.length, "hotel", "hotéis"));
  }
  if (dimensao !== "tipo") partes.push(misturaDeTipos(g.tipos));
  return <span className="block truncate text-2xs text-muted-foreground" title={g.outros.join(", ")}>{partes.filter(Boolean).join(" · ")}</span>;
}

export function ComparacaoDeHoteis({ estadias, grupos, dimensao, onDimensao, periodo, onPeriodo }: {
  estadias: EstadiaNoHotel[];
  grupos: GrupoDeHotel[];
  dimensao: DimensaoDoHotel;
  onDimensao: (d: DimensaoDoHotel) => void;
  periodo: PeriodoDoPreco;
  onPeriodo: (p: PeriodoDoPreco) => void;
}) {
  const [todos, setTodos] = useState(false);
  const total = numerosDoHotel(estadias);
  const visiveis = todos ? grupos : grupos.slice(0, LIMITE);
  const maior = Math.max(0, ...grupos.map((g) => g.roomNights));
  const primeiro = grupos[0];

  return (
    <Painel
      testid="comparacao-de-hoteis"
      titulo="Comparação de hotéis"
      pergunta="Room nights, pessoa-noites e custo por hotel, evento e tipo de apartamento"
      acao={<Segmentado rotulo="Comparar por" valor={dimensao} onChange={onDimensao} opcoes={DIMENSOES_DO_HOTEL} testid="hoteis-dimensao" />}
      resposta={
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 sm:w-[244px]">
              <FiltroDeLista valor={periodo} onChange={(v) => onPeriodo(v as PeriodoDoPreco)} opcoes={PERIODOS_DO_PRECO} testid="hoteis-periodo" larguraPopover={252} />
            </div>
            <p className="col-span-2 m-0 text-2xs text-muted-foreground sm:ml-auto" data-testid="hoteis-totais">
              {textoDeNoites(total.roomNights)} room nights · {textoDeNoites(total.pessoaNoites)} pessoa-noites · {moeda(total.porRoomNight)} por room night
            </p>
          </div>
          {primeiro ? (
            <p className="m-0">
              {dimensao === "tipo" ? (
                <><strong className="font-semibold text-foreground">{primeiro.nome}</strong>: {textoDeNoites(primeiro.roomNights)} room nights de {plural(primeiro.hospedagens, "hospedagem", "hospedagens")}.</>
              ) : (
                <>
                  <strong className="font-semibold text-foreground">{primeiro.nome}</strong> {dimensao === "hotel" ? "é o hotel com mais room nights" : "é o evento com mais room nights"}:{" "}
                  <span className="tabular-nums">{textoDeNoites(primeiro.roomNights)}</span>
                  {primeiro.porRoomNight !== null && <>, <span className="tabular-nums">{moeda(primeiro.porRoomNight)}</span> por room night</>}.
                </>
              )}
            </p>
          ) : (
            <p className="m-0 text-muted-foreground">Nenhuma hospedagem registrada neste recorte.</p>
          )}
        </div>
      }
      rodape={
        <>
          Room night = um quarto ocupado por uma noite; pessoa-noite = uma pessoa por uma noite (um Duplo com 2 pessoas por 3 noites = 3 room nights e 6 pessoa-noites).
          Noites = diárias da hospedagem (ou check-out − check-in); room nights = noites ÷ ocupantes do apartamento — estimativa quando quem divide o quarto tem datas diferentes.
          Só hospedagens com hotel e não canceladas; período pelo dia do evento.
          {total.semNoites > 0 && <> {plural(total.semNoites, "hospedagem sem noites fica", "hospedagens sem noites ficam")} fora das somas.</>}
          {total.semCusto > 0 && <> {plural(total.semCusto, "sem valor fica", "sem valor ficam")} fora do custo médio.</>}
        </>
      }
    >
      {grupos.length > 0 && (
        <>
          <table className="w-full border-collapse text-[13px]" data-testid={`hoteis-tabela-${dimensao}`}>
            <thead>
              <tr className="text-left text-2xs font-medium text-muted-foreground">
                <th scope="col" className="w-[52%] pb-1.5 pr-3 font-medium sm:w-[38%]">{NOME_DA_COLUNA[dimensao]}</th>
                <th scope="col" className="hidden pb-1.5 pr-3 text-right font-medium md:table-cell">Pessoas</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Room nights</th>
                <th scope="col" className="hidden pb-1.5 pr-3 text-right font-medium sm:table-cell">Pessoa-noites</th>
                <th scope="col" className="pb-1.5 pr-3 text-right font-medium">Por room night</th>
                <th scope="col" className="hidden pb-1.5 text-right font-medium lg:table-cell">Total</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => {
                const nome = (
                  <span className="block truncate font-medium text-foreground" title={g.nome}>{dimensao === "hotel" && !g.nome ? "Hotel sem nome" : g.nome}</span>
                );
                return (
                  <tr key={g.chave || "vazio"} className="border-t border-border align-top" data-testid={`hoteis-${dimensao}-${g.chave || "vazio"}`}>
                    <td className="max-w-0 py-2 pr-3">
                      {dimensao === "evento" ? (
                        <Link href={`/operational-mirror?eventId=${encodeURIComponent(g.chave)}`} className="block hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Abrir ${g.nome} no Espelho`}>
                          {nome}
                        </Link>
                      ) : nome}
                      <SubLinha g={g} dimensao={dimensao} />
                      <Barra className="mt-1.5 h-1.5" pct={largura(g.roomNights, maior)} />
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-600 md:table-cell">{g.hospedagens.toLocaleString("pt-BR")}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums text-foreground">
                      {textoDeNoites(g.roomNights)}
                      <span className="block text-2xs font-normal text-muted-foreground sm:hidden">{textoDeNoites(g.pessoaNoites)} pessoa-noites</span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-600 sm:table-cell">{textoDeNoites(g.pessoaNoites)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-foreground">
                      {moeda(g.porRoomNight)}
                      <span className="block text-2xs text-muted-foreground">{g.porPessoaNoite !== null ? `${moeda(g.porPessoaNoite)}/pessoa` : ""}</span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2 text-right tabular-nums text-foreground lg:table-cell">{moeda(g.custo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {grupos.length > LIMITE && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="mt-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={todos}
              data-testid="hoteis-todos"
            >
              {todos ? `Mostrar só ${LIMITE}` : `Mostrar ${plural(grupos.length, dimensao === "hotel" ? "hotel" : dimensao === "evento" ? "evento" : "tipo", dimensao === "hotel" ? "hotéis" : dimensao === "evento" ? "eventos" : "tipos")}`}
            </button>
          )}
        </>
      )}
    </Painel>
  );
}

