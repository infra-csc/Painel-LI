/**
 * Resumo da presença de UMA prestação, para a Conferência DP (27/10, Fase 1).
 * O DP confere aqui, sem sair da tela: os dias com entrada/saída (cada
 * selfie abre no lightbox), as ocorrências, a confirmação do colaborador e o
 * CNPJ informado com o selo de contrato. "Ver presença" leva à tela da
 * presença já na pessoa. Só leitura: aprovar, devolver e recusar continuam
 * onde sempre estiveram.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Camera, CheckCheck, Fingerprint, TriangleAlert } from "lucide-react";
import { SeloContratoAtivo } from "@/components/contratos/pecas";
import { cn } from "@/lib/utils";
import { LightboxDaSelfie } from "./lightbox-da-selfie";
import { contarSelfies, dataHoraBr, diaCurto, diaDaSemana, seloDoCnpj, selfiesDaPrestacao } from "./presenca-utils";
import type { PrestacaoDaPresenca } from "./tipos";

export function ResumoDaPresenca({ p, eventId, nome }: { p: PrestacaoDaPresenca; eventId: string; nome: string }) {
  const [indice, setIndice] = useState<number | null>(null);
  const selfies = useMemo(() => selfiesDaPrestacao(p), [p]);
  const comEntrada = p.dias.filter((d) => d.entrada).length;
  const comSaida = p.dias.filter((d) => d.saida).length;
  const nSelfies = contarSelfies(p);
  const abrir = (dia: string, lado: "entrada" | "saida") => {
    const i = selfies.findIndex((s) => s.dia === dia && s.lado === lado);
    if (i >= 0) setIndice(i);
  };

  return (
    <section className="prs-resumo" aria-label={`Presença de ${nome}`} data-testid={`cmp-presenca-${p.actualId}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="m-0 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Fingerprint className="w-3.5 h-3.5 text-primary" aria-hidden="true" />Presença no evento
        </h4>
        <p className="m-0 text-2xs text-muted-foreground tabular-nums">
          {comEntrada} de {p.dias.length} {p.dias.length === 1 ? "dia" : "dias"} com entrada · {comSaida} com saída · {nSelfies} {nSelfies === 1 ? "selfie" : "selfies"}
          {p.ocorrencias.length > 0 && ` · ${p.ocorrencias.length} ${p.ocorrencias.length === 1 ? "ocorrência" : "ocorrências"}`}
        </p>
        <Link href={`/presenca?event=${encodeURIComponent(eventId)}&pessoa=${encodeURIComponent(p.actualId)}`}
          className="pas-alvo ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`cmp-ver-presenca-${p.actualId}`}>
          Ver presença<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </header>

      <ul className="prs-resumo-dias mt-2" aria-label="Dias">
        {p.dias.map((d) => (
          <li key={d.dia} className={cn("prs-resumo-dia", d.estado === "falta" && "line-through opacity-70", (d.estado === "ausente" || d.estado === "sem_checkout") && "bg-warning-soft text-warning")}
            title={`${diaDaSemana(d.dia)} ${diaCurto(d.dia)} · ${d.rotulo}`}>
            <span className="font-medium">{diaCurto(d.dia)}</span>
            <span>{d.estado === "falta" ? "falta" : d.entrada ? `${d.entrada.hora}–${d.saida?.hora ?? "…"}` : d.rotulo.toLowerCase()}</span>
            {d.entrada?.fotoUrl && (
              <button type="button" onClick={() => abrir(d.dia, "entrada")} aria-label={`Selfie da entrada de ${diaCurto(d.dia)}`} title="Selfie da entrada"><Camera className="w-3 h-3" aria-hidden="true" /></button>
            )}
            {d.saida?.fotoUrl && (
              <button type="button" onClick={() => abrir(d.dia, "saida")} aria-label={`Selfie da saída de ${diaCurto(d.dia)}`} title="Selfie da saída"><Camera className="w-3 h-3" aria-hidden="true" /></button>
            )}
          </li>
        ))}
        {p.diasExtras.map((d) => (
          <li key={`x-${d}`} className="prs-resumo-dia bg-info-soft text-info" title="Diária extra"><span className="font-medium">{diaCurto(d)}</span><span>extra</span></li>
        ))}
      </ul>

      {p.ocorrencias.length > 0 && (
        <ul className="m-0 mt-2 p-0 list-none space-y-0.5 text-xs text-slate-700">
          {p.ocorrencias.map((o) => (
            <li key={o.id} className="flex gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium">{o.rotulo}</span>
                {o.dia && ` · ${diaCurto(o.dia)}`}{o.horas != null && ` · ${o.horas.toLocaleString("pt-BR")} h`}
                {o.substituto?.nome && ` · no lugar: ${o.substituto.nome}`}
                {o.observacao && <span className="text-muted-foreground"> — {o.observacao}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {p.confirmacao ? (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            Confirmou {p.confirmacao.dias.length} {p.confirmacao.dias.length === 1 ? "dia" : "dias"} em {dataHoraBr(p.confirmacao.confirmadoEm)}{p.confirmacao.por === "representante" ? " (pelo representante)" : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-warning"><TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />Sem a confirmação do colaborador</span>
        )}
        <span className="inline-flex flex-wrap items-center gap-1.5 text-slate-600">
          CNPJ{" "}
          {p.cnpj.informado ? <span className="font-medium tabular-nums text-foreground">{p.cnpj.informado}</span> : <span className="text-muted-foreground">não informado</span>}
          <SeloContratoAtivo situacao={seloDoCnpj(p.cnpj.situacao)} mostrarQuandoAtivo />
        </span>
      </div>
      {p.confirmacao?.contestacao && (
        <blockquote className="m-0 mt-2 rounded-md border-l-[3px] border-warning-strong bg-warning-soft/50 px-2.5 py-1.5 text-xs italic text-slate-700">Contestação: “{p.confirmacao.contestacao}”</blockquote>
      )}

      <LightboxDaSelfie nome={nome} selfies={selfies} indice={indice} onIndice={setIndice} onClose={() => setIndice(null)} />
    </section>
  );
}
