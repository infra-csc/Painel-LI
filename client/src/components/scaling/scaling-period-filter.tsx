/**
 * Filtro de período da Escalação (01/09).
 *
 * A tela não tinha NENHUM filtro de data. Numa fila em que a compra tem prazo,
 * "o que acontece nos próximos 7 dias" era uma pergunta que só se respondia
 * lendo a coluna Período linha por linha.
 *
 * Duas escolhas de desenho que valem a explicação:
 *
 * - **A data de referência fica escrita** ("hoje é 01/09"). Sem ela, "próximos
 *   7 dias" é um recorte que o usuário não consegue conferir.
 * - **Cada opção mostra quantas linhas ela deixaria.** O número é hipotético e
 *   cruzado: responde "quantas sobram se eu marcar ISTO mantendo o resto" — por
 *   isso a lógica em scaling-period.ts é uma fábrica que recebe a configuração,
 *   e não uma função que lê o estado.
 */
import { CalendarRange, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PRESETS, PRESET_LABEL, SEMANA_LABEL, fazTesteDePeriodo, rotuloDoPeriodo, temRecorteDePeriodo,
  type PeriodConfig, type PeriodPreset, type PeriodRow, type PeriodSemana,
} from "./scaling-period";

const SEMANAS: PeriodSemana[] = ["todos", "fds", "uteis"];

interface Props<T extends PeriodRow> {
  valor: PeriodConfig;
  onChange: (cfg: PeriodConfig) => void;
  /** Base para os contadores: as linhas do recorte de evento, sem o de período. */
  linhas: T[];
  hoje: Date;
}

/** Uma opção da lista, com a contagem hipotética à direita. */
function Opcao({ label, n, ativo, onClick, testid }: {
  label: string; n: number; ativo: boolean; onClick: () => void; testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      data-testid={testid}
      className={`flex items-center gap-2 min-h-[30px] px-2 rounded-[7px] text-[13px] text-left transition-colors ${
        ativo ? "bg-brand-soft text-primary font-semibold" : "text-slate-700 font-normal hover:bg-slate-100"
      }`}
    >
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{n}</span>
    </button>
  );
}

export default function ScalingPeriodFilter<T extends PeriodRow>({ valor, onChange, linhas, hoje }: Props<T>) {
  const ativo = temRecorteDePeriodo(valor);
  const hojeBr = `hoje é ${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  /** Quantas linhas sobram com esta hipótese — mantendo o resto do recorte. */
  const conta = (over: Partial<PeriodConfig>) =>
    linhas.filter(fazTesteDePeriodo({ ...valor, ...over }, hoje)).length;

  const escolhePreset = (p: PeriodPreset) =>
    // Reclicar o preset ativo volta para "qualquer data": o filtro não pode ser
    // uma armadilha de mão única.
    onChange({ ...valor, preset: valor.preset === p ? "todos" : p, de: "", ate: "" });

  const escolheData = (campo: "de" | "ate", v: string) =>
    // Digitar uma data exata assume o comando: manter "próximos 7 dias" ligado
    // junto com "18/09 a 22/09" produziria um recorte que ninguém pediu.
    onChange({ ...valor, preset: "custom", [campo]: v });

  const custom = valor.preset === "custom";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-filtro-periodo"
          title="Filtrar pelo período da escala"
          className={`inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border bg-card text-[13px] font-medium text-slate-700 max-w-[240px] hover:bg-slate-100 transition-colors ${
            ativo ? "border-[rgba(0,51,204,0.35)]" : "border-border"
          }`}
        >
          <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="truncate">{rotuloDoPeriodo(valor)}</span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[460px] p-0 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-slate-100">
          <span className="text-[13px] font-semibold text-slate-900">Período da escala</span>
          <span className="text-[12px] text-muted-foreground truncate">{hojeBr}</span>
          {ativo && (
            <button
              type="button"
              onClick={() => onChange({ preset: "todos", de: "", ate: "", semana: "todos", inicioFds: false })}
              className="ml-auto h-[26px] px-2.5 rounded-md text-[12px] font-medium text-primary hover:bg-brand-soft shrink-0"
              data-testid="button-limpar-periodo"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex">
          <div className="w-[228px] shrink-0 p-2.5 border-r border-slate-100">
            <p className="mb-1.5 ml-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Quando acontece
            </p>
            <div className="flex flex-col gap-px">
              {PRESETS.map((p) => (
                <Opcao
                  key={p}
                  label={PRESET_LABEL[p]}
                  n={conta({ preset: p, de: "", ate: "" })}
                  ativo={valor.preset === p}
                  onClick={() => escolhePreset(p)}
                  testid={`periodo-preset-${p}`}
                />
              ))}
            </div>

            <div className={`mt-2 rounded-lg border p-2 ${custom ? "border-[rgba(0,51,204,0.35)] bg-[#F5F7FF]" : "border-border bg-card"}`}>
              <p className="mb-1.5 text-[11px] font-semibold text-[#475569]">Datas exatas</p>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="w-[26px] shrink-0">De</span>
                  <input
                    type="date"
                    value={valor.de}
                    onChange={(e) => escolheData("de", e.target.value)}
                    aria-label="A partir de"
                    data-testid="input-periodo-de"
                    className="flex-1 min-w-0 h-[30px] rounded-md border border-border bg-card px-1.5 text-[12px] text-slate-700 tabular-nums outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
                  />
                </label>
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="w-[26px] shrink-0">Até</span>
                  <input
                    type="date"
                    value={valor.ate}
                    onChange={(e) => escolheData("ate", e.target.value)}
                    aria-label="Até"
                    data-testid="input-periodo-ate"
                    className="flex-1 min-w-0 h-[30px] rounded-md border border-border bg-card px-1.5 text-[12px] text-slate-700 tabular-nums outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 p-2.5">
            <p className="mb-1.5 ml-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Dias da semana
            </p>
            <div className="flex flex-col gap-px">
              {SEMANAS.map((s) => (
                <Opcao
                  key={s}
                  label={SEMANA_LABEL[s]}
                  n={conta({ semana: s })}
                  ativo={valor.semana === s}
                  onClick={() => onChange({ ...valor, semana: s })}
                  testid={`periodo-semana-${s}`}
                />
              ))}
            </div>

            <div className="my-2.5 border-t border-slate-100" />

            <label className="flex items-start gap-2.5 px-2 cursor-pointer">
              <input
                type="checkbox"
                checked={valor.inicioFds}
                onChange={(e) => onChange({ ...valor, inicioFds: e.target.checked })}
                data-testid="checkbox-inicio-fds"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0033CC]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-700">Começa no fim de semana</span>
                <span className="block text-[11px] text-muted-foreground tabular-nums">
                  {conta({ inicioFds: !valor.inicioFds })} vagas
                </span>
              </span>
            </label>
            {/* A frase existe porque o filtro não é óbvio: sem ela, "começa no
                fim de semana" parece curiosidade e não critério de compra. */}
            <p className="mt-2 px-2 text-[11px] leading-relaxed text-muted-foreground">
              Quem chega no sábado ou domingo precisa de passagem e hotel no fim de semana — é onde a tarifa muda.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
