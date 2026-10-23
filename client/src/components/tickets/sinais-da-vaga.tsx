// Sinais de viagem numa linha de Passagens (09/10 — caso Alonso: Night Run
// Aracaju → Makai João Pessoa). Três famílias, cada uma no seu lugar:
//  - PROBLEMA (vermelho): a viagem cruza outra do colaborador sem encadeamento,
//    ou a passagem tem data impossível — o que a Pendências lista;
//  - TRECHO DIRETO confirmado (marca): "ida direto de #4045 · Aracaju" /
//    "volta: segue direto para #4238 · Makai João Pessoa" — sem volta própria;
//  - SUGESTÃO para Compras (vaga sem passagem): "Vem direto de Aracaju" com
//    "Registrar trecho direto" (abre o modal já encadeado) — ou, se os dois
//    eventos ficam na mesma região, "Vai de carro/van" na ida (23/10).
import { AlertTriangle, Car, CornerDownRight, MoreHorizontal, PencilLine, Route, Search, type LucideIcon } from "lucide-react";
import type { TeamInclusion } from "@shared/schema";
import { NOME_DO_MODO, type ModoDeRegistro } from "@shared/transporte-terrestre";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ICONE_DO_MODO } from "./campos-do-terrestre";
import { ondeFicaOEventoAnterior } from "./regiao-do-trecho-direto";
import { diaEmTextoCompleto as diaCompleto, textoDaIndicacao } from "@shared/janela-de-viagem";
import { ROTULO_LEITURA_SUSPEITA, type ProblemaNaPerna } from "@shared/sanidade-da-passagem";
import type { SinalDeViagem } from "./use-sinais-de-viagem";
import { diaCurto } from "./use-sinais-de-viagem";

const PILULA = "inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-2xs font-medium whitespace-nowrap max-w-full";

/**
 * Problemas da viagem: cruza outra viagem · data impossível (vermelho) · data
 * suspeita (âmbar, 16/10). A suspeita é a data que não bate com o evento (volta
 * digitada no ano seguinte): ela fica fora da conferência de cruzamento e o
 * aviso dela aparece NO LUGAR do "cruza com" falso. `onCorrigir` = atalho para
 * abrir a passagem já em edição (só para quem pode editar).
 */
export function ProblemasDaViagem({ sinal, inclusionId, onCorrigir }: { sinal?: SinalDeViagem; inclusionId: string; onCorrigir?: () => void }) {
  const cruza = sinal?.cruzaCom ?? [];
  const suspeitas = sinal?.datasSuspeitas ?? [];
  if (cruza.length === 0 && !sinal?.dataImpossivel && suspeitas.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {suspeitas.map((s) => (
        <span
          key={s.trecho}
          className="inline-flex items-start gap-1 max-w-full px-[7px] py-[3px] rounded-md text-2xs leading-4 font-medium bg-warning-soft text-warning-strong"
          title={s.detalhe}
          data-testid={`ticket-data-suspeita-${s.trecho}-${inclusionId}`}
        >
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{s.texto}</span>
        </span>
      ))}
      {suspeitas.length > 0 && onCorrigir && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCorrigir(); }}
          className="pas-alvo inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md border border-warning-strong/40 bg-card text-2xs font-semibold whitespace-nowrap text-warning-strong hover:bg-warning-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={suspeitas[0].provavel ? `Abrir a passagem para corrigir a data (provável: ${diaCompleto(suspeitas[0].provavel)})` : "Abrir a passagem para corrigir a data"}
          data-testid={`corrigir-data-suspeita-${inclusionId}`}
        >
          <PencilLine className="w-3 h-3 shrink-0" aria-hidden="true" />
          Corrigir passagem
        </button>
      )}
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

/**
 * Leitura do voucher suspeita (19/10 — caso #3913): passagem gravada com a
 * origem igual ao destino na mesma perna (THE→THE). Foi o leitor de PDF que
 * deslocou as linhas; o selo âmbar diz qual perna e o atalho abre a passagem
 * para corrigir — mesmo padrão da data suspeita.
 */
export function LeituraSuspeita({ problemas, inclusionId, onCorrigir }: { problemas: readonly ProblemaNaPerna[]; inclusionId: string; onCorrigir?: () => void }) {
  if (problemas.length === 0) return null;
  const detalhe = `${problemas.map((p) => p.texto).join(" · ")}. Confira com o voucher e corrija a passagem.`;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      <span
        className="inline-flex items-start gap-1 max-w-full px-[7px] py-[3px] rounded-md text-2xs leading-4 font-medium bg-warning-soft text-warning-strong"
        title={detalhe}
        data-testid={`ticket-leitura-suspeita-${inclusionId}`}
      >
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{ROTULO_LEITURA_SUSPEITA}<span className="sr-only">. {detalhe}</span></span>
      </span>
      {onCorrigir && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCorrigir(); }}
          className="pas-alvo inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md border border-warning-strong/40 bg-card text-2xs font-semibold whitespace-nowrap text-warning-strong hover:bg-warning-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={detalhe}
          data-testid={`corrigir-leitura-suspeita-${inclusionId}`}
        >
          <PencilLine className="w-3 h-3 shrink-0" aria-hidden="true" />
          Corrigir passagem
        </button>
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

/** Carro/van oferecido pelo cartão do trecho direto (o atalho de cima some). */
export interface TerrestreDoTrechoDireto {
  /** Modo que a Sugestão já indica ("van - 7h saindo"), como no atalho. */
  modo?: ModoDeRegistro;
  /** Só a ida, vinda do evento anterior (mesma região). */
  onIda: () => void;
  /** A viagem da vaga, como o atalho "Vai de carro/van" (regiões diferentes). */
  onViagem: () => void;
}

interface AcaoDoTrechoDireto {
  chave: string;
  rotulo: string;
  titulo: string;
  Icone: LucideIcon;
  tom: "terra" | "marca";
  onClick: () => void;
}

const BOTAO_DO_CARTAO = "pas-alvo inline-flex items-center justify-center gap-1 h-7 rounded-md border text-2xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TOM_DO_BOTAO: Record<AcaoDoTrechoDireto["tom"], string> = {
  terra: "border-success/30 bg-success-soft text-success-strong hover:bg-success-soft/70",
  marca: "border-primary/30 bg-card text-primary hover:bg-primary hover:text-primary-foreground",
};
const para = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Sugestão para Compras na vaga SEM passagem (redesenho 23/10, print do dono:
 * "só poderia melhorar o layout desses botões"). No padrão dos outros sinais:
 * título curto "Vem direto de Aracaju", linha de apoio "Evento anterior termina
 * 25/10 · indicado pela logística" (o nome inteiro do evento no title e para o
 * leitor de tela) e UMA ação principal com as outras no "…", na mesma linha e
 * da mesma altura — nada encosta na borda, cabe nos 176px da coluna e no cartão
 * do celular (alvos de 44px pelo `pas-alvo`).
 *
 * Qual ação: eventos na mesma região (`aeroportoComum`, ex. VIX entre Vila
 * Velha e Serra) → o trecho é por terra: "Vai de carro/van" na ida, sem "Buscar
 * preços". Regiões diferentes → "Registrar trecho direto", com "Buscar preços"
 * e carro/van no "…". Na vaga anterior, o inverso, só informativo: "Segue para
 * João Pessoa em 26/10".
 */
export function SugestaoDeTrechoDireto({ sinal, inclusionId, podeRegistrar, onRegistrar, onBuscarPrecos, aeroportoComum, terrestre }: {
  sinal?: SinalDeViagem;
  inclusionId: string;
  podeRegistrar: boolean;
  onRegistrar?: (anteriorId: string) => void;
  /** "Buscar preços do trecho direto" (09/10): só a ida, da cidade do evento anterior. */
  onBuscarPrecos?: (anteriorId: string) => void;
  /** Aeroporto comum aos dois eventos (mesma região — sem voo); null = regiões diferentes. */
  aeroportoComum?: string | null;
  /** Carro/van da vaga: quando vem, o cartão é o único lugar dele na linha. */
  terrestre?: TerrestreDoTrechoDireto;
}) {
  const de = sinal?.podeIrDiretoDe;
  const segue = !sinal?.segueDiretoPara?.confirmado ? sinal?.seguePara : null;
  if (!de && !segue) return null;

  const acoes: AcaoDoTrechoDireto[] = [];
  let onde = "";
  if (de) {
    onde = ondeFicaOEventoAnterior(de);
    const porTerra = !!aeroportoComum;
    const nomeDoModo = terrestre?.modo ? NOME_DO_MODO[terrestre.modo].toLowerCase() : "carro/van";
    const registrar: AcaoDoTrechoDireto | null = podeRegistrar && onRegistrar ? {
      chave: "registrar", rotulo: "Registrar trecho direto", Icone: Route, tom: "marca",
      titulo: porTerra
        ? `Registrar uma passagem com a ida saindo de ${onde} (ônibus de linha, por exemplo) — a vaga #${de.numero} fica sem volta própria`
        : `Abrir a passagem com a ida saindo de ${onde} — a vaga #${de.numero} fica sem volta própria`,
      onClick: () => onRegistrar(de.inclusionId),
    } : null;
    if (porTerra) {
      if (terrestre) acoes.push({
        chave: "terrestre", rotulo: `Vai de ${nomeDoModo}`, Icone: terrestre.modo ? ICONE_DO_MODO[terrestre.modo] : Car, tom: "terra",
        titulo: `Registrar a ida de ${nomeDoModo} saindo de ${onde} — mesma região (${aeroportoComum}), sem passagem aérea`,
        onClick: terrestre.onIda,
      });
      if (registrar) acoes.push(registrar);
    } else {
      if (registrar) acoes.push(registrar);
      if (onBuscarPrecos) acoes.push({
        chave: "buscar", rotulo: "Buscar preços do trecho direto", Icone: Search, tom: "marca",
        titulo: `Buscar voos de ${onde} para este evento`,
        onClick: () => onBuscarPrecos(de.inclusionId),
      });
      if (terrestre) acoes.push({
        chave: "terrestre", rotulo: `Vai de ${nomeDoModo}`, Icone: terrestre.modo ? ICONE_DO_MODO[terrestre.modo] : Car, tom: "terra",
        titulo: `Registrar que vai de ${nomeDoModo} (sem passagem aérea)`,
        onClick: terrestre.onViagem,
      });
    }
  }
  const [principal, ...outras] = acoes;

  return (
    <div className="flex flex-col items-stretch gap-1 mt-1 w-full">
      {de && (
        <div
          className="w-full mt-0.5"
          title={`${de.eventName}${de.cidade && de.cidade !== onde ? ` · ${de.cidade}` : ""} — termina ${diaCurto(de.dia)}${aeroportoComum ? ` · mesma região (${aeroportoComum}): o trecho é por terra` : ""}`}
          data-testid={`sugestao-trecho-direto-${inclusionId}`}
          data-por-terra={aeroportoComum ? "sim" : undefined}
        >
          <p className="m-0 flex items-start gap-1.5 text-2xs leading-4">
            <Route className="w-3 h-3 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold text-foreground break-words">
                Vem direto de {onde}<span className="sr-only"> ({de.eventName})</span>
              </span>
              <span className="block text-muted-foreground">
                {/* O "·" fica no fim da linha quando quebra, não no começo da seguinte. */}
                Evento anterior termina {diaCurto(de.dia)}{de.indicadoPelaLogistica ? " · indicado pela logística" : ""}
              </span>
              {aeroportoComum && (
                <span className="block font-medium text-success-strong" data-testid={`trecho-direto-mesma-regiao-${inclusionId}`}>
                  Mesma região — sem voo
                </span>
              )}
            </span>
          </p>
          {principal && (
            <div className="mt-1.5 flex items-stretch gap-1" data-testid={`acoes-trecho-direto-${inclusionId}`}>
              <button
                type="button"
                onClick={(e) => { para(e); principal.onClick(); }}
                className={`${BOTAO_DO_CARTAO} ${TOM_DO_BOTAO[principal.tom]} flex-1 min-w-0 px-1.5`}
                title={principal.titulo}
                data-testid={`trecho-direto-${principal.chave}-${inclusionId}`}
              >
                {/* O ícone do carro/van diz "por terra"; no registrar, a rota já está no título. */}
                {principal.tom === "terra" && <principal.Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{principal.rotulo}</span>
              </button>
              {outras.length > 0 && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={para}
                      className={`${BOTAO_DO_CARTAO} shrink-0 w-7 px-0 border-primary/30 bg-card text-primary hover:bg-brand-soft data-[state=open]:bg-brand-soft`}
                      aria-label={`Mais ações do trecho direto vindo de ${onde}`}
                      title="Mais ações"
                      data-testid={`trecho-direto-mais-${inclusionId}`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  {/* O menu vai para um portal, mas o clique ainda sobe pela árvore
                      do React até a célula — que abriria a vaga por baixo. */}
                  <DropdownMenuContent align="end" className="min-w-[220px]" onClick={para}>
                    {outras.map((a) => (
                      <DropdownMenuItem
                        key={a.chave}
                        onSelect={a.onClick}
                        className="pas-alvo text-xs"
                        title={a.titulo}
                        data-testid={`trecho-direto-${a.chave}-${inclusionId}`}
                      >
                        <a.Icone className={a.tom === "terra" ? "text-success-strong" : "text-primary"} aria-hidden="true" />
                        {a.rotulo}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
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
