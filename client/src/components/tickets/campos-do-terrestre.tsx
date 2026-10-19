// Campos do transporte terrestre (16/10) — os mesmos no modal da vaga e no lote.
//
// Regra do dono: van pede o nome da empresa e o valor; carro, só o valor.
// Ônibus fretado entra como a van. O valor é SEMPRE por trecho (ida ou volta)
// e a tela soma o total embaixo — "R$ 300" sem dizer se é ida e volta virava
// dúvida na primeira conferência.
import { Car, Truck, BusFront, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import {
  MODOS_TERRESTRES,
  NOME_DO_MODO,
  centavosDoTexto,
  dividirCentavos,
  modoPedeEmpresa,
  reaisDoTerrestre,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type ModoTerrestre,
  type PernaDaViagem,
} from "@shared/transporte-terrestre";

export const ICONE_DO_MODO: Record<ModoTerrestre, LucideIcon> = { carro: Car, van: Truck, onibus: BusFront };

interface CamposDoTerrestreProps {
  valor: FormularioTerrestre;
  onChange: (patch: Partial<FormularioTerrestre>) => void;
  erros: Partial<Record<CampoDoFormulario, string>>;
  /** Pernas que a vaga tem; as que já têm passagem vêm em `bloqueadas`. */
  pernas: readonly PernaDaViagem[];
  bloqueadas?: Partial<Record<PernaDaViagem, string>>;
  /** Lote: quantas vagas recebem (liga o "dividir o total"). */
  nVagas?: number;
  /** Prefixo dos ids (dois formulários na tela não podem repetir id). */
  idBase: string;
  disabled?: boolean;
}

const ROTULO = "text-xs font-medium text-slate-600 mb-1.5 block";
const ERRO = " border-danger-strong focus-visible:ring-danger/25 bg-danger-soft/40";

function Erro({ msg, id }: { msg?: string; id: string }) {
  return msg ? <p id={id} className="m-0 mt-1 text-2xs leading-snug text-danger-strong" role="alert">{msg}</p> : null;
}

/** Carro | Van | Ônibus — botões de rádio (um clique, sem abrir lista). */
function EscolhaDoModo({ valor, onEscolher, rotulo, erro, idBase, disabled }: {
  valor: ModoTerrestre | ""; onEscolher: (m: ModoTerrestre) => void; rotulo: string; erro?: string; idBase: string; disabled?: boolean;
}) {
  return (
    <div>
      <p id={`${idBase}-rotulo`} className={ROTULO}>{rotulo}<RequiredMark /></p>
      <div
        role="radiogroup" aria-labelledby={`${idBase}-rotulo`} aria-invalid={!!erro || undefined}
        aria-describedby={erro ? `${idBase}-erro` : undefined}
        className={cn("grid grid-cols-3 gap-1 rounded-lg border bg-surface-muted p-1", erro ? "border-danger-strong" : "border-border")}
      >
        {MODOS_TERRESTRES.map((m) => {
          const Icone = ICONE_DO_MODO[m];
          const ativo = valor === m;
          return (
            <button
              key={m} type="button" role="radio" aria-checked={ativo} disabled={disabled}
              onClick={() => onEscolher(m)}
              data-testid={`${idBase}-${m}`}
              className={cn(
                "pas-alvo inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                ativo ? "bg-card text-primary shadow-1" : "text-slate-600 hover:text-foreground",
              )}
            >
              <Icone className="w-4 h-4" aria-hidden="true" />{NOME_DO_MODO[m]}
            </button>
          );
        })}
      </div>
      <Erro msg={erro} id={`${idBase}-erro`} />
    </div>
  );
}

/** Empresa (van/ônibus) + valor de UMA perna (ou das duas, quando iguais). */
function BlocoDaPerna({ modo, empresa, valor, onEmpresa, onValor, erroEmpresa, erroValor, idBase, rotuloValor, disabled }: {
  modo: ModoTerrestre | ""; empresa: string; valor: string; onEmpresa: (v: string) => void; onValor: (v: string) => void;
  erroEmpresa?: string; erroValor?: string; idBase: string; rotuloValor: string; disabled?: boolean;
}) {
  const pedeEmpresa = modoPedeEmpresa(modo);
  return (
    <div className={cn("grid gap-3", pedeEmpresa ? "sm:grid-cols-[minmax(0,1fr)_168px]" : "sm:grid-cols-[168px]")}>
      {pedeEmpresa && (
        <div>
          <Label htmlFor={`${idBase}-empresa`} className={ROTULO}>Nome da empresa<RequiredMark /></Label>
          <Input
            id={`${idBase}-empresa`} value={empresa} disabled={disabled} maxLength={120}
            onChange={(e) => onEmpresa(e.target.value)}
            placeholder={modo === "van" ? "Ex.: Transluz Transportes" : "Ex.: Viação Cometa"}
            aria-invalid={!!erroEmpresa || undefined} aria-required="true"
            aria-describedby={erroEmpresa ? `${idBase}-empresa-erro` : undefined}
            className={cn("h-9", erroEmpresa && ERRO)}
            data-testid={`${idBase}-empresa`}
          />
          <Erro msg={erroEmpresa} id={`${idBase}-empresa-erro`} />
        </div>
      )}
      <div>
        <Label htmlFor={`${idBase}-valor`} className={ROTULO}>{rotuloValor}<RequiredMark /></Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden="true">R$</span>
          <Input
            id={`${idBase}-valor`} value={valor} disabled={disabled} inputMode="decimal" placeholder="0,00"
            onChange={(e) => onValor(e.target.value)}
            aria-invalid={!!erroValor || undefined} aria-required="true"
            aria-describedby={erroValor ? `${idBase}-valor-erro` : undefined}
            className={cn("h-9 pl-9 tabular-nums", erroValor && ERRO)}
            data-testid={`${idBase}-valor`}
          />
        </div>
        <Erro msg={erroValor} id={`${idBase}-valor-erro`} />
      </div>
    </div>
  );
}

export default function CamposDoTerrestre({ valor: f, onChange, erros, pernas, bloqueadas = {}, nVagas, idBase, disabled }: CamposDoTerrestreProps) {
  const lote = typeof nVagas === "number";
  const dividir = lote && f.divisao === "dividir" && (nVagas ?? 0) > 1;
  const ambas = f.ida && f.volta;
  const voltaPropria = ambas && !f.voltaIgual;
  // O bloco principal é a ida — ou a volta, quando só ela está marcada.
  const nomeDoBloco = voltaPropria ? "Ida" : null;
  const rotuloValor = (modo: ModoTerrestre | "") =>
    `${dividir ? "Total" : modo === "carro" ? "Valor do carro" : "Valor"} por trecho`;

  // Total: o que a vaga (ou o lote) soma com o que está digitado.
  const vIda = centavosDoTexto(f.valor) ?? 0;
  const vVolta = voltaPropria ? (centavosDoTexto(f.valorVolta) ?? 0) : vIda;
  const porPerna: Array<[string, number]> = [];
  if (f.ida) porPerna.push(["ida", vIda]);
  if (f.volta) porPerna.push(["volta", f.ida ? vVolta : vIda]);
  const totalDigitado = porPerna.reduce((s, [, v]) => s + v, 0);
  const n = nVagas ?? 1;
  const porVaga = dividir ? porPerna.reduce((s, [, v]) => s + (dividirCentavos(v, n)[n - 1] ?? 0), 0) : totalDigitado;
  const totalDoLote = dividir ? totalDigitado : totalDigitado * n;
  const divisaoInexata = dividir && porPerna.some(([, v]) => v % n !== 0);

  const alternarPerna = (p: PernaDaViagem) => onChange(p === "ida" ? { ida: !f.ida } : { volta: !f.volta });

  return (
    <div className="space-y-4">
      {/* Trechos */}
      <div>
        <p id={`${idBase}-pernas-rotulo`} className={ROTULO}>Trechos<RequiredMark /></p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${idBase}-pernas-rotulo`} aria-describedby={erros.pernas ? `${idBase}-pernas-erro` : undefined}>
          {(["ida", "volta"] as const).map((p) => {
            const existe = pernas.includes(p);
            const motivo = !existe ? `A vaga não tem ${p}` : bloqueadas[p];
            const marcado = p === "ida" ? f.ida : f.volta;
            return (
              <button
                key={p} type="button" aria-pressed={marcado} disabled={disabled || !!motivo}
                onClick={() => alternarPerna(p)} title={motivo}
                data-testid={`${idBase}-perna-${p}`}
                className={cn(
                  "pas-alvo inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                  marcado ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:bg-surface-muted",
                  motivo && "opacity-50",
                )}
              >
                <span className={cn("inline-flex items-center justify-center w-4 h-4 rounded border", marcado ? "bg-primary border-primary text-primary-foreground" : "border-slate-300 bg-card")} aria-hidden="true">
                  {marcado && <Check className="w-3 h-3" />}
                </span>
                {p === "ida" ? "Ida" : "Volta"}
                {motivo && <span className="sr-only"> — {motivo}</span>}
              </button>
            );
          })}
        </div>
        {(bloqueadas.ida || bloqueadas.volta) && (
          <p className="m-0 mt-1 text-2xs text-muted-foreground">
            {bloqueadas.ida ? "A ida" : "A volta"} já tem passagem registrada — só a outra perna pode ser terrestre.
          </p>
        )}
        <Erro msg={erros.pernas} id={`${idBase}-pernas-erro`} />
      </div>

      {/* Bloco principal (ida, ou a perna marcada) */}
      <fieldset className="m-0 p-0 border-0 space-y-3" disabled={disabled}>
        {nomeDoBloco && <legend className="text-2xs font-semibold uppercase tracking-[0.06em] text-primary mb-2">{nomeDoBloco}</legend>}
        <EscolhaDoModo
          valor={f.modo} onEscolher={(m) => onChange({ modo: m, ...(f.voltaIgual ? { modoVolta: m } : {}) })}
          rotulo="Como vai" erro={erros.modo} idBase={`${idBase}-modo`} disabled={disabled}
        />
        {f.modo && (
          <BlocoDaPerna
            modo={f.modo} empresa={f.empresa} valor={f.valor}
            onEmpresa={(v) => onChange({ empresa: v })} onValor={(v) => onChange({ valor: v })}
            erroEmpresa={erros.empresa} erroValor={erros.valor} idBase={`${idBase}-ida`}
            rotuloValor={rotuloValor(f.modo)} disabled={disabled}
          />
        )}
      </fieldset>

      {ambas && (
        <label className="pas-alvo flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none w-fit">
          <input
            type="checkbox" checked={f.voltaIgual} disabled={disabled}
            // Desmarcar começa a volta com o que a ida tem — só o que muda é digitado.
            onChange={(e) => onChange({
              voltaIgual: e.target.checked,
              ...(e.target.checked ? {} : { modoVolta: f.modoVolta || f.modo, empresaVolta: f.empresaVolta || f.empresa, valorVolta: f.valorVolta || f.valor }),
            })}
            className="w-4 h-4 rounded border-slate-300 accent-primary"
            data-testid={`${idBase}-volta-igual`}
          />
          Volta igual à ida (mesmo transporte e valor)
        </label>
      )}

      {voltaPropria && (
        <fieldset className="m-0 p-0 border-0 space-y-3 pt-3 border-t border-border" disabled={disabled}>
          <legend className="text-2xs font-semibold uppercase tracking-[0.06em] text-warning mb-2">Volta</legend>
          <EscolhaDoModo valor={f.modoVolta} onEscolher={(m) => onChange({ modoVolta: m })} rotulo="Como volta" erro={erros.modoVolta} idBase={`${idBase}-modo-volta`} disabled={disabled} />
          {f.modoVolta && (
            <BlocoDaPerna
              modo={f.modoVolta} empresa={f.empresaVolta} valor={f.valorVolta}
              onEmpresa={(v) => onChange({ empresaVolta: v })} onValor={(v) => onChange({ valorVolta: v })}
              erroEmpresa={erros.empresaVolta} erroValor={erros.valorVolta} idBase={`${idBase}-volta`}
              rotuloValor={rotuloValor(f.modoVolta)} disabled={disabled}
            />
          )}
        </fieldset>
      )}

      {/* Lote: o valor digitado é de cada vaga ou o total a dividir? */}
      {lote && (nVagas ?? 0) > 1 && (
        <div>
          <p id={`${idBase}-divisao-rotulo`} className={ROTULO}>O valor digitado é</p>
          <div role="radiogroup" aria-labelledby={`${idBase}-divisao-rotulo`} className="inline-flex flex-wrap rounded-lg border border-border bg-surface-muted p-0.5">
            {([
              { chave: "cada", rotulo: "De cada vaga" },
              { chave: "dividir", rotulo: `O total, dividido entre ${nVagas}` },
            ] as const).map((op) => (
              <button
                key={op.chave} type="button" role="radio" aria-checked={f.divisao === op.chave} disabled={disabled}
                onClick={() => onChange({ divisao: op.chave })}
                data-testid={`${idBase}-divisao-${op.chave}`}
                className={cn(
                  "pas-alvo h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  f.divisao === op.chave ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700",
                )}
              >
                {op.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Total ao vivo */}
      {totalDigitado > 0 && (
        <p className="m-0 rounded-lg bg-surface-muted px-3 py-2 text-xs text-slate-700 tabular-nums" aria-live="polite" data-testid={`${idBase}-total`}>
          {lote ? (
            <>
              <span className="font-semibold text-foreground">{reaisDoTerrestre(porVaga)}</span> por vaga
              {divisaoInexata && <span className="text-muted-foreground"> (os centavos que sobram vão para as primeiras vagas)</span>}
              {" · "}total do lote <span className="font-semibold text-foreground">{reaisDoTerrestre(totalDoLote)}</span>
            </>
          ) : (
            <>
              Total da vaga: <span className="font-semibold text-foreground">{reaisDoTerrestre(totalDigitado)}</span>
              {porPerna.length > 1 && <span className="text-muted-foreground"> (ida {reaisDoTerrestre(porPerna[0][1])} + volta {reaisDoTerrestre(porPerna[1][1])})</span>}
            </>
          )}
        </p>
      )}
    </div>
  );
}
