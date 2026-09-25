/**
 * Aba "Custos" do modal de edição do Planejado — 25/09 (modularização).
 *
 * Três blocos (Diárias, Mobilidade, Alimentação) extraídos de
 * budget-planned.tsx. Recebem os valores derivados já calculados pela casca
 * (`BudgetEditModal`) e alteram o `editingBudget` pelo controlador do hook.
 */
import { Briefcase, Calendar, Car, ChevronDown, Utensils, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/common/currency-input";
import { parseBrNumber } from "@/lib/utils";
import { ATENDIMENTO_TIPOS, atendimentoDailyCents } from "@shared/atendimento";
import { FUNCAO_LOCAL_RAZAO, PERCURSEIRO_TIPOS, percurseiroDiariaCents, type DeflationSegment } from "@shared/calculation-rules";
import { CENO_FREELA_TIPO_LABELS, type CenoEmpreitaValor } from "@shared/cenotecnica-empreita";
import type { ControladorDoModalDeEdicao } from "@/hooks/use-budget-edit-modal";
import { formatCurrency, formatSegmentsMemo, type BudgetEdit, type EditingBudgetInfo } from "./types";

const inputCls = "h-9 text-sm w-[88px] text-right font-semibold border-border focus:border-primary focus:ring-2 focus:ring-primary/10 rounded-lg bg-card";

export interface CustosTabProps {
  ctrl: ControladorDoModalDeEdicao;
  editingBudget: BudgetEdit;
  info: EditingBudgetInfo;
  /** Derivados calculados pela casca do modal (mesma conta do card). */
  totalDiarias: number;
  deflatedSegments: DeflationSegment[];
  empreitaModal: CenoEmpreitaValor | null;
  empreitaEditadaModal: boolean;
  diasDiariaModal: number;
  noWeekdays: boolean;
  noWeekends: boolean;
  totalAlimentacao: number;
  effectiveAlmocoSemana: number;
  effectiveJantarSemana: number;
  effectiveAlmocoFds: number;
  effectiveJantarFds: number;
}

/** BLOCO: Diárias (tipo de atendimento, percurseiro, empreita, diária plana + deflação). */
function DiariasBlock(p: CustosTabProps) {
  const { ctrl, editingBudget, info, totalDiarias, deflatedSegments, empreitaModal, empreitaEditadaModal, diasDiariaModal } = p;
  const { systemSettings, savingTipo, modalViewMode, pendingAtendimentoTipo, pendingPercurseiroTipo, setEditingBudget } = ctrl;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
      <div className="flex items-center justify-between px-3.5 py-2 bg-brand-soft border-b border-primary/25">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-primary flex items-center justify-center">
            <Calendar className="w-2.5 h-2.5 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-bold text-primary uppercase tracking-wider">Diárias</span>
        </div>
        <span className="text-sm font-bold text-primary">{formatCurrency(totalDiarias)}</span>
      </div>

      {/* Atendimento: escolha da tarifa (Key Account × Exec. de Contas).
          Necessário aqui porque escalações antigas viraram Planejado
          antes do flag existir. */}
      {info.isAtend && (
        <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-brand-soft/40 border-b border-primary/25">
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo de atendimento</span>
          <div className="flex rounded-lg border border-primary/25 overflow-hidden">
            {ATENDIMENTO_TIPOS.map(op => {
              const ativo = info.atendimentoTipo === op.value;
              const valor = atendimentoDailyCents(op.value, systemSettings);
              return (
                <button
                  key={op.value}
                  type="button"
                  disabled={savingTipo || modalViewMode}
                  aria-pressed={ativo}
                  onClick={() => {
                    if (!ativo && info.inclusionId) ctrl.chooseLocalAtendimentoTipo(op.value);
                  }}
                  className={`px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-50 ${
                    ativo ? "bg-primary text-primary-foreground" : "bg-card text-slate-600 hover:bg-brand-soft"
                  }`}
                >
                  {op.label}{valor != null ? ` · ${formatCurrency(valor)}` : ""}
                </button>
              );
            })}
          </div>
          {!info.atendimentoTipo && (
            <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold">definir o tipo</span>
          )}
          {pendingAtendimentoTipo != null && (
            <span className="text-2xs text-muted-foreground" title="O tipo é gravado na escalação ao Salvar">grava na escalação ao salvar</span>
          )}
        </div>
      )}

      {/* Percurso (motoqueiro): pacote fechado Tipo 1 × Tipo 2 */}
      {info.isPercurso && (
        <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-brand-soft/40 border-b border-primary/25">
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo do percurseiro</span>
          <div className="flex rounded-lg border border-primary/25 overflow-hidden">
            {PERCURSEIRO_TIPOS.map(op => {
              const ativo = info.percurseiroTipo === op.value;
              const valor = percurseiroDiariaCents(op.value, systemSettings)?.total;
              return (
                <button
                  key={op.value}
                  type="button"
                  disabled={savingTipo || modalViewMode}
                  aria-pressed={ativo}
                  onClick={() => {
                    if (!ativo && info.inclusionId) ctrl.chooseLocalPercurseiroTipo(op.value);
                  }}
                  className={`px-2.5 py-1 text-2xs font-semibold transition-colors disabled:opacity-50 ${
                    ativo ? "bg-primary text-primary-foreground" : "bg-card text-slate-600 hover:bg-brand-soft"
                  }`}
                >
                  {op.label}{valor != null ? ` · ${formatCurrency(valor)}/diária` : ""}
                </button>
              );
            })}
          </div>
          {!info.percurseiroTipo && (
            <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold" title="Tipo 1 usado provisoriamente até a definição">definir o tipo (Tipo 1 provisório)</span>
          )}
          {pendingPercurseiroTipo != null && (
            <span className="text-2xs text-muted-foreground" title="O tipo é gravado na escalação ao Salvar">grava na escalação ao salvar</span>
          )}
          {info.percurseiro && (
            <span className="w-full text-2xs text-muted-foreground tabular-nums">
              Pacote por diária: motoqueiro {formatCurrency(info.percurseiro.motoqueiro)} + fee Ivan {formatCurrency(info.percurseiro.fee)} + alimentação {formatCurrency(info.percurseiro.alimentacao)} + transporte {formatCurrency(info.percurseiro.transporte)} + NF {formatCurrency(info.percurseiro.nf)} = <b>{formatCurrency(info.percurseiro.total)}</b> · {info.voa ? "2 diárias (em viagem — regra fixa)" : "1 diária (local)"} · alimentação e mobilidade incluídas no pacote
            </span>
          )}
        </div>
      )}
      {/* Cenotécnica EMPREITA: valor FECHADO por nº de dias.
          A modalidade é escolhida na ESCALAÇÃO — aqui é só leitura. */}
      {info.cenoEmpreitaVaga && (
        <div className="flex items-center gap-2 flex-wrap px-3.5 py-2 bg-warning-soft/40 border-b border-warning/25">
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Empreita cenotécnica</span>
          {info.cenoFreelaTipo ? (
            <span
              className="px-2 py-0.5 rounded-lg border border-warning/25 bg-card text-2xs font-semibold text-warning cursor-default"
              title="A modalidade da empreita é definida na tela de Escalação — aqui é somente leitura."
            >
              {CENO_FREELA_TIPO_LABELS[info.cenoFreelaTipo]}
            </span>
          ) : (
            <span
              className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning text-2xs font-semibold"
              title="Sem modalidade definida: o cálculo segue a diária padrão. A escolha é feita na tela de Escalação — aqui é somente leitura."
            >
              definir tipo na Escalação
            </span>
          )}
          {empreitaModal && (
            <span className="w-full text-2xs text-muted-foreground tabular-nums">
              Valor fechado por {empreitaModal.dias} {empreitaModal.dias === 1 ? "dia" : "dias"}: <b>{formatCurrency(empreitaModal.totalCents)}</b> — sem deflação por período. Alimentação e mobilidade seguem as regras normais (não entram no valor fechado).
              {empreitaModal.extrapolado && (
                <span className="text-warning font-semibold"> · valor extrapolado (tabela cobre 2 a 6 dias)</span>
              )}
            </span>
          )}
        </div>
      )}
      <div className="divide-y divide-border">
        {/* Diária PLANA — um único valor para todos os dias */}
        <div className="flex items-center px-3.5 py-2 gap-3">
          <div className="flex items-center gap-1.5 flex-1">
            <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-700">{empreitaModal ? "Diárias (empreita)" : "Diária"}</span>
            <span className="text-2xs text-muted-foreground">
              {/* Empreita: mostra os dias da EMPREITA (dias efetivamente
                  trabalhados), que são os multiplicados acima */}
              × {empreitaModal ? empreitaModal.dias : diasDiariaModal} {(empreitaModal ? empreitaModal.dias : diasDiariaModal) === 1 ? "dia" : "dias"}
              {info.regraDiaria === "fds" && " (só fins de semana)"}
              {info.regraDiaria === "nenhuma" && " (cenotécnica CLT: sem diária)"}
              {info.isPercurso && (info.voa ? " (percurso em viagem — regra fixa de 2 diárias)" : " (percurso local — regra fixa de 1 diária)")}
            </span>
            {empreitaModal && (
              <span
                className="text-2xs font-semibold text-warning"
                title="Empreita: o total é o valor fechado da tabela pelo nº de dias — não é diária × dias. Editar a diária aqui substitui o valor fechado."
              >
                Empreita — {CENO_FREELA_TIPO_LABELS[empreitaModal.tipo]} · valor fechado
                {empreitaModal.extrapolado && " · valor extrapolado (tabela cobre 2 a 6 dias)"}
                {empreitaEditadaModal && " · ajustado manualmente"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-muted-foreground">R$</span>
            <CurrencyInput
              semEstilo className={inputCls}
              aria-label="Diária (R$/dia)"
              value={editingBudget.valorDiaria}
              disabled={modalViewMode}
              // diária plana: espelha nos campos legados útil/fds
              onChange={v => setEditingBudget(prev => prev ? { ...prev, valorDiaria: v, valorDiariaUtil: v, valorDiariaFds: v } : prev)}
            />
            <span className="text-2xs text-muted-foreground">/dia</span>
          </div>
          <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0">{formatCurrency(totalDiarias)}</span>
        </div>
        {/* Memória da deflação por período */}
        {deflatedSegments.length > 1 && (
          <div className="px-3.5 py-1.5 text-2xs bg-brand-soft/30 text-primary">
            Deflação por período: {formatSegmentsMemo(deflatedSegments)} = <b>{formatCurrency(totalDiarias)}</b>
          </div>
        )}
      </div>
    </div>
  );
}

/** BLOCO: Mobilidade (ida e volta). */
function MobilidadeBlock({ ctrl, editingBudget, info }: Pick<CustosTabProps, "ctrl" | "editingBudget" | "info">) {
  const { modalViewMode, setEditingBudget } = ctrl;
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
      <div className="flex items-center justify-between px-3.5 py-2 bg-brand-soft border-b border-primary/25">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-primary flex items-center justify-center">
            <Car className="w-2.5 h-2.5 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-bold text-primary uppercase tracking-wider">Mobilidade</span>
          <span className="text-2xs text-primary/70">ida e volta</span>
        </div>
        <span className="text-sm font-bold text-primary">{formatCurrency(editingBudget.mobilidadeIda + editingBudget.mobilidadeVolta)}</span>
      </div>
      {info.funcaoLocal && (
        <div className="px-3.5 py-1.5 bg-surface-muted border-b border-border text-2xs text-muted-foreground">
          {FUNCAO_LOCAL_RAZAO}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 px-3.5 py-2.5">
        <div>
          <div className="text-2xs text-muted-foreground font-medium mb-1">Ida (R$)</div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-muted-foreground">R$</span>
            <CurrencyInput
              semEstilo className={inputCls}
              aria-label="Mobilidade — ida (R$)"
              value={editingBudget.mobilidadeIda}
              disabled={modalViewMode}
              onChange={ida => setEditingBudget(prev => prev ? { ...prev, mobilidadeIda: ida, mobilidade: ida + prev.mobilidadeVolta } : prev)}
            />
          </div>
        </div>
        <div>
          <div className="text-2xs text-muted-foreground font-medium mb-1">Volta (R$)</div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-muted-foreground">R$</span>
            <CurrencyInput
              semEstilo className={inputCls}
              aria-label="Mobilidade — volta (R$)"
              value={editingBudget.mobilidadeVolta}
              disabled={modalViewMode}
              onChange={volta => setEditingBudget(prev => prev ? { ...prev, mobilidadeVolta: volta, mobilidade: prev.mobilidadeIda + volta } : prev)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** BLOCO: Alimentação — resumo em R$/dia (útil e fds) + detalhe por refeição. */
function AlimentacaoBlock(p: CustosTabProps) {
  const { ctrl, editingBudget, info, noWeekdays, noWeekends, totalAlimentacao, effectiveAlmocoSemana, effectiveJantarSemana, effectiveAlmocoFds, effectiveJantarFds } = p;
  const { modalViewMode, modalBufs, setModalBufs, defaultBudgetValues, alimExpanded, setAlimExpanded, setEditingBudget } = ctrl;

  // Buffer de digitação por campo: preserva o texto enquanto o usuário
  // digita ("540,50" funciona) e normaliza no blur.
  const mBuf = (key: string, fallback: number) => modalBufs[key] ?? String(fallback / 100);
  const mSet = (key: string, raw: string) => setModalBufs(pv => ({ ...pv, [key]: raw }));
  const mClear = (key: string) => () => setModalBufs(pv => { const n = { ...pv }; delete n[key]; return n; });
  const toCents = (raw: string) => Math.round(parseBrNumber(raw) * 100) || 0;

  // ── Alimentação em R$/DIA (útil e fim de semana) ──────────────────
  // Mesma semântica dos inputs da planilha (`alimentacaoUtil` /
  // `alimentacaoFds`): o usuário digita o valor POR DIA e ele é
  // rateado entre almoço e jantar do bucket — proporcional ao que já
  // existe, ou meio a meio quando o bucket está zerado. Os 4 campos
  // por refeição continuam disponíveis em "Detalhar por refeição".
  const alimUtilDiaCents = info.weekdays > 0
    ? Math.round((editingBudget.almocoSemana + editingBudget.jantarSemana) / info.weekdays)
    : 0;
  const alimFdsDiaCents = info.weekends > 0
    ? Math.round((editingBudget.almocoFds + editingBudget.jantarFds) / info.weekends)
    : 0;
  const rateiaPorDia = (valCents: number, dias: number, almocoAtual: number, jantarAtual: number) => {
    const total = valCents * Math.max(1, dias);
    const existente = almocoAtual + jantarAtual;
    const almoco = existente === 0
      ? Math.round(total / 2)
      : Math.round(almocoAtual * total / existente);
    return { almoco, jantar: total - almoco };
  };
  const setAlimUtilDia = (raw: string) => {
    const { almoco, jantar } = rateiaPorDia(toCents(raw), info.weekdays, editingBudget.almocoSemana, editingBudget.jantarSemana);
    setEditingBudget({ ...editingBudget, almocoSemana: almoco, jantarSemana: jantar });
  };
  const setAlimFdsDia = (raw: string) => {
    const { almoco, jantar } = rateiaPorDia(toCents(raw), info.weekends, editingBudget.almocoFds, editingBudget.jantarFds);
    setEditingBudget({ ...editingBudget, almocoFds: almoco, jantarFds: jantar });
  };
  // "Editado" = difere do MOTOR (mesma marca ✱ da planilha)
  const alimUtilEditado = !!defaultBudgetValues && !noWeekdays && (
    editingBudget.almocoSemana !== defaultBudgetValues.almocoSemana ||
    editingBudget.jantarSemana !== defaultBudgetValues.jantarSemana);
  const alimFdsEditado = !!defaultBudgetValues && !noWeekends && (
    editingBudget.almocoFds !== defaultBudgetValues.almocoFds ||
    editingBudget.jantarFds !== defaultBudgetValues.jantarFds);
  const clearBufs = (...keys: string[]) => setModalBufs(pv => {
    const n = { ...pv }; keys.forEach(k => delete n[k]); return n;
  });
  const restoreAlimUtil = () => {
    if (!defaultBudgetValues) return;
    setEditingBudget({ ...editingBudget, almocoSemana: defaultBudgetValues.almocoSemana, jantarSemana: defaultBudgetValues.jantarSemana });
    clearBufs("alimUtilDia", "almSem", "janSem");
  };
  const restoreAlimFds = () => {
    if (!defaultBudgetValues) return;
    setEditingBudget({ ...editingBudget, almocoFds: defaultBudgetValues.almocoFds, jantarFds: defaultBudgetValues.jantarFds });
    clearBufs("alimFdsDia", "almFds", "janFds");
  };
  const modalRestoreBtn = (onClick: () => void, label: string) => (
    <button
      type="button"
      aria-label={label}
      title="Restaurar padrão (regra atual)"
      onClick={onClick}
      className="text-2xs leading-none px-1.5 py-1 -my-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors shrink-0"
    >↩</button>
  );
  const modalEditedMark = (
    <span role="img" aria-label="Valor editado manualmente" title="Valor editado manualmente"
      className="text-2xs font-bold text-muted-foreground shrink-0 select-none">✱</span>
  );

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-1">
      <div className="flex items-center justify-between px-3.5 py-2 bg-warning-soft border-b border-warning/25">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-md bg-warning-strong flex items-center justify-center">
            <Utensils className="w-2.5 h-2.5 text-white" aria-hidden="true" />
          </div>
          <span className="text-2xs font-bold text-warning uppercase tracking-wider">Alimentação</span>
        </div>
        <span className="text-sm font-bold text-warning">{formatCurrency(totalAlimentacao)}</span>
      </div>

      {/* Horários de voo que dirigem o cálculo (passagem manda).
          Função local não tem refeição calculada — a razão aparece no resumo. */}
      {info.funcaoLocal ? null : info.voa ? (
        <div className="flex items-center gap-2 flex-wrap px-3.5 py-1.5 bg-warning-soft/50 border-b border-warning/25 text-2xs text-muted-foreground">
          <span>✈ Chegada (ida): <b className="text-slate-700">{info.vooChegadaIda || "—"}</b></span>
          <span>· Partida (volta): <b className="text-slate-700">{info.vooPartidaVolta || "—"}</b></span>
          {info.fonteVoo === "passagem" ? (
            <span className="px-1.5 py-0.5 rounded-full bg-success-soft text-success font-semibold">pela passagem</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-semibold" title="Sem horários da passagem registrada — refeições assumem dia cheio até a compra">estimado — aguardando passagem</span>
          )}
        </div>
      ) : (
        <div className="px-3.5 py-1.5 bg-surface-muted border-b border-border text-2xs text-muted-foreground">
          Jornada externa (não voa) — almoço e jantar em todos os dias trabalhados.
        </div>
      )}

      {/* Resumo SEMPRE À VISTA e editável em R$/dia (útil e fds).
          Os 4 campos por refeição continuam no "Detalhar por refeição". */}
      <div className="px-3.5 py-2.5 space-y-1.5">
        {info.funcaoLocal && (
          <p className="text-2xs text-muted-foreground">{FUNCAO_LOCAL_RAZAO}</p>
        )}
        {totalAlimentacao === 0 && !info.funcaoLocal && (
          <p className="text-2xs text-muted-foreground">
            {info.voa
              ? "Nenhuma refeição prevista pelos horários de voo."
              : "Nenhuma refeição prevista para esta escalação."}
          </p>
        )}
        {/* Dias úteis — R$/dia */}
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-muted-foreground flex-1 min-w-0">Dias úteis ({info.weekdays})</span>
          {alimUtilEditado && modalEditedMark}
          <span className="text-2xs text-muted-foreground">R$</span>
          <Input
            type="text" inputMode="decimal" className={inputCls}
            aria-label="Alimentação por dia útil (R$)"
            value={noWeekdays ? "—" : mBuf("alimUtilDia", alimUtilDiaCents)}
            disabled={noWeekdays || modalViewMode}
            onChange={e => { mSet("alimUtilDia", e.target.value); setAlimUtilDia(e.target.value); }}
            onBlur={mClear("alimUtilDia")}
          />
          <span className="text-2xs text-muted-foreground shrink-0">/dia</span>
          {alimUtilEditado && !modalViewMode
            ? modalRestoreBtn(restoreAlimUtil, "Restaurar alimentação padrão dos dias úteis")
            : <span className="w-[22px] shrink-0" aria-hidden="true" />}
          <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0 tabular-nums">
            {formatCurrency(effectiveAlmocoSemana + effectiveJantarSemana)}
          </span>
        </div>
        {/* Fim de semana — R$/dia */}
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-muted-foreground flex-1 min-w-0">Fim de semana ({info.weekends})</span>
          {alimFdsEditado && modalEditedMark}
          <span className="text-2xs text-muted-foreground">R$</span>
          <Input
            type="text" inputMode="decimal" className={inputCls}
            aria-label="Alimentação por dia de fim de semana (R$)"
            value={noWeekends ? "—" : mBuf("alimFdsDia", alimFdsDiaCents)}
            disabled={noWeekends || modalViewMode}
            onChange={e => { mSet("alimFdsDia", e.target.value); setAlimFdsDia(e.target.value); }}
            onBlur={mClear("alimFdsDia")}
          />
          <span className="text-2xs text-muted-foreground shrink-0">/dia</span>
          {alimFdsEditado && !modalViewMode
            ? modalRestoreBtn(restoreAlimFds, "Restaurar alimentação padrão dos fins de semana")
            : <span className="w-[22px] shrink-0" aria-hidden="true" />}
          <span className="text-sm font-bold text-slate-700 w-20 text-right shrink-0 tabular-nums">
            {formatCurrency(effectiveAlmocoFds + effectiveJantarFds)}
          </span>
        </div>
      </div>

      {!modalViewMode && (
        <button
          type="button"
          onClick={() => setAlimExpanded(v => !v)}
          aria-expanded={alimExpanded}
          className="w-full flex items-center justify-center gap-1 px-3.5 py-1.5 text-2xs font-semibold text-muted-foreground hover:text-slate-700 hover:bg-surface-muted border-t border-border transition-colors"
        >
          {alimExpanded ? "Ocultar detalhe por refeição" : "Detalhar por refeição (almoço e jantar)"}
          <ChevronDown className={`w-3 h-3 transition-transform ${alimExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}

      {alimExpanded && (<>
      {/* Sub-seção: Dias Úteis */}
      <div className="px-3.5 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Briefcase className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Dias Úteis ({info.weekdays})</span>
        </div>
        <div className="space-y-1.5 pl-3">
          <RefeicaoRow label="Almoço" ariaLabel="Almoço em dias úteis (R$ total)" value={noWeekdays ? 0 : editingBudget.almocoSemana} disabled={noWeekdays || modalViewMode} dias={info.weekdays}
            onChange={v => setEditingBudget(prev => prev ? { ...prev, almocoSemana: v } : prev)} />
          <RefeicaoRow label="Jantar" ariaLabel="Jantar em dias úteis (R$ total)" value={noWeekdays ? 0 : editingBudget.jantarSemana} disabled={noWeekdays || modalViewMode} dias={info.weekdays}
            onChange={v => setEditingBudget(prev => prev ? { ...prev, jantarSemana: v } : prev)} />
        </div>
      </div>

      <div className="mx-3.5 border-t border-dashed border-border" />

      {/* Sub-seção: Fins de Semana */}
      <div className="px-3.5 pt-2 pb-2.5 bg-warning-soft/30">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sun className="w-3 h-3 text-warning-strong" aria-hidden="true" />
          <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">Fim de Semana ({info.weekends})</span>
        </div>
        <div className="space-y-1.5 pl-3">
          <RefeicaoRow label="Almoço" ariaLabel="Almoço em fins de semana (R$ total)" value={noWeekends ? 0 : editingBudget.almocoFds} disabled={noWeekends || modalViewMode} dias={info.weekends}
            onChange={v => setEditingBudget(prev => prev ? { ...prev, almocoFds: v } : prev)} />
          <RefeicaoRow label="Jantar" ariaLabel="Jantar em fins de semana (R$ total)" value={noWeekends ? 0 : editingBudget.jantarFds} disabled={noWeekends || modalViewMode} dias={info.weekends}
            onChange={v => setEditingBudget(prev => prev ? { ...prev, jantarFds: v } : prev)} />
        </div>
      </div>
      </>)}
    </div>
  );
}

/** Linha "Almoço/Jantar — R$ total — R$/dia" do detalhe por refeição. */
function RefeicaoRow({ label, ariaLabel, value, disabled, dias, onChange }: {
  label: string; ariaLabel: string; value: number; disabled: boolean; dias: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xs text-slate-600 w-12 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-muted-foreground">R$</span>
        <CurrencyInput
          semEstilo className={inputCls}
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="text-2xs text-muted-foreground">total</span>
      </div>
      <span className="text-2xs text-muted-foreground ml-auto">
        {dias > 0 ? formatCurrency(Math.round(value / dias)) : "R$ 0"}/dia
      </span>
    </div>
  );
}

export function EditModalCustosTab(p: CustosTabProps) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-surface-muted">
    <div className="px-4 py-3 space-y-2.5" style={p.ctrl.modalViewMode ? { opacity: 0.72, userSelect: "none" } : {}}>
      <DiariasBlock {...p} />
      <MobilidadeBlock ctrl={p.ctrl} editingBudget={p.editingBudget} info={p.info} />
      <AlimentacaoBlock {...p} />
    </div>
    </div>
  );
}

export default EditModalCustosTab;
