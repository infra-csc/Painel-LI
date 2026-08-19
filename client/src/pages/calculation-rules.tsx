import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import {
  Calculator, Home, Briefcase, Hammer, Bike, Info, UtensilsCrossed, Bus, TrendingDown, Settings,
} from "lucide-react";
import {
  calcDeflatedDailies, deflationFactorsFromSettings, type DeflationFactors,
  CASA_DAILY_RATES, CASA_FOOD_2026, MOBILITY_2026,
  FREELA_DAILY_RATES, FREELA_EXTRA_DAY_ALLOWANCE,
  PERCURSEIRO_TIPOS, percurseiroDiariaCents, type PercurseiroDiaria,
  CASA_SETTING_KEYS, FREELA_SETTING_KEYS,
} from "@shared/calculation-rules";
import {
  CENO_FREELA_TIPOS, CENO_FREELA_TIPO_LABELS, CENO_EMPREITA_TABLE_DAYS,
  CENO_EMPREITA_DEFAULTS, cenoEmpreitaRow,
} from "@shared/cenotecnica-empreita";

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
  usePageTitle("Regras de Cálculo");
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
        // Key Account / Gerente (regra 18/08): R$ 44 por refeição por padrão
        gestaoCents: effectiveCents(settings, isAlmoco ? "alimentacao_almoco_gestao" : "alimentacao_jantar_gestao", 4400),
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
        <PageHeader
          icon={Calculator}
          title="Regras de Cálculo"
          subtitle="Tabelas de referência — valores vigentes dos Valores Padrão, base 2026 — para diárias, alimentação e mobilidade, com a régua de deflação por período"
        />

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
          {tab === "empreita" && <EmpreitaTab settings={settings} />}
          {tab === "percurseiro" && <PercurseiroTab settings={settings} />}
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

function RateTable({ rows, headers }: { rows: ReactNode[][]; headers: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
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

type FoodRow = { refeicao: string; demaisCents: number; cenotecnicaCents: number; gestaoCents: number };
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
              headers={["Em jornada externa", "Demais", "Cenotécnica", "Key Account / Gerente"]}
              rows={food.jornadaExterna.map(f => [f.refeicao, fmt(f.demaisCents), fmt(f.cenotecnicaCents), fmt(f.gestaoCents)])}
            />
            <RateTable
              headers={["Em viagem", "Demais", "Cenotécnica", "Key Account / Gerente"]}
              rows={food.emViagem.map(f => [f.refeicao, fmt(f.demaisCents), fmt(f.cenotecnicaCents), fmt(f.gestaoCents)])}
            />
            <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-gray-50">
              Valor vigente (editável no Valores Padrão). Executivo de Contas = Demais (R$ 40); Key Account e Gerente = R$ 44 por refeição.
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

/** Célula da tabela de empreita: valor vigente, com o valor do slide riscado quando editado. */
function EmpreitaCell({ cents, padraoCents }: { cents: number; padraoCents: number }) {
  if (cents === padraoCents) return <>{fmt(cents)}</>;
  return (
    <span className="inline-flex flex-col items-end leading-tight" title={`Padrão do slide: ${fmt(padraoCents)}`}>
      <span className="text-amber-700">{fmt(cents)}</span>
      <span className="text-[10px] font-normal text-slate-400 line-through">{fmt(padraoCents)}</span>
    </span>
  );
}

function EmpreitaTab({ settings }: { settings?: SystemSettings }) {
  // Valores VIGENTES (Valores Padrão), com fallback na tabela do slide 19/08
  const linhas = CENO_FREELA_TIPOS.map(tipo => {
    const row = cenoEmpreitaRow(tipo, settings);
    return {
      tipo,
      label: CENO_FREELA_TIPO_LABELS[tipo],
      row,
      incremento: Math.round((row[6] - row[2]) / 4),
      editada: CENO_EMPREITA_TABLE_DAYS.some(d => row[d] !== CENO_EMPREITA_DEFAULTS[tipo][d]),
    };
  });
  const algumaEditada = linhas.some(l => l.editada);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Cenotécnicos em regime de <span className="font-bold">empreita</span> recebem <span className="font-bold">valor fechado</span> conforme
          a modalidade e o número de dias — não é diária × dias, e a deflação por período <span className="font-bold">não se aplica</span> (já está embutida na proposta).
        </p>
      </div>
      <Card title="Valor fechado por modalidade e nº de dias" icon={Hammer} accent="text-cyan-600">
        <RateTable
          headers={["Modalidade", ...CENO_EMPREITA_TABLE_DAYS.map(d => `${d} dias`), "Incremento/dia"]}
          rows={linhas.map(l => [
            l.label,
            ...CENO_EMPREITA_TABLE_DAYS.map(d => (
              <EmpreitaCell key={d} cents={l.row[d]} padraoCents={CENO_EMPREITA_DEFAULTS[l.tipo][d]} />
            )),
            <span className="text-slate-500">{fmt(l.incremento)}</span>,
          ])}
        />
        <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-gray-50">
          Valores vigentes (editáveis no{" "}
          <Link href="/system-settings" className="font-semibold underline underline-offset-2 hover:text-slate-600">
            Valores Padrão
          </Link>
          ).{algumaEditada && (
            <span className="text-amber-700"> Em âmbar, o valor aplicado hoje; riscado, o valor original do slide.</span>
          )}
        </p>
      </Card>
      <Card title="Como a regra é aplicada" icon={Info} accent="text-slate-500">
        <ul className="px-5 py-4 space-y-2 text-xs text-slate-600 list-disc list-inside marker:text-slate-300">
          <li>
            A <span className="font-semibold">modalidade</span> (Viagem, SP, Local A ou Local B) é escolhida na{" "}
            <span className="font-semibold">Escalação</span>, vaga por vaga — não vem da função nem do evento.
          </li>
          <li>
            Fora da faixa de 2 a 6 dias (1 dia, ou 7 e mais) o valor é <span className="font-semibold">extrapolado</span> pelo
            incremento da própria modalidade — a coluna "Incremento/dia" acima.
          </li>
          <li>
            Cenotécnico <span className="font-semibold">de casa (CLT)</span> continua sem diária: a tabela vale só para quem não é casa.
          </li>
          <li>
            <span className="font-semibold">Alimentação e mobilidade</span> seguem as regras normais e{" "}
            <span className="font-semibold">não estão dentro</span> do valor fechado — que cobre apenas a mão de obra.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function PercurseiroTab({ settings }: { settings?: SystemSettings }) {
  // Valores VIGENTES (Valores Padrão), com fallback na tabela do usuário 17/08
  const tipos = PERCURSEIRO_TIPOS.map(t => ({ label: t.label, d: percurseiroDiariaCents(t.value, settings)! }));
  const linhas: { label: string; get: (d: PercurseiroDiaria) => string }[] = [
    { label: "Motoqueiro", get: d => fmt(d.motoqueiro) },
    { label: "Fee Ivan (15%)", get: d => fmt(d.fee) },
    { label: "Alimentação (3 refeições)", get: d => fmt(d.alimentacao) },
    { label: "Ajuda de custo transporte", get: d => fmt(d.transporte) },
    { label: "NF (16%)", get: d => fmt(d.nf) },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Motoqueiros: pacote <span className="font-bold">fixo por tipo</span> e sempre com emissão de NF. Em <span className="font-bold">viagem</span> (com passagem) são sempre 2 diárias, independente do período; <span className="font-bold">local</span> (SP/Grande SP) é 1 diária. Alimentação e mobilidade já estão dentro do pacote (não entram no Planejado).
        </p>
      </div>
      <Card title="Motoqueiros em viagem (2 diárias)" icon={Bike} accent="text-cyan-600">
        <RateTable
          headers={["Composição", ...tipos.map(t => t.label)]}
          rows={[
            ...linhas.map(l => [l.label, ...tipos.map(t => l.get(t.d))]),
            ["Total por diária", ...tipos.map(t => fmt(t.d.total))],
            ["Em viagem (2 diárias)", ...tipos.map(t => fmt(t.d.total * 2))],
          ]}
        />
        <div className="flex items-start gap-2 px-4 py-3 border-t border-gray-50 bg-amber-50/50">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700">
            Os 16% de NF não são deriváveis das demais parcelas (16% do subtotal daria R$ 153,12) — o valor da NF
            vem da tabela confirmada em 17/08 e é editável nos Valores Padrão, junto com as demais parcelas.
          </p>
        </div>
      </Card>
    </div>
  );
}
