import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Calculator, Home, Briefcase, Hammer, Bike, Info, UtensilsCrossed, Bus, TrendingDown, Settings,
} from "lucide-react";
import {
  calcDeflatedDailies, deflationFactorsFromSettings, type DeflationFactors,
  CASA_DAILY_RATES, CASA_FOOD_2026, MOBILITY_2026,
  FREELA_DAILY_RATES, FREELA_EXTRA_DAY_ALLOWANCE,
  EMPREITA_CLOSED_VALUES, PERCURSEIRO_TYPES,
  CASA_SETTING_KEYS, FREELA_SETTING_KEYS,
} from "@shared/calculation-rules";

type SystemSettings = Record<string, number>;

/** Valor vigente de uma tarifa: settings do Valores Padrão com fallback na constante 2026. */
function effectiveCents(settings: SystemSettings | undefined, key: string, fallback: number): number {
  const v = settings?.[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Chave editável (Valores Padrão) correspondente a cada linha das tabelas exibidas. */
const CASA_RATE_KEYS: Record<string, string> = {
  "Dir. Prova": CASA_SETTING_KEYS.dirProva,
  "Produtor (Produção, Ativação, Kit, SupCeno)": CASA_SETTING_KEYS.produtor,
  "Executivo Vendas O2 Prime": CASA_SETTING_KEYS.execVendas,
  "Atendimento (Key Account)": "atendimento_key_account",
  "Atendimento (Executivo de Contas)": "atendimento_executivo_contas",
};
const FREELA_RATE_KEYS: Record<string, string> = {
  "Produtor / Sup Ceno / Kit / Ativação / Percurso — Local": FREELA_SETTING_KEYS.local,
  "Produtor / Sup Ceno / Kit / Ativação / Percurso — em viagem": FREELA_SETTING_KEYS.viagem,
  "Dir de Prova": FREELA_SETTING_KEYS.dirProva,
};

function fmt(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const TABS = [
  { id: "casa", label: "Time da Casa", icon: Home },
  { id: "freela", label: "Time Freela", icon: Briefcase },
  { id: "empreita", label: "Cenotécnicos Empreita", icon: Hammer },
  { id: "percurseiro", label: "Percurseiro", icon: Bike },
] as const;

export default function CalculationRulesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("casa");

  // Valores vigentes: mesmos settings que o motor de cálculo usa (Valores Padrão)
  const { data: settings } = useQuery<SystemSettings>({ queryKey: ["/api/system-settings"] });
  const factors = useMemo(() => deflationFactorsFromSettings(settings), [settings]);

  const casaRates = useMemo(
    () => CASA_DAILY_RATES.map(r => ({ funcao: r.funcao, cents: effectiveCents(settings, CASA_RATE_KEYS[r.funcao], r.cents) })),
    [settings],
  );
  const freelaRates = useMemo(
    () => FREELA_DAILY_RATES.map(r => ({ funcao: r.funcao, cents: effectiveCents(settings, FREELA_RATE_KEYS[r.funcao], r.cents) })),
    [settings],
  );

  // Alimentação: mesmo padrão das outras tabelas — valor vigente dos Valores
  // Padrão (alimentacao_*) com fallback nas constantes 2026 do slide.
  const casaFood = useMemo(() => {
    const mapRow = (f: { refeicao: string; demaisCents: number; cenotecnicaCents: number }) => {
      const isAlmoco = f.refeicao.toLowerCase().startsWith("almoço");
      return {
        refeicao: f.refeicao,
        demaisCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco" : "alimentacao_jantar", f.demaisCents),
        cenotecnicaCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco_ceno" : "alimentacao_jantar_ceno", f.cenotecnicaCents),
      };
    };
    return {
      jornadaExterna: CASA_FOOD_2026.jornadaExterna.map(mapRow),
      emViagem: CASA_FOOD_2026.emViagem.map(mapRow),
    };
  }, [settings]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
              <Calculator className="w-4 h-4 text-cyan-600" />
            </div>
            Regras de Cálculo
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 ml-10">
            Tabelas de referência — valores vigentes dos Valores Padrão, base 2026 — para diárias, alimentação e mobilidade, com a régua de deflação por período
          </p>
        </div>

        {/* Fonte dos valores aplicados */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
          <Settings className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            Esta página é referência. Os valores aplicados no cálculo vêm dos{" "}
            <Link href="/system-settings" className="font-bold underline underline-offset-2 hover:text-blue-900">
              Valores Padrão
            </Link>
            . As tarifas e fatores abaixo já refletem o valor vigente configurado lá.
          </p>
        </div>

        {/* Tabs (padrão ARIA completo: id/aria-controls, roving tabindex e setas) */}
        <div role="tablist" aria-label="Regimes de contratação" className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
          {TABS.map((t, idx) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={e => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const next = e.key === "ArrowRight"
                  ? (idx + 1) % TABS.length
                  : (idx + TABS.length - 1) % TABS.length;
                setTab(TABS[next].id);
                document.getElementById(`tab-${TABS[next].id}`)?.focus();
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "casa" && <CasaTab rates={casaRates} food={casaFood} factors={factors} />}
          {tab === "freela" && <FreelaTab rates={freelaRates} factors={factors} />}
          {tab === "empreita" && <EmpreitaTab />}
          {tab === "percurseiro" && <PercurseiroTab />}
        </div>
      </div>
    </div>
  );
}

// ── Blocos reutilizáveis ──────────────────────────────────────────────────────

function Card({ title, icon: Icon, children, accent = "text-slate-500" }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        {Icon && <Icon className={`w-4 h-4 ${accent}`} />}
        <p className="text-[13px] font-bold text-slate-700">{title}</p>
      </div>
      {children}
    </div>
  );
}

function RateTable({ rows, headers }: { rows: (string | number)[][]; headers: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={`font-bold px-4 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-slate-50/60">
              {r.map((cell, ci) => (
                <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? "text-slate-600 font-medium" : "text-right font-mono font-semibold text-slate-700 whitespace-nowrap"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Faixas de deflação para exibição, montadas com os fatores vigentes. */
function deflationTiersDisplay(factors: DeflationFactors) {
  return [
    { label: "até 4 dias", factor: factors.ate4 },
    { label: "do 5º ao 8º dia", factor: factors.d5a8 },
    { label: "a partir do 9º dia", factor: factors.d9mais },
  ];
}

function DeflationBanner({ factors }: { factors: DeflationFactors }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
      <TrendingDown className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-xs text-amber-800">
        <p className="font-bold mb-1">Regra de deflação por período (aplicada por dia trabalhado)</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {deflationTiersDisplay(factors).map(t => (
            <span key={t.label}>
              <span className="font-semibold">{t.label}:</span> {Math.round(t.factor * 100)}% da diária
            </span>
          ))}
        </div>
        <p className="mt-1 text-amber-600">Fatores vigentes (editáveis no Valores Padrão).</p>
      </div>
    </div>
  );
}

/** Calculadora de diárias com deflação (casa e freela), com os fatores vigentes. */
function DeflationCalculator({ rates, factors }: { rates: readonly { funcao: string; cents: number }[]; factors: DeflationFactors }) {
  const [funcIdx, setFuncIdx] = useState(0);
  const [days, setDays] = useState(4);
  const rate = rates[funcIdx];

  const result = useMemo(() => calcDeflatedDailies(rate.cents, days, factors), [rate, days, factors]);
  const noDeflation = rate.cents * days;

  return (
    <Card title="Calculadora de diárias com deflação" icon={Calculator} accent="text-cyan-600">
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Função</label>
            <select
              value={funcIdx}
              onChange={e => setFuncIdx(Number(e.target.value))}
              className="w-full h-9 text-xs rounded-lg border border-gray-200 px-2 bg-white text-slate-700 focus:outline-none focus:border-cyan-400"
            >
              {rates.map((r, i) => (
                <option key={r.funcao} value={i}>{r.funcao} — {fmt(r.cents)}/dia</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Dias de evento</label>
            <input
              type="number" min={1} max={30} value={days}
              onChange={e => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full h-9 text-xs rounded-lg border border-gray-200 px-3 bg-white text-slate-700 font-mono focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <div className="space-y-1.5">
            {result.segments.map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  {s.days} {s.days === 1 ? "dia" : "dias"} × {fmt(s.dailyCents)}
                  <span className="text-slate-400 ml-1.5">({s.label} — {Math.round(s.factor * 100)}%)</span>
                </span>
                <span className="font-mono font-semibold text-slate-700">{fmt(s.totalCents)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-700">Total das diárias</span>
            <span className="font-mono font-bold text-base text-cyan-700">{fmt(result.totalCents)}</span>
          </div>
          {result.totalCents !== noDeflation && (
            <p className="text-[11px] text-emerald-600 text-right mt-1">
              Economia da deflação: {fmt(noDeflation - result.totalCents)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function MobilityCard() {
  return (
    <Card title="Ajuda de custo — mobilidade (deslocamento aeroporto, por trecho)" icon={Bus} accent="text-blue-600">
      <RateTable
        headers={["Situação", "Valor"]}
        rows={MOBILITY_2026.map(m => [m.faixa, fmt(m.cents)])}
      />
    </Card>
  );
}

// ── Abas ─────────────────────────────────────────────────────────────────────

type TabRatesProps = { rates: { funcao: string; cents: number }[]; factors: DeflationFactors };

type FoodRow = { refeicao: string; demaisCents: number; cenotecnicaCents: number };
type CasaFood = { jornadaExterna: FoodRow[]; emViagem: FoodRow[] };

function CasaTab({ rates, food, factors }: TabRatesProps & { food: CasaFood }) {
  return (
    <div className="space-y-4">
      <DeflationBanner factors={factors} />
      <DeflationCalculator rates={rates} factors={factors} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Horas eventos — diárias por função" icon={Home} accent="text-cyan-600">
          <RateTable
            headers={["Função", "Valor/dia"]}
            rows={rates.map(r => [r.funcao, fmt(r.cents)])}
          />
          <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-gray-50">
            Valor vigente (editável no Valores Padrão).
          </p>
        </Card>
        <div className="space-y-4">
          <Card title="Alimentação" icon={UtensilsCrossed} accent="text-emerald-600">
            <RateTable
              headers={["Em jornada externa", "Demais", "Cenotécnica"]}
              rows={food.jornadaExterna.map(f => [f.refeicao, fmt(f.demaisCents), fmt(f.cenotecnicaCents)])}
            />
            <RateTable
              headers={["Em viagem", "Demais", "Cenotécnica"]}
              rows={food.emViagem.map(f => [f.refeicao, fmt(f.demaisCents), fmt(f.cenotecnicaCents)])}
            />
            <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-gray-50">
              Valor vigente (editável no Valores Padrão).
            </p>
          </Card>
          <MobilityCard />
        </div>
      </div>
    </div>
  );
}

function FreelaTab({ rates, factors }: TabRatesProps) {
  return (
    <div className="space-y-4">
      <DeflationBanner factors={factors} />
      <DeflationCalculator rates={rates} factors={factors} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Horas eventos — valores de diária" icon={Briefcase} accent="text-cyan-600">
          <RateTable
            headers={["Função", "Valor/dia"]}
            rows={rates.map(r => [r.funcao, fmt(r.cents)])}
          />
          <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-gray-50">
            Valor vigente (editável no Valores Padrão).
          </p>
        </Card>
        <div className="space-y-4">
          <Card title="Ajuda de custo — deslocamento em dias adicionais (frilas)" icon={Bus} accent="text-orange-500">
            <RateTable
              headers={["Situação", "Valor"]}
              rows={FREELA_EXTRA_DAY_ALLOWANCE.map(a => [a.situacao, fmt(a.cents)])}
            />
          </Card>
          <MobilityCard />
        </div>
      </div>
    </div>
  );
}

function EmpreitaTab() {
  const DIAS = [2, 3, 4, 5, 6] as const;
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Cenotécnicos em regime de <span className="font-bold">empreita</span> recebem <span className="font-bold">valor fechado</span> conforme
          a modalidade e o número de dias — a deflação já está embutida na proposta, não se aplica novamente.
        </p>
      </div>
      <Card title="Proposta de valor fechado por modalidade" icon={Hammer} accent="text-cyan-600">
        <RateTable
          headers={["Modalidade", ...DIAS.map(d => `${d} dias`)]}
          rows={EMPREITA_CLOSED_VALUES.map(m => [
            m.modalidade,
            ...DIAS.map(d => fmt((m.porDias as Record<number, number>)[d])),
          ])}
        />
      </Card>
    </div>
  );
}

function PercurseiroTab() {
  const linhas: { label: string; get: (t: (typeof PERCURSEIRO_TYPES)[number]) => string }[] = [
    { label: "Motoqueiro", get: t => fmt(t.motoqueiroCents) },
    { label: "Fee Ivan (15%)", get: t => fmt(t.feeIvanCents) },
    { label: "Alimentação (3 refeições)", get: t => fmt(t.alimentacaoCents) },
    { label: "Ajuda de custo transporte", get: t => fmt(t.transporteCents) },
    { label: "NF (16%) — proposta", get: t => fmt(t.nfPropostaCents) },
    { label: "NF (16%) — planilha base", get: t => fmt(t.nfPlanilhaCents) },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Motoqueiros em viagem: valor <span className="font-bold">fixo por tipo, sempre 2 diárias</span> e sempre com emissão de NF.
        </p>
      </div>
      <Card title="Motoqueiros em viagem (2 diárias)" icon={Bike} accent="text-cyan-600">
        <RateTable
          headers={["Composição", ...PERCURSEIRO_TYPES.map(t => t.tipo)]}
          rows={[
            ...linhas.map(l => [l.label, ...PERCURSEIRO_TYPES.map(t => l.get(t))]),
            ["Total — proposta", ...PERCURSEIRO_TYPES.map(t => fmt(t.totalPropostaCents))],
            ["Total — planilha base", ...PERCURSEIRO_TYPES.map(t => fmt(t.totalPlanilhaCents))],
          ]}
        />
        <div className="flex items-start gap-2 px-4 py-3 border-t border-gray-50 bg-amber-50/50">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            O slide de origem aponta divergência no cálculo dos 16% de NF entre a proposta e a planilha base —
            os dois valores ficam registrados aqui até a definição final.
          </p>
        </div>
      </Card>
    </div>
  );
}
