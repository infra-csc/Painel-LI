// Campos do transporte terrestre (16/10) — os mesmos no modal da vaga e no lote.
//
// Regra do dono: van pede o nome da empresa e o valor; carro, só o valor.
// 21/10 ("aqui só carro e van, e na van tem que ter um valor total da van e
// não só por trecho"): só Carro e Van, e o valor é UM só, da viagem toda (os
// trechos marcados) — na van do lote, o total da van, dividido entre as vagas.
// Sem "por trecho" e sem "volta igual à ida": o valor já cobre ida e volta.
import { Car, Truck, BusFront, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import {
  MODOS_DE_REGISTRO,
  NOME_DO_MODO,
  reaisDoTerrestre,
  textoDasPernas,
  type CampoDoFormulario,
  type FormularioTerrestre,
  type ModoDeRegistro,
  type ModoTerrestre,
  type PernaDaViagem,
} from "@shared/transporte-terrestre";

/** Ícone de cada modo — o ônibus fica para os registros antigos (16 a 21/10). */
export const ICONE_DO_MODO: Record<ModoTerrestre, LucideIcon> = { carro: Car, van: Truck, onibus: BusFront };

/** O que o valor digitado vira, ao vivo (lote e van inteira). */
export interface PreviaDoValor {
  porVagaMin: number;
  porVagaMax: number;
  totalCentavos: number;
  vagas: number;
  /** O total foi dividido entre as vagas (senão, o valor é de cada vaga). */
  dividir: boolean;
  /** Vagas marcadas sem nenhum dos trechos marcados (ficam de fora). */
  fora?: number;
}

interface CamposDoTerrestreProps {
  valor: FormularioTerrestre;
  onChange: (patch: Partial<FormularioTerrestre>) => void;
  erros: Partial<Record<CampoDoFormulario, string>>;
  /** Pernas que a vaga tem; as que já têm passagem vêm em `bloqueadas`. */
  pernas: readonly PernaDaViagem[];
  bloqueadas?: Partial<Record<PernaDaViagem, string>>;
  /** "vaga" = o diálogo de uma vaga; "lote" = Aplicar em lote; "grupo" = a van inteira (no diálogo). */
  contexto: "vaga" | "lote" | "grupo";
  /** Lote: quantas vagas estão marcadas (liga o "De cada vaga | O total, dividido" do carro). */
  nVagas?: number;
  /** Lote e grupo: "R$ X por vaga" e o total, enquanto digita. */
  previa?: PreviaDoValor | null;
  /** Van inteira: os trechos de cada vaga não mudam aqui. */
  travarPernas?: boolean;
  /** Prefixo dos ids (dois formulários na tela não podem repetir id). */
  idBase: string;
  disabled?: boolean;
}

const ROTULO = "text-xs font-medium text-slate-600 mb-1.5 block";
const ERRO = " border-danger-strong focus-visible:ring-danger/25 bg-danger-soft/40";

function Erro({ msg, id }: { msg?: string; id: string }) {
  return msg ? <p id={id} className="m-0 mt-1 text-2xs leading-snug text-danger-strong" role="alert">{msg}</p> : null;
}

/** Carro | Van — botões de rádio (um clique, sem abrir lista). */
function EscolhaDoModo({ valor, onEscolher, erro, idBase, disabled }: {
  valor: ModoDeRegistro | ""; onEscolher: (m: ModoDeRegistro) => void; erro?: string; idBase: string; disabled?: boolean;
}) {
  return (
    <div>
      <p id={`${idBase}-rotulo`} className={ROTULO}>Como vai<RequiredMark /></p>
      <div
        role="radiogroup" aria-labelledby={`${idBase}-rotulo`} aria-invalid={!!erro || undefined}
        aria-describedby={erro ? `${idBase}-erro` : undefined}
        className={cn("grid grid-cols-2 gap-1 rounded-lg border bg-surface-muted p-1 sm:max-w-[320px]", erro ? "border-danger-strong" : "border-border")}
      >
        {MODOS_DE_REGISTRO.map((m) => {
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

/** O rótulo do valor e a frase que diz o que ele cobre. */
function textosDoValor(f: FormularioTerrestre, contexto: CamposDoTerrestreProps["contexto"], dividirCarro: boolean, nGrupo: number) {
  const cobre = textoDasPernas(f) || "a viagem";
  if (f.modo === "van") {
    if (contexto === "lote") return { rotulo: "Valor total da van", dica: `Um valor só para a van inteira: cobre ${cobre} e é dividido entre as vagas marcadas.` };
    if (contexto === "grupo") return { rotulo: "Valor total da van", dica: `A van inteira, dividida entre as ${nGrupo} vagas — cada uma nos trechos que já tem.` };
    return { rotulo: "Valor da van", dica: `O valor da van para esta vaga: cobre ${cobre}.` };
  }
  if (contexto === "grupo") return { rotulo: "Valor total do carro", dica: `O carro inteiro, dividido entre as ${nGrupo} vagas.` };
  if (contexto === "lote" && dividirCarro) return { rotulo: "Valor total do carro", dica: `Um carro para todos: cobre ${cobre} e é dividido entre as vagas marcadas.` };
  if (contexto === "lote") return { rotulo: "Valor do carro", dica: `De cada vaga (cada um com seu carro): cobre ${cobre}.` };
  return { rotulo: "Valor do carro", dica: `A viagem toda: cobre ${cobre}.` };
}

export default function CamposDoTerrestre({
  valor: f, onChange, erros, pernas, bloqueadas = {}, contexto, nVagas, previa, travarPernas, idBase, disabled,
}: CamposDoTerrestreProps) {
  const escolheDivisao = contexto === "lote" && f.modo === "carro" && (nVagas ?? 0) > 1;
  const dividirCarro = escolheDivisao && f.divisao === "dividir";
  const textos = f.modo ? textosDoValor(f, contexto, dividirCarro, previa?.vagas ?? 0) : null;
  const pedeEmpresa = f.modo === "van";

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
                key={p} type="button" aria-pressed={marcado} disabled={disabled || travarPernas || !!motivo}
                onClick={() => alternarPerna(p)} title={motivo}
                data-testid={`${idBase}-perna-${p}`}
                className={cn(
                  "pas-alvo inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                  marcado ? "border-primary/40 bg-brand-soft text-primary" : "border-border bg-card text-slate-600 hover:bg-surface-muted",
                  (motivo || travarPernas) && "opacity-60",
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
            {[bloqueadas.ida, bloqueadas.volta].filter(Boolean).join(" · ")}.
          </p>
        )}
        {travarPernas && <p className="m-0 mt-1 text-2xs text-muted-foreground">Os trechos de cada vaga continuam como estão.</p>}
        <Erro msg={erros.pernas} id={`${idBase}-pernas-erro`} />
      </div>

      <fieldset className="m-0 p-0 border-0 space-y-3" disabled={disabled}>
        <EscolhaDoModo
          valor={f.modo} onEscolher={(m) => onChange({ modo: m })}
          erro={erros.modo} idBase={`${idBase}-modo`} disabled={disabled}
        />

        {/* Lote de carro: cada um com seu carro (padrão) ou um carro para todos. */}
        {escolheDivisao && (
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

        {textos && (
          <div className="space-y-1.5">
            <div className={cn("grid gap-3", pedeEmpresa ? "sm:grid-cols-[minmax(0,1fr)_184px]" : "sm:grid-cols-[184px]")}>
              {pedeEmpresa && (
                <div>
                  <Label htmlFor={`${idBase}-empresa`} className={ROTULO}>Nome da empresa<RequiredMark /></Label>
                  <Input
                    id={`${idBase}-empresa`} value={f.empresa} disabled={disabled} maxLength={120}
                    onChange={(e) => onChange({ empresa: e.target.value })}
                    placeholder="Ex.: Transluz Transportes"
                    aria-invalid={!!erros.empresa || undefined} aria-required="true"
                    aria-describedby={erros.empresa ? `${idBase}-empresa-erro` : undefined}
                    className={cn("h-9", erros.empresa && ERRO)}
                    data-testid={`${idBase}-empresa`}
                  />
                  <Erro msg={erros.empresa} id={`${idBase}-empresa-erro`} />
                </div>
              )}
              <div>
                <Label htmlFor={`${idBase}-valor`} className={ROTULO}>{textos.rotulo}<RequiredMark /></Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden="true">R$</span>
                  <Input
                    id={`${idBase}-valor`} value={f.valor} disabled={disabled} inputMode="decimal" placeholder="0,00"
                    onChange={(e) => onChange({ valor: e.target.value })}
                    aria-invalid={!!erros.valor || undefined} aria-required="true"
                    aria-describedby={[`${idBase}-valor-dica`, erros.valor ? `${idBase}-valor-erro` : ""].filter(Boolean).join(" ")}
                    className={cn("h-9 pl-9 tabular-nums", erros.valor && ERRO)}
                    data-testid={`${idBase}-valor`}
                  />
                </div>
                <Erro msg={erros.valor} id={`${idBase}-valor-erro`} />
              </div>
            </div>
            <p id={`${idBase}-valor-dica`} className="m-0 text-2xs leading-snug text-muted-foreground" data-testid={`${idBase}-valor-dica`}>{textos.dica}</p>
          </div>
        )}
      </fieldset>

      {/* Ao vivo: quanto fica cada vaga e o total. */}
      {previa && previa.totalCentavos > 0 && (
        <p className="m-0 rounded-lg bg-surface-muted px-3 py-2 text-xs leading-relaxed text-slate-700 tabular-nums" aria-live="polite" data-testid={`${idBase}-total`}>
          <span className="font-semibold text-foreground whitespace-nowrap">
            {previa.porVagaMin === previa.porVagaMax ? reaisDoTerrestre(previa.porVagaMin) : `${reaisDoTerrestre(previa.porVagaMin)} a ${reaisDoTerrestre(previa.porVagaMax)}`}
          </span> por vaga
          {" · "}<span className="font-semibold text-foreground">{previa.vagas}</span> {previa.vagas === 1 ? "vaga" : "vagas"}
          {" · "}<span className="whitespace-nowrap">{previa.dividir ? "total" : "total do lote"}</span> <span className="font-semibold text-foreground whitespace-nowrap">{reaisDoTerrestre(previa.totalCentavos)}</span>
          {previa.dividir && previa.porVagaMin !== previa.porVagaMax && (
            <span className="block text-2xs text-muted-foreground">O centavo que não divide exato vai para as primeiras vagas; a soma bate com o total.</span>
          )}
          {!!previa.fora && (
            <span className="block text-2xs text-warning-strong">
              {previa.fora} {previa.fora === 1 ? "vaga marcada não tem" : "vagas marcadas não têm"} o trecho escolhido e {previa.fora === 1 ? "fica" : "ficam"} de fora.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
