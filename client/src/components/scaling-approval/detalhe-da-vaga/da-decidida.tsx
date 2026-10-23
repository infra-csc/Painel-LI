/**
 * O que o detalhe da Aprovação mostra a mais numa vaga JÁ decidida (aba
 * Decididas, 23/10): o selo da decisão — o mesmo da lista — e, no topo, como
 * ela foi decidida, por quem e quando, com o comentário do aprovador.
 *
 * A vaga aprovada já virou Inclusão: o status dela é da Escalação ("planejado"),
 * que a pílula da Validação não sabe dizer — por isso o selo sai da decisão.
 */
import { CheckCircle2, XCircle } from "lucide-react";
import { CAMINHO_POR_ACAO, PilulaDaDecisao, type VagaDecidida } from "@/components/scaling-validation/decided-panel";
import { Destaque, fmtDateTime } from "@/components/scaling-validation/suggestion-detail-helpers";
import { DECISION_TONE_CLASS } from "@/components/scaling-validation/types";

export function SelosDaDecidida({ vaga }: { vaga: VagaDecidida }) {
  return <span className="flex flex-wrap items-center gap-1"><PilulaDaDecisao decisao={vaga.decididaComo} /></span>;
}

const comMaiuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

export function HistoriaDaDecidida({ vaga }: { vaga: VagaDecidida }) {
  const d = vaga.decisao;
  const aprovada = vaga.decididaComo === "aprovada";
  const caminho = d ? CAMINHO_POR_ACAO[d.action] ?? d.resumo : "";
  return (
    <Destaque id="det-como-decidida" tom={DECISION_TONE_CLASS[aprovada ? "ok" : "danger"]} icon={aprovada ? CheckCircle2 : XCircle}
      title={caminho ? comMaiuscula(caminho) : aprovada ? "Aprovada — virou Inclusão" : "Negada"}
      meta={d ? <>{d.byName ?? "Aprovador"} · {fmtDateTime(d.at)}</> : undefined}>
      {!d
        ? <span className="italic text-slate-600">Sem registro de quem decidiu.</span>
        : d.comment?.trim()
          ? d.comment
          : <span className="italic text-slate-600">Sem comentário do aprovador.</span>}
    </Destaque>
  );
}
