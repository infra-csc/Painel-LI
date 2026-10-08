/**
 * Barra de filtros do Log de auditoria (redesenho 08/10).
 *
 * Antes: um cartão com a busca e quatro `Select` cinza de 192px que quebravam
 * em duas linhas já em 1366px, mais uma linha de pílulas "Filtros ativos".
 * Agora a barra comum das listas: a busca (`BuscaDaLista`, Esc limpa) e os
 * quatro recortes à vista, no desenho dos filtros das outras telas — período
 * primeiro (é o que enquadra tudo), depois pessoa, módulo e ação (agrupada
 * pelo tom: criação, alteração, exclusão…). Um filtro fora do padrão fica com
 * o contorno da marca; "Limpar filtros" aparece no fim da linha.
 *
 * No celular a fileira dos quatro rola de lado em vez de empilhar.
 * Só apresentação: os valores e o que cada um manda ao servidor são os de antes.
 */
import { useMemo } from "react";
import { Boxes, CalendarRange, MousePointerClick, UserRound } from "lucide-react";
import { BuscaDaLista, LimparFiltros } from "@/components/common/barra-de-filtros";
import { MODULOS } from "@shared/log-auditoria";
import { FiltroDaAuditoria } from "./filtro-da-auditoria";
import { PERIODOS, gruposDeAcoes, type FiltrosDaAuditoria } from "./auditoria-utils";

export function BarraDaAuditoria({ busca, onBusca, filtros, onFiltro, temFiltros, onLimpar, usuarios }: {
  busca: string;
  onBusca: (v: string) => void;
  filtros: FiltrosDaAuditoria;
  onFiltro: (k: keyof FiltrosDaAuditoria, v: string) => void;
  temFiltros: boolean;
  onLimpar: () => void;
  /** Pessoas (nome já formatado), em ordem alfabética. */
  usuarios: { id: string; name: string }[];
}) {
  const grupoDePessoas = useMemo(() => [{ titulo: "", opcoes: usuarios.map((u) => ({ id: u.id, nome: u.name })) }], [usuarios]);
  const grupoDeModulos = useMemo(() => [{
    titulo: "",
    opcoes: Object.entries(MODULOS).map(([k, m]) => ({ id: k, nome: m.rotulo })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }], []);
  const grupoDeAcoes = useMemo(() => gruposDeAcoes(), []);
  const grupoDePeriodos = useMemo(() => [{ titulo: "", opcoes: PERIODOS.map((p) => ({ id: p.id, nome: p.nome })) }], []);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1.5" role="search" aria-label="Filtros do log de auditoria">
      <BuscaDaLista
        valor={busca}
        onChange={onBusca}
        placeholder="Buscar pessoa, evento, LOC…"
        rotulo="Buscar no log por pessoa, nome do registro ou resumo"
        testid="aud-busca"
        compacta
      />
      <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:contents">
        <div className="shrink-0">
          <FiltroDaAuditoria
            valor={filtros.days}
            onChange={(v) => onFiltro("days", v)}
            grupos={grupoDePeriodos}
            padrao="30"
            titulo="Período"
            icone={<CalendarRange />}
            testid="aud-filtro-periodo"
            largura={220}
          />
        </div>
        <div className="max-w-[220px] shrink-0">
          <FiltroDaAuditoria
            valor={filtros.userId}
            onChange={(v) => onFiltro("userId", v)}
            grupos={grupoDePessoas}
            rotuloTodos="Todas as pessoas"
            textoDoGatilho={(id) => (id === "all" ? "Pessoa" : undefined)}
            titulo="Pessoa"
            icone={<UserRound />}
            placeholderBusca="Buscar pessoa…"
            testid="aud-filtro-pessoa"
          />
        </div>
        <div className="max-w-[220px] shrink-0">
          <FiltroDaAuditoria
            valor={filtros.entityType}
            onChange={(v) => onFiltro("entityType", v)}
            grupos={grupoDeModulos}
            rotuloTodos="Todos os módulos"
            textoDoGatilho={(id) => (id === "all" ? "Módulo" : undefined)}
            titulo="Módulo"
            icone={<Boxes />}
            placeholderBusca="Buscar módulo…"
            testid="aud-filtro-modulo"
          />
        </div>
        <div className="max-w-[220px] shrink-0">
          <FiltroDaAuditoria
            valor={filtros.action}
            onChange={(v) => onFiltro("action", v)}
            grupos={grupoDeAcoes}
            rotuloTodos="Todas as ações"
            textoDoGatilho={(id) => (id === "all" ? "Ação" : undefined)}
            titulo="Ação"
            icone={<MousePointerClick />}
            placeholderBusca="Buscar ação…"
            testid="aud-filtro-acao"
            largura={320}
          />
        </div>
        {temFiltros && (
          <div className="shrink-0 pas-entra sm:ml-1">
            <LimparFiltros onClick={onLimpar} testid="aud-limpar-filtros" />
          </div>
        )}
      </div>
    </div>
  );
}
