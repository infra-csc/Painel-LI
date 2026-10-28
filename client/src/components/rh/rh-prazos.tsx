// Prazos e cobranças no Painel de honorários (28/10, Fase 3).
//
// Uma faixa curta acima dos filtros: "Atrasados N", "Vence hoje N" e
// "Contestações N" — cada um recorta a fila (clicar de novo desfaz) — e a
// ordem ("Prioridade" × "Mais atrasado primeiro"). Os números são contados
// sobre a fila com os OUTROS filtros de agora (busca, função, nota…), então
// o número do botão é exatamente o tamanho da lista que ele mostra.
// Só o fluxo novo tem prazo; no legado a faixa não aparece.
import { createContext } from "react";
import { AlarmClock, ArrowDownWideNarrow, MessageSquareWarning, TriangleAlert } from "lucide-react";
import type { ContestacaoParaTela } from "@/components/honorarios/contestacao";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FiltroDePrazo, OrdemDaFila } from "./use-rh-filtros";

export interface ContagemDaFaixa {
  atrasados: number;
  venceHoje: number;
  contestacoes: number;
  /** Atrasados por quem deve agir (dica do botão). */
  porQuem: { dp: number; producao: number; colaborador: number };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Botao({ ativo, onClick, icone: Icone, rotulo, n, tom, dica, testid }: {
  ativo: boolean; onClick: () => void; icone: LucideIcon; rotulo: string; n: number; tom: "perigo" | "alerta" | "neutro"; dica: string; testid: string;
}) {
  const vazio = n === 0 && !ativo;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      disabled={vazio}
      title={dica}
      className={cn(
        "pas-alvo inline-flex shrink-0 items-center gap-1.5 h-[34px] px-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-default",
        ativo
          ? "border-primary bg-primary text-primary-foreground"
          : vazio ? "border-border bg-card text-muted-foreground"
          : tom === "perigo" ? "border-danger/25 bg-danger-soft text-danger hover:brightness-95"
          : tom === "alerta" ? "border-warning/25 bg-warning-soft text-warning hover:brightness-95"
          : "border-border bg-card text-slate-700 hover:bg-muted",
      )}
      data-testid={testid}
    >
      <Icone className="w-4 h-4 shrink-0" aria-hidden="true" />
      {rotulo}
      <span className="tabular-nums font-semibold">{n}</span>
    </button>
  );
}

export function FaixaDePrazos({ contagem, filtro, onFiltro, ordem, onOrdem }: {
  contagem: ContagemDaFaixa;
  filtro: FiltroDePrazo;
  onFiltro: (v: FiltroDePrazo) => void;
  ordem: OrdemDaFila;
  onOrdem: (v: OrdemDaFila) => void;
}) {
  const alternar = (v: FiltroDePrazo) => onFiltro(filtro === v ? "all" : v);
  const { porQuem } = contagem;
  const dicaAtrasados = contagem.atrasados === 0
    ? "Nenhuma prestação com prazo vencido"
    : `Prazo vencido: ${[porQuem.dp && plural(porQuem.dp, "com o DP", "com o DP"), porQuem.producao && `${porQuem.producao} com a produção`, porQuem.colaborador && `${porQuem.colaborador} com ${porQuem.colaborador === 1 ? "o colaborador" : "os colaboradores"}`].filter(Boolean).join(" · ")}`;
  return (
    <div className="pas-rolagem-x -mx-[var(--page-gutter)] flex items-center gap-1.5 px-[var(--page-gutter)] sm:mx-0 sm:px-0 sm:flex-wrap" role="group" aria-label="Prazos" data-testid="rh-faixa-prazos">
      <Botao ativo={filtro === "atrasados"} onClick={() => alternar("atrasados")} icone={TriangleAlert} rotulo="Atrasados" n={contagem.atrasados} tom="perigo" dica={dicaAtrasados} testid="rh-prazo-atrasados" />
      <Botao ativo={filtro === "vence_hoje"} onClick={() => alternar("vence_hoje")} icone={AlarmClock} rotulo="Vence hoje" n={contagem.venceHoje} tom="alerta" dica="O prazo da etapa atual termina hoje (horário de Brasília)" testid="rh-prazo-hoje" />
      <Botao ativo={filtro === "contestacoes"} onClick={() => alternar("contestacoes")} icone={MessageSquareWarning} rotulo="Contestações" n={contagem.contestacoes} tom="alerta" dica="O colaborador escreveu “Algo não bate?” na confirmação e o DP ainda não respondeu" testid="rh-prazo-contestacoes" />
      <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 h-[34px] pl-2.5 pr-1 rounded-lg border border-border bg-card text-sm text-slate-700">
        <ArrowDownWideNarrow className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Ordem da fila</span>
        <select
          value={filtro === "atrasados" ? "atraso" : ordem}
          disabled={filtro === "atrasados"}
          onChange={(e) => onOrdem(e.target.value as OrdemDaFila)}
          className="h-full bg-transparent border-0 pr-1 text-sm font-medium outline-none disabled:opacity-80"
          title={filtro === "atrasados" ? "Os atrasados vêm do mais atrasado ao menos" : "Ordem da fila"}
          data-testid="rh-ordem"
        >
          <option value="padrao">Prioridade</option>
          <option value="atraso">Mais atrasado primeiro</option>
        </select>
      </label>
    </div>
  );
}

/**
 * Abrir o diálogo da contestação a partir de uma linha da fila (o selo da
 * linha chama; a página guarda o diálogo) — sem passar a função por
 * lista → grupo → cartão → linha.
 */
export const AbrirContestacao = createContext<((alvo: { actualId: string; nome: string; contestacao: ContestacaoParaTela }) => void) | null>(null);
