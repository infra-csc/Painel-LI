/**
 * Filtros da Escalação num estado só (25/09 — extraído de pages/scaling.tsx).
 *
 * Eram dez `useState` soltos na página; agora é um objeto com setters
 * estáveis (criados uma vez), o que deixa as ações compostas — "ver vagas
 * deste evento", "limpar filtros", abrir um bloco pela URL — virarem UMA
 * atualização em vez de cinco seguidas.
 *
 * Nada disso vai para o localStorage, e a decisão é deliberada: filtro
 * persistido faz o usuário abrir a tela filtrado sem perceber. A ABA também
 * não persiste — quem abre a Escalação vem trabalhar na fila.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import type { SortConfig, SortField } from "@/components/common/sortable-header";
import { DEFAULT_PERIOD, temRecorteDePeriodo, type PeriodConfig, type RecorteDeEventos } from "../scaling-period";
import { contarFlagsAtivas, type QueueKey } from "../scaling-queue";

export type ScalingAba = "fila" | "analises" | "escala";

export interface FiltrosDaEscalacao {
  aba: ScalingAba;
  /**
   * Bloco da fila ligado. Nasce em "Todas" (null) — decisão do dono (04/09):
   * quem abre a tela vê o recorte inteiro e escolhe um bloco para trabalhar.
   * "Limpar filtros" também volta para "Todas".
   */
  fila: QueueKey | null;
  busca: string;
  eventos: Record<string, boolean>;
  /** Funções marcadas, por id (dono, 10/09). Vazio = todas. */
  funcoes: Record<string, boolean>;
  periodo: PeriodConfig;
  flags: Record<string, boolean>;
  verExcluidos: boolean;
  /** Recorte de eventos — nasce em "Futuros" (dono, 04/09); "Todos" tira o recorte. */
  recorteEventos: RecorteDeEventos;
  sortConfig: SortConfig | null;
}

const FILTROS_INICIAIS: FiltrosDaEscalacao = {
  aba: "fila",
  fila: null,
  busca: "",
  eventos: {},
  funcoes: {},
  periodo: DEFAULT_PERIOD,
  flags: {},
  verExcluidos: false,
  recorteEventos: "futuros",
  sortConfig: { field: "id", direction: "desc" },
};

const FILAS_VALIDAS: string[] = ["trabalho", "escalar", "gestor", "troca", "prontas"];

export function useScalingFilters() {
  const [f, setF] = useState<FiltrosDaEscalacao>(FILTROS_INICIAIS);

  const acoes = useMemo(() => {
    // Mesmo contrato do useState de antes: valor igual não re-renderiza.
    const campo = <K extends keyof FiltrosDaEscalacao>(k: K) => (v: FiltrosDaEscalacao[K]) =>
      setF((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    return {
      setAba: campo("aba"),
      setFila: campo("fila"),
      setBusca: campo("busca"),
      setEventos: campo("eventos"),
      setFuncoes: campo("funcoes"),
      setPeriodo: campo("periodo"),
      setFlags: campo("flags"),
      setVerExcluidos: campo("verExcluidos"),
      setRecorteEventos: campo("recorteEventos"),
      handleSort: (field: SortField) => setF((prev) => {
        const current = prev.sortConfig;
        if (current?.field === field) return { ...prev, sortConfig: current.direction === "asc" ? { field, direction: "desc" } : null };
        return { ...prev, sortConfig: { field, direction: "asc" } };
      }),
      limpaFiltros: () => setF((prev) => ({
        ...prev, busca: "", eventos: {}, funcoes: {}, periodo: DEFAULT_PERIOD, flags: {}, fila: null, recorteEventos: "futuros",
      })),
      /** Aviso do sininho / link direto: abre a Fila já no bloco pedido. */
      irParaFila: (fila: QueueKey) => setF((prev) => ({ ...prev, aba: "fila", flags: {}, busca: "", fila })),
      /**
       * Das Análises: mantém o período e limpa o resto — "ver as vagas deste
       * evento" não pode cair numa lista ainda filtrada por outra coisa.
       */
      verVagasDoEvento: (eventId: string) => setF((prev) => ({
        ...prev, eventos: { [eventId]: true }, flags: {}, fila: null, busca: "", aba: "fila",
      })),
      verFuncao: (nome: string) => setF((prev) => ({ ...prev, fila: "escalar", flags: {}, busca: nome, aba: "fila" })),
    };
  }, []);

  // Aviso do sininho abre direto o bloco (15/09): /scaling?fila=troca. O "t" do
  // link muda a cada clique, então funciona mesmo já estando na tela.
  const buscaDaUrl = useSearch();
  useEffect(() => {
    const alvo = new URLSearchParams(buscaDaUrl).get("fila");
    if (alvo && FILAS_VALIDAS.includes(alvo)) acoes.irParaFila(alvo as QueueKey);
  }, [buscaDaUrl, acoes]);

  /**
   * "Hoje" de verdade: esta tela fica aberta na mesa de alguém por dias, e um
   * `new Date()` congelado na montagem manteria "faltam 3 dias" na terça
   * seguinte. O relógio só dispara re-render quando o DIA vira — não de minuto
   * em minuto.
   */
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setHoje((atual) => (atual.toDateString() === new Date().toDateString() ? atual : new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const eventosMarcados = useMemo(() => Object.keys(f.eventos).filter((k) => f.eventos[k]), [f.eventos]);
  const funcoesMarcadas = useMemo(() => Object.keys(f.funcoes).filter((k) => f.funcoes[k]), [f.funcoes]);
  const temRecorte = eventosMarcados.length > 0 || funcoesMarcadas.length > 0 || temRecorteDePeriodo(f.periodo)
    || contarFlagsAtivas(f.flags) > 0 || f.busca.trim() !== "" || !!f.fila || f.recorteEventos !== "futuros";

  return { ...f, ...acoes, hoje, eventosMarcados, funcoesMarcadas, temRecorte };
}

export type ScalingFiltersState = ReturnType<typeof useScalingFilters>;
