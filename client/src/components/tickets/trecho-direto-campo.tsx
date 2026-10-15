// "Vem direto de outro evento" no registro da passagem (09/10 — pinga-pinga).
//
// Compras CONFIRMA aqui o encadeamento que a logística/escalação indicou (ou
// que o sistema sugere): a ida desta vaga sai do evento de uma vaga anterior
// do MESMO colaborador, em outra cidade, que termina até 3 dias antes. Com o
// encadeamento gravado, a vaga anterior fica sem volta própria e as duas
// viagens deixam de "se cruzar". O custo do trecho é desta vaga (destino).
//
// Também mora aqui o bloqueio do servidor (409): a viagem cruza outra e não há
// encadeamento — sem "registrar mesmo assim" (decisão do dono); a saída é
// encadear (quando faz sentido) ou corrigir as datas.
import { useId } from "react";
import { AlertOctagon, ArrowRightLeft, CornerDownRight, Route } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SinalDeViagem } from "./use-sinais-de-viagem";
import { diaCurto } from "./use-sinais-de-viagem";

/** O 409 de POST/PATCH /api/tickets quando a viagem cruza outra (code "viagem_cruzada"). */
export interface BloqueioDeViagem {
  message: string;
  conflito?: { inclusionId: string; numero?: number; eventName?: string; cidade?: string; podeEncadear?: boolean } | null;
}

interface CampoProps {
  sid: string;
  sinal?: SinalDeViagem;
  /** Vaga escolhida como origem da ida ("" = não encadeada). */
  valor: string;
  disabled?: boolean;
  /** Texto da indicação de quem planejou ("vem direto de Night Run Aracaju"), se houver. */
  indicacao?: string | null;
  /** Vaga do evento indicado, quando ela existe para o colaborador (pré-seleção). */
  vagaIndicadaId?: string | null;
  onEscolher: (anterior: { inclusionId: string; cidade: string } | null) => void;
}

/** Bloco "De onde sai a ida" do formulário de passagem. */
export function TrechoDiretoCampo({ sid, sinal, valor, disabled, indicacao, vagaIndicadaId, onEscolher }: CampoProps) {
  const id = useId();
  const vizinhas = sinal?.vizinhasAnteriores ?? [];
  // A vaga já gravada pode não estar entre as vizinhas (datas mudaram): entra na lista assim mesmo.
  const gravada = valor && !vizinhas.some((v) => v.inclusionId === valor) && sinal?.vemDiretoDe?.inclusionId === valor
    ? [{ ...sinal.vemDiretoDe, dia: "" }]
    : [];
  const opcoes = [...vizinhas, ...gravada];
  const ligado = !!valor;
  const escolhida = opcoes.find((o) => o.inclusionId === valor);
  const sugerida = sinal?.podeIrDiretoDe ?? null;
  const preSelecionar = vagaIndicadaId && opcoes.some((o) => o.inclusionId === vagaIndicadaId) ? vagaIndicadaId : sugerida?.inclusionId ?? opcoes[0]?.inclusionId;

  const escolher = (inclusionId: string | null) => {
    if (!inclusionId) { onEscolher(null); return; }
    const o = opcoes.find((x) => x.inclusionId === inclusionId);
    onEscolher({ inclusionId, cidade: o?.cidade ?? "" });
  };

  if (opcoes.length === 0 && !indicacao) return null;
  return (
    <div className="mt-4 pt-3 border-t border-border" data-testid={`trecho-direto-${sid}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium text-slate-600 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-primary" aria-hidden="true" />De onde sai a ida
          </p>
          {indicacao && (
            <p className="m-0 mt-0.5 text-2xs text-slate-600" data-testid={`trecho-direto-indicacao-${sid}`}>
              Logística indicou: <strong className="font-semibold text-foreground">{indicacao}</strong>
            </p>
          )}
        </div>
        {/* Duas opções lado a lado: o comum e o trecho direto. */}
        <div className="flex w-full sm:inline-flex sm:w-auto rounded-lg border border-border bg-surface-muted p-0.5" role="radiogroup" aria-label="De onde sai a ida">
          {([
            { chave: "casa", rotulo: "Da cidade de origem", ativo: !ligado },
            { chave: "direto", rotulo: "Vem direto de outro evento", ativo: ligado },
          ] as const).map((op) => (
            <button
              key={op.chave}
              type="button"
              role="radio"
              aria-checked={op.ativo}
              disabled={disabled || (op.chave === "direto" && opcoes.length === 0)}
              onClick={() => escolher(op.chave === "direto" ? (valor || preSelecionar || null) : null)}
              className={`flex-1 sm:flex-none rounded-md px-3 min-h-8 py-1 leading-tight text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                op.ativo ? "bg-card text-primary shadow-1" : "text-muted-foreground hover:text-slate-700"}`}
              data-testid={`trecho-direto-opcao-${op.chave}-${sid}`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>
      </div>

      {opcoes.length === 0 && indicacao && (
        <p className="m-0 mt-2 text-2xs text-muted-foreground">
          Este colaborador não tem vaga em outra cidade terminando até 3 dias antes desta. Se a indicação valer, confira a escala do outro evento.
        </p>
      )}

      {ligado && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <div className="min-w-0">
            <Label htmlFor={`${id}-vaga`} className="text-xs font-medium text-slate-600 mb-1.5 block">Vaga de onde sai</Label>
            <Select value={valor} onValueChange={(v) => escolher(v)} disabled={disabled}>
              <SelectTrigger id={`${id}-vaga`} data-testid={`trecho-direto-vaga-${sid}`}><SelectValue placeholder="Escolha a vaga" /></SelectTrigger>
              <SelectContent>
                {opcoes.map((o) => (
                  <SelectItem key={o.inclusionId} value={o.inclusionId}>
                    #{o.numero} · {o.eventName}{o.cidade ? ` — ${o.cidade}` : ""}{o.dia ? ` · termina ${diaCurto(o.dia)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="m-0 sm:mt-6 text-2xs leading-relaxed text-slate-600 rounded-lg bg-brand-soft/60 border border-primary/15 px-3 py-2">
            A ida sai de <strong className="font-semibold text-foreground">{escolhida?.cidade || "o evento anterior"}</strong>.
            {" "}A vaga <strong className="font-semibold text-foreground">#{escolhida?.numero ?? "?"}</strong> fica sem volta própria — o trecho é custo deste evento.
          </p>
        </div>
      )}
    </div>
  );
}

/** O 409 do servidor, no topo da aba Dados — com a saída quando dá para encadear. */
export function BloqueioDeViagemAviso({ bloqueio, sid, disabled, onEncadear }: {
  bloqueio: BloqueioDeViagem;
  sid: string;
  disabled?: boolean;
  onEncadear?: () => void;
}) {
  const podeEncadear = !!bloqueio.conflito?.podeEncadear && !!onEncadear;
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/70 px-4 py-3" data-testid={`bloqueio-viagem-${sid}`}>
      <p className="m-0 flex items-start gap-2 text-sm font-semibold text-danger-strong">
        <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />Esta viagem cruza outra viagem do colaborador
      </p>
      <p className="m-0 mt-1 pl-6 text-xs leading-relaxed text-foreground">{bloqueio.message}</p>
      <div className="mt-2 pl-6 flex flex-wrap items-center gap-2">
        {podeEncadear && (
          <button
            type="button"
            onClick={onEncadear}
            disabled={disabled}
            className="pas-alvo inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`bloqueio-encadear-${sid}`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />Registrar como trecho direto
          </button>
        )}
        <span className="text-2xs text-muted-foreground">
          {podeEncadear ? "Ou corrija as datas da ida." : "Corrija as datas ou o encadeamento — viagem sobreposta não é registrada."}
        </span>
      </div>
    </div>
  );
}

/** Vaga ANTERIOR de um trecho direto: "volta: segue direto para #Y" — sem volta própria. */
export function SegueDiretoAviso({ sinal, sid }: { sinal?: SinalDeViagem; sid: string }) {
  const segue = sinal?.segueDiretoPara;
  if (!segue?.confirmado) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-brand-soft/60 px-4 py-2.5 flex items-start gap-2" data-testid={`segue-direto-${sid}`}>
      <CornerDownRight className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      <p className="m-0 text-xs leading-relaxed text-foreground">
        <strong className="font-semibold">Volta: segue direto para #{segue.numero} · {segue.eventName}.</strong>{" "}
        <span className="text-slate-600">Esta vaga não tem volta própria — o trecho {segue.cidade ? `para ${segue.cidade} ` : ""}é a ida de lá (e o custo também).</span>
      </p>
    </div>
  );
}
