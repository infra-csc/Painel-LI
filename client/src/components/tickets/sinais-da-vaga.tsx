// Sinais de viagem numa linha de Passagens (09/10 — caso Alonso: Night Run
// Aracaju → Makai João Pessoa). Três famílias, cada uma no seu lugar:
//  - PROBLEMA (vermelho): a viagem cruza outra do colaborador sem encadeamento,
//    ou a passagem tem data impossível — o que a Pendências lista;
//  - TRECHO DIRETO confirmado (marca): "ida direto de #4045 · Aracaju" /
//    "volta: segue direto para #4238 · Makai João Pessoa" — sem volta própria;
//  - SUGESTÃO para Compras (vaga sem passagem): "Pode ir direto de Aracaju" com
//    o botão "Registrar trecho direto", que abre o modal já encadeado.
import { AlertTriangle, CornerDownRight, Route } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { textoDaIndicacao } from "@shared/janela-de-viagem";
import type { SinalDeViagem } from "./use-sinais-de-viagem";
import { diaCurto } from "./use-sinais-de-viagem";

const PILULA = "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap max-w-full";

/** Problemas da viagem (vermelho): cruza outra viagem · data impossível. */
export function ProblemasDaViagem({ sinal, inclusionId }: { sinal?: SinalDeViagem; inclusionId: string }) {
  const cruza = sinal?.cruzaCom ?? [];
  if (cruza.length === 0 && !sinal?.dataImpossivel) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {cruza.slice(0, 2).map((c) => (
        <span
          key={c.inclusionId}
          className={`${PILULA} bg-danger-soft text-danger-strong`}
          title={`A viagem desta vaga cruza com a da vaga #${c.numero} (${c.eventName}) do mesmo colaborador. Se for direto de uma para a outra, registre como trecho direto.`}
          data-testid={`ticket-cruza-${inclusionId}`}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">Viagem cruza com #{c.numero}</span>
        </span>
      ))}
      {sinal?.dataImpossivel && (
        <span className={`${PILULA} bg-danger-soft text-danger-strong`} data-testid={`ticket-data-impossivel-${inclusionId}`}>
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{sinal.dataImpossivel}</span>
        </span>
      )}
    </div>
  );
}

/** Trecho direto confirmado por Compras (ou a vaga anterior/seguinte dele). */
export function TrechoDiretoDaVaga({ sinal, inclusionId }: { sinal?: SinalDeViagem; inclusionId: string }) {
  const vem = sinal?.vemDiretoDe?.confirmado ? sinal.vemDiretoDe : null;
  const segue = sinal?.segueDiretoPara?.confirmado ? sinal.segueDiretoPara : null;
  if (!vem && !segue) return null;
  return (
    <div className="flex flex-col gap-0.5 mt-1 text-2xs leading-4 text-primary" data-testid={`ticket-trecho-direto-${inclusionId}`}>
      {vem && (
        <span className="inline-flex items-start gap-1 min-w-0" title={`A ida sai de ${vem.cidade || vem.eventName} — trecho direto vindo da vaga #${vem.numero} (${vem.eventName}).`}>
          <Route className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">Ida direto de <strong className="font-semibold">#{vem.numero}</strong>{vem.cidade ? ` · ${vem.cidade}` : ""}</span>
        </span>
      )}
      {segue && (
        <span className="inline-flex items-start gap-1 min-w-0" title={`Sem volta própria: segue direto para a vaga #${segue.numero} (${segue.eventName}). O trecho é custo de lá.`}>
          <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">Volta: segue direto para <strong className="font-semibold">#{segue.numero}</strong> · {segue.eventName}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Sugestão para Compras na vaga SEM passagem: "Pode ir direto de Aracaju
 * (Night Run Aracaju termina 25/10)" + "Registrar trecho direto". Na vaga
 * anterior, o inverso, só informativo: "Segue para João Pessoa em 26/10".
 */
export function SugestaoDeTrechoDireto({ sinal, inclusionId, podeRegistrar, onRegistrar, onBuscarPrecos }: {
  sinal?: SinalDeViagem;
  inclusionId: string;
  podeRegistrar: boolean;
  onRegistrar?: (anteriorId: string) => void;
  /** "Buscar preços do trecho direto" (09/10): só a ida, da cidade do evento anterior. */
  onBuscarPrecos?: (anteriorId: string) => void;
}) {
  const de = sinal?.podeIrDiretoDe;
  const segue = !sinal?.segueDiretoPara?.confirmado ? sinal?.seguePara : null;
  if (!de && !segue) return null;
  return (
    <div className="flex flex-col items-start gap-1 mt-1">
      {de && (
        <div className="rounded-md border border-primary/20 bg-brand-soft/60 px-2 py-1.5 max-w-full" data-testid={`sugestao-trecho-direto-${inclusionId}`}>
          <p className="m-0 flex items-start gap-1 text-2xs leading-4 text-foreground">
            <Route className="w-3 h-3 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-semibold">Pode ir direto de {de.cidade || de.eventName}</span>
              <span className="text-muted-foreground"> ({de.eventName} termina {diaCurto(de.dia)}){de.indicadoPelaLogistica ? " · indicado pela logística" : ""}</span>
            </span>
          </p>
          {podeRegistrar && onRegistrar && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRegistrar(de.inclusionId); }}
              className="pas-alvo mt-1.5 flex w-full items-center justify-center gap-1 h-7 px-1.5 rounded-md bg-card border border-primary/30 text-2xs font-semibold whitespace-nowrap text-primary hover:bg-primary hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`registrar-trecho-direto-${inclusionId}`}
            >
              Registrar trecho direto
            </button>
          )}
          {onBuscarPrecos && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBuscarPrecos(de.inclusionId); }}
              className="pas-alvo mt-1 flex w-full items-center justify-center gap-1 h-7 px-1.5 rounded-md text-2xs font-medium whitespace-nowrap text-primary hover:bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`buscar-precos-trecho-direto-${inclusionId}`}
            >
              Buscar preços do trecho direto
            </button>
          )}
        </div>
      )}
      {segue && (
        <span className="inline-flex items-start gap-1 text-2xs leading-4 text-muted-foreground" data-testid={`segue-para-${inclusionId}`}>
          <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>Segue para {segue.cidade || segue.eventName} em {diaCurto(segue.dia)} (#{segue.numero})</span>
        </span>
      )}
    </div>
  );
}

/** O que quem planejou indicou na vaga ("Logística indicou: vem direto de X"). */
export function IndicacaoDaLogistica({ inclusion, nomeDoEvento, className }: {
  inclusion: Pick<TeamInclusion, "id" | "trechosSugeridos" | "idaVemDoEventoId" | "voltaSegueParaEventoId">;
  nomeDoEvento: (id: string) => string | null | undefined;
  className?: string;
}) {
  const partes = textoDaIndicacao(inclusion, nomeDoEvento);
  if (partes.length === 0) return null;
  return (
    <p className={`m-0 flex items-start gap-1 text-2xs leading-4 text-slate-600 ${className ?? ""}`} data-testid={`indicacao-logistica-${inclusion.id}`}>
      <Route className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">Logística indicou: {partes.join(" · ")}</span>
    </p>
  );
}
