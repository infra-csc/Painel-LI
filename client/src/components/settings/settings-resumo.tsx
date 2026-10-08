// Valores padrão — painel de resumo (redesenho 08/10).
//
// No lugar do subtítulo genérico: o que ESTÁ VALENDO no cálculo agora (os
// valores salvos, não os digitados), por grupo, e — na faixa de baixo — se há
// alteração não salva, quando este navegador salvou por último e o efeito de
// salvar. Cada métrica leva até o grupo dela; com alteração pendente no grupo,
// a linha de apoio troca por "N não salvas".
import { Check } from "lucide-react";
import { percurseiroDiariaCents, PERCURSEIRO_SETTING_KEYS } from "@shared/calculation-rules";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { cn, parseBrNumber } from "@/lib/utils";
import { PERCENT_KEYS, type FormValues } from "./settings-schema";
import { valorParaLer, type SecaoId } from "./settings-secoes";
import { formatDateTime } from "./settings-utils";
import type { LastSavedInfo } from "./use-settings-history";

export interface ResumoDosValoresProps {
  /** Valores salvos (os carregados do servidor). */
  salvos: Partial<FormValues>;
  alteradasPorSecao: Record<SecaoId, number>;
  totalNaoSalvas: number;
  lastSaved: LastSavedInfo | null;
  onIrPara: (id: SecaoId) => void;
}

const reais = (v: string | undefined) => {
  const n = parseBrNumber(v || "0");
  return Number.isFinite(n) ? n : 0;
};

export function ResumoDosValores({ salvos, alteradasPorSecao, totalNaoSalvas, lastSaved, onIrPara }: ResumoDosValoresProps) {
  const v = (k: keyof FormValues) => valorParaLer(k, salvos[k]);
  const pct = (k: keyof FormValues) => String(salvos[k] ?? "—");

  const settingsPercurseiro: Record<string, number> = {};
  for (const k of Object.values(PERCURSEIRO_SETTING_KEYS) as (keyof FormValues)[]) {
    settingsPercurseiro[k] = PERCENT_KEYS.has(k) ? Math.round(reais(salvos[k])) : Math.round(reais(salvos[k]) * 100);
  }
  const t1 = percurseiroDiariaCents("tipo_1", settingsPercurseiro);
  const t2 = percurseiroDiariaCents("tipo_2", settingsPercurseiro);

  const metricas: { secao: SecaoId; rotulo: string; valor: string; apoio: string; dica: string }[] = [
    { secao: "diarias", rotulo: "Diária freela local", valor: v("freela_diaria_local"), apoio: `em viagem ${v("freela_diaria_viagem")}`, dica: "Diárias freela, casa e atendimento" },
    { secao: "diarias", rotulo: "Diária casa · produtor", valor: v("casa_diaria_produtor"), apoio: `dir. de prova ${v("casa_diaria_dir_prova")}`, dica: "Diárias da casa por grupo de função" },
    { secao: "deflacao", rotulo: "Deflação", valor: `${pct("deflacao_fator_ate_4")} · ${pct("deflacao_fator_5_8")} · ${pct("deflacao_fator_9_mais")}%`, apoio: "até 4 · 5º–8º · 9º+ dias", dica: "Percentual da diária por faixa de dias" },
    { secao: "alimentacao", rotulo: "Refeição · demais", valor: v("alimentacao_almoco"), apoio: `almoço · jantar ${v("alimentacao_jantar")}`, dica: "Alimentação por refeição" },
    { secao: "percurseiro", rotulo: "Percurseiro por diária", valor: t1 ? formatarMoeda(t1.total) : "—", apoio: `tipo 1 · tipo 2 ${t2 ? formatarMoeda(t2.total) : "—"}`, dica: "Pacote do percurseiro com fee, alimentação, transporte e NF" },
  ];
  // As duas métricas de diárias dividem o mesmo grupo: o "não salvas" aparece só na primeira.
  const vistas = new Set<SecaoId>();

  return (
    <section aria-label="Valores em vigor" className="cfg-resumo rounded-xl border border-border bg-card overflow-hidden" data-testid="cfg-resumo">
      <div className="cfg-resumo-grade">
        {metricas.map((m, i) => {
          const pendentes = vistas.has(m.secao) ? 0 : alteradasPorSecao[m.secao];
          vistas.add(m.secao);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onIrPara(m.secao)}
              title={`${m.dica} — ir para o grupo`}
              className="cfg-metrica group min-w-0 px-4 pt-3.5 pb-3 text-left transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              data-testid={`cfg-metrica-${m.secao}`}
            >
              <span className="block text-xs font-medium text-slate-600 truncate group-hover:text-foreground">{m.rotulo}</span>
              <span className="block mt-1 text-lg font-semibold leading-6 tracking-[-0.01em] tabular-nums text-foreground truncate">{m.valor}</span>
              <span className={cn("block text-2xs sm:text-xs truncate", pendentes > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
                {pendentes > 0 ? `${pendentes} ${pendentes === 1 ? "alteração não salva" : "alterações não salvas"}` : m.apoio}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-t border-border bg-surface-muted/60" data-testid="cfg-resumo-situacao">
        {totalNaoSalvas > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
            <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />
            {totalNaoSalvas} {totalNaoSalvas === 1 ? "alteração não salva" : "alterações não salvas"} — o cálculo ainda usa os valores acima
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success whitespace-nowrap">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />Tudo salvo — estes são os valores em vigor
          </span>
        )}
        {lastSaved && (
          <span className="text-xs text-muted-foreground">
            · salvo por este navegador em <span className="tabular-nums">{formatDateTime(lastSaved.timestamp)}</span> por {toTitleCase(lastSaved.user)}
          </span>
        )}
        <span className="max-lg:hidden ml-auto text-xs text-muted-foreground">Vale para os planejamentos ainda não enviados e os eventos novos</span>
      </div>
    </section>
  );
}
