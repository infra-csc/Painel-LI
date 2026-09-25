/**
 * Filtros, ordenação e preferências de layout do espelho (25/09 — extraído da página).
 *
 * Preferências (densidade, blocos escondidos, visão) persistem no localStorage;
 * filtros, flags e ordenação NÃO — eram carregados de um evento para outro e o
 * usuário abria o espelho já filtrado sem perceber. Trocar de evento zera tudo.
 */
import { useState, useEffect, useMemo, useDeferredValue } from "react";
import type { MirrorRow } from "@shared/operational-mirror-types";
import {
  CHIPS_DE_PENDENCIA, ROTULO_DO_BLOCO, blocoEmUso, blocoPendencia, caiNoChip,
  type BlocoDeCusto, type ChipDePendencia,
} from "@shared/mirror-pendencia";
import {
  LS_KEY, SITUACOES, VIEWS, isNarrowViewport,
  type Block, type PendenciaDe, type SituacaoFiltro, type SortKey, type SortState, type ViewKey,
} from "./mirror-shared";

export function useMirrorFilters(eventId: string, rows: MirrorRow[], pendenciaDe: PendenciaDe) {
  const [view, setView] = useState<ViewKey>(() => isNarrowViewport() ? "colaboradores" : "grade");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [searchText, setSearchText] = useState("");
  // A grade tem ~36 colunas por linha: refiltrar e re-renderizar tudo a cada tecla
  // travava a digitação. O campo responde na hora; a grade acompanha logo atrás.
  const deferredSearch = useDeferredValue(searchText);
  const [deptFilter, setDeptFilter] = useState("all");
  const [hotelFilter, setHotelFilter] = useState("all");
  /** Chip da faixa de pendências. */
  const [chip, setChip] = useState<ChipDePendencia | null>(null);
  /** Cartão do placar: mostra só quem falta naquele bloco (ou quem lançou, nos eventuais). */
  const [blocoFiltro, setBlocoFiltro] = useState<BlocoDeCusto | null>(null);
  const [situacoes, setSituacoes] = useState<Set<SituacaoFiltro>>(new Set());
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [hiddenBlocks, setHiddenBlocks] = useState<Set<Block>>(new Set());
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  /**
   * Largura estreita, medida de verdade e acompanhando o resize.
   *
   * `isNarrowViewport()` só era consultado na montagem: quem abria no desktop e
   * estreitava a janela continuava com a grade de 39 colunas rolando de lado.
   */
  const [estreito, setEstreito] = useState(isNarrowViewport);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const aplicar = () => setEstreito(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  // persist prefs (só layout)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.density === "comfortable" || p.density === "compact") setDensity(p.density);
        if (Array.isArray(p.hiddenBlocks)) setHiddenBlocks(new Set(p.hiddenBlocks));
        if (!isNarrowViewport() && VIEWS.some((v) => v.key === p.view)) setView(p.view);
      }
    } catch { /* preferências corrompidas: segue com o padrão */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ density, hiddenBlocks: Array.from(hiddenBlocks), view })); } catch { /* sem localStorage */ }
  }, [density, hiddenBlocks, view]);

  // Trocar de evento zera filtros/flags/ordenação — cada evento começa "limpo".
  useEffect(() => {
    setSearchText(""); setDeptFilter("all"); setHotelFilter("all"); setChip(null); setBlocoFiltro(null); setSituacoes(new Set());
    setSort({ key: null, dir: "asc" }); setCollapsedDepts(new Set());
  }, [eventId]);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (q && !r.collaborator.fullName.toLowerCase().includes(q)) return false;
      const dept = r.function.area || r.function.name || "(sem departamento)";
      if (deptFilter !== "all" && dept !== deptFilter) return false;
      if (hotelFilter !== "all" && r.accommodation?.hotelName !== hotelFilter) return false;
      const { abertos, sugestao, ctx } = pendenciaDe(r);
      if (chip && !caiNoChip(chip, r, ctx)) return false;
      // O cartão do placar: nos blocos que pendenciam, quem está com ele
      // aberto; nos eventuais, quem lançou.
      if (blocoFiltro) {
        if (!blocoEmUso(blocoFiltro, r)) return false;
        if (blocoPendencia(blocoFiltro) && !abertos.includes(blocoFiltro)) return false;
      }
      for (const st of SITUACOES) {
        if (situacoes.has(st.key) && !st.match(abertos.length, sugestao)) return false;
      }
      return true;
    });
    if (sort.key) {
      const get = (r: MirrorRow) => sort.key === "nome" ? r.collaborator.fullName : (r.function.area || r.function.name || "");
      out.sort((a, b) => String(get(a)).localeCompare(String(get(b)), "pt-BR"));
      if (sort.dir === "desc") out.reverse();
    }
    return out;
  }, [rows, deferredSearch, deptFilter, hotelFilter, chip, blocoFiltro, situacoes, sort, pendenciaDe]);
  const activeFilterCount = (searchText ? 1 : 0) + (deptFilter !== "all" ? 1 : 0) + (hotelFilter !== "all" ? 1 : 0) + (chip ? 1 : 0) + (blocoFiltro ? 1 : 0) + situacoes.size;
  function clearFilters() { setSearchText(""); setDeptFilter("all"); setHotelFilter("all"); setChip(null); setBlocoFiltro(null); setSituacoes(new Set()); }
  function toggleSort(key: SortKey) { setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }); }

  /**
   * Os filtros ativos, escritos. É o que faz "nenhum resultado" deixar de ser
   * um beco sem saída: sem dizer o que está filtrando, quem chega numa lista
   * vazia não sabe o que desfazer.
   */
  const filtrosAtivos = useMemo(() => {
    const nomes: string[] = [];
    if (searchText) nomes.push(`busca "${searchText}"`);
    if (deptFilter !== "all") nomes.push(`departamento ${deptFilter}`);
    if (hotelFilter !== "all") nomes.push(`hotel ${hotelFilter}`);
    if (chip) nomes.push(CHIPS_DE_PENDENCIA.find((c) => c.key === chip)?.label.toLowerCase() ?? "pendência");
    if (blocoFiltro) nomes.push(blocoPendencia(blocoFiltro) ? `falta em ${ROTULO_DO_BLOCO[blocoFiltro].toLowerCase()}` : `com ${ROTULO_DO_BLOCO[blocoFiltro].toLowerCase()}`);
    for (const st of SITUACOES) if (situacoes.has(st.key)) nomes.push(st.label.toLowerCase());
    return nomes;
  }, [searchText, deptFilter, hotelFilter, chip, blocoFiltro, situacoes]);

  const emptyMessage = activeFilterCount > 0
    ? "Ninguém corresponde a esses filtros."
    : "Ninguém escalado neste evento.";

  return {
    view, setView, density, setDensity, compact: density === "compact",
    searchText, setSearchText, deptFilter, setDeptFilter, hotelFilter, setHotelFilter,
    chip, setChip, blocoFiltro, setBlocoFiltro, situacoes, setSituacoes,
    sort, toggleSort, hiddenBlocks, setHiddenBlocks, collapsedDepts, setCollapsedDepts, estreito,
    filteredRows, activeFilterCount, clearFilters, filtrosAtivos, emptyMessage,
  };
}

export type MirrorFilters = ReturnType<typeof useMirrorFilters>;
