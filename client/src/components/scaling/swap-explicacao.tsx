/**
 * "O que muda ao aprovar" — o mesmo quadro no pedido, na Escalação, em
 * Passagens e em Hospedagem (dono, 16/09). O texto vem de
 * shared/swap-explicacao.ts; aqui só a forma.
 */
import { ArrowRight, Info, MapPin, XCircle } from "lucide-react";
import { explicarTroca, type TrocaParaExplicar } from "@shared/swap-explicacao";

export function ExplicacaoDaTroca({ troca, titulo = "O que muda ao aprovar", compacta = false }: {
  troca: TrocaParaExplicar;
  titulo?: string;
  /** Só as vagas (sem observações nem recusa) — para o cartão pequeno. */
  compacta?: boolean;
}) {
  const e = explicarTroca(troca);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-left" data-testid="swap-explicacao">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {titulo} <span className="font-semibold normal-case tracking-normal text-slate-400">· {e.tipo}</span>
      </p>
      <ul className="space-y-1.5">
        {e.vagas.map((v) => (
          <li key={v.chave} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
            <p className="text-[11px] font-semibold text-slate-700 break-words">{v.vaga}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]">
              <span className="text-slate-400">Hoje:</span>
              <span className="font-medium text-slate-600 break-words">{v.antes}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="text-slate-400">Depois:</span>
              <span className="font-semibold text-emerald-700 break-words">{v.depois}</span>
            </p>
            {v.saiDe && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500" data-testid={`swap-explicacao-sai-de-${v.chave}`}>
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                {v.depois} sai de <span className="font-semibold text-slate-700">{v.saiDe}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {!compacta && (
        <ul className="space-y-1 text-[11px] leading-snug">
          {e.observacoes.map((o) => (
            <li key={o} className="flex items-start gap-1.5 text-slate-600">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
              <span>{o}</span>
            </li>
          ))}
          <li className="flex items-start gap-1.5 text-rose-700">
            <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{e.recusa}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
