/**
 * Quem está na rota aberta (16/10): nome, função, o horário que a escalação
 * pede ("chegar até" / "sair após") e o acompanhamento de preço. O registro
 * é feito pela opção escolhida ("Usar este voo" → para quem / para todas).
 * Embaixo, o alerta de grupo quando 10+ pessoas voam o mesmo trecho no dia.
 */
import { useState } from "react";
import { BellPlus, BellRing, CheckCircle2, ChevronDown, Copy, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertaDeGrupo } from "@shared/regras-da-busca";
import { ddmm, diaCurto, plural } from "../formato";

export interface PessoaDaRota {
  id: string;
  numero: number | null;
  nome: string;
  funcao: string;
  evento: string;
  chegarAte: string | null;
  sairApos: string | null;
  comprada: boolean;
  valorPagoCentavos: number | null;
  acompanhando: boolean;
}

export function EscalacoesDaRota({ pessoas, onAcompanhar, acompanhandoAgora, alertas }: {
  pessoas: PessoaDaRota[];
  onAcompanhar: (vagaId: string) => void;
  /** Vaga com o pedido de acompanhar em andamento. */
  acompanhandoAgora: string | null;
  alertas: AlertaDeGrupo[];
}) {
  const pendentes = pessoas.filter((p) => !p.comprada).length;
  return (
    <section className="bpr-bloco" aria-labelledby="bpr-quem" data-testid="escalacoes-da-rota">
      <header className="flex items-baseline justify-between gap-2 px-3.5 pb-2 pt-3">
        <h2 id="bpr-quem" className="m-0 text-xs font-semibold text-foreground">Quem viaja nesta rota</h2>
        <span className="text-2xs tabular-nums text-muted-foreground">{plural(pessoas.length, "escalação", "escalações")}{pendentes !== pessoas.length ? ` · ${pendentes} sem passagem` : ""}</span>
      </header>
      <ul className="m-0 max-h-[320px] list-none overflow-y-auto p-0">
        {pessoas.map((p) => (
          <li key={p.id} className="bpr-pessoa" data-testid={`pessoa-${p.id}`}>
            <div className="min-w-0">
              <p className="m-0 flex min-w-0 items-center gap-1.5 text-sm leading-5">
                <span className="font-mono text-2xs font-semibold text-primary">#{p.numero ?? "?"}</span>
                <span className="truncate font-medium text-foreground" title={toTitleCase(p.nome)}>{toTitleCase(p.nome)}</span>
              </p>
              <p className="m-0 truncate text-2xs leading-4 text-muted-foreground" title={`${p.funcao} · ${p.evento}`}>{p.funcao} · {p.evento}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                  {p.chegarAte && <span className="inline-flex h-[18px] items-center rounded bg-muted px-1.5 text-2xs text-slate-700">chegar até {p.chegarAte}</span>}
                  {p.sairApos && <span className="inline-flex h-[18px] items-center rounded bg-muted px-1.5 text-2xs text-slate-700">sair após {p.sairApos}</span>}
                  {p.comprada && <span className="inline-flex h-[18px] items-center gap-1 rounded bg-success-soft px-1.5 text-2xs font-medium text-success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />comprada{p.valorPagoCentavos ? ` · ${formatarMoeda(p.valorPagoCentavos)}` : ""}</span>}
            {!p.comprada && (
              <button
                type="button"
                onClick={() => onAcompanhar(p.id)}
                disabled={p.acompanhando || acompanhandoAgora === p.id}
                className={cn("pas-alvo ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  p.acompanhando ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                title={p.acompanhando ? "O app checa o preço uma vez por dia e avisa no sino" : "Acompanhar o preço: checagem diária, aviso no sino se cair ou se a tendência virar “subir”. Não gasta agora."}
                aria-label={p.acompanhando ? `Acompanhando o preço de ${toTitleCase(p.nome)}` : `Acompanhar o preço de ${toTitleCase(p.nome)}`}
                data-testid={`acompanhar-${p.id}`}
              >
                {acompanhandoAgora === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : p.acompanhando ? <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> : <BellPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                {p.acompanhando ? "Acompanhando" : "Acompanhar"}
              </button>
            )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {alertas.map((a) => <AlertaDaRota key={a.chave} a={a} />)}
    </section>
  );
}

function AlertaDaRota({ a }: { a: AlertaDeGrupo }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const copiar = () => {
    const texto = [`Tarifa de grupo — ${a.origem} → ${a.destino} em ${ddmm(a.data)} (${a.vagas.length} pessoas)`, ...a.vagas.map((v) => `#${v.numero ?? "?"} ${toTitleCase(v.nome)}`)].join("\n");
    void navigator.clipboard?.writeText(texto).then(() => toast({ title: "Lista copiada", description: "Cole no e-mail para a companhia." })).catch(() => undefined);
  };
  return (
    <div className="border-t border-info/25 bg-info-soft/45 px-3.5 py-2.5" data-testid={`alerta-grupo-rota-${a.origem}-${a.destino}-${a.data}`}>
      <p className="m-0 flex items-start gap-2 text-xs leading-5 text-foreground">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info-strong" aria-hidden="true" />
        <span><span className="font-semibold">{a.vagas.length} pessoas voam <span className="font-mono">{a.origem} → {a.destino}</span> em {diaCurto(a.data)}</span> <span className="text-slate-600">— peça tarifa de grupo antes de comprar uma a uma.</span></span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
        <button type="button" onClick={() => setAberto((x) => !x)} aria-expanded={aberto} className="pas-alvo inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-info-strong hover:bg-card">
          Ver a lista<ChevronDown className={cn("h-3 w-3 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
        </button>
        <button type="button" onClick={copiar} className="pas-alvo inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-info-strong hover:bg-card"><Copy className="h-3 w-3" aria-hidden="true" />Copiar</button>
      </div>
      {aberto && (
        <ul className="m-0 mt-1.5 list-none space-y-0.5 pl-5 text-2xs">
          {a.vagas.map((v) => <li key={v.vagaId} className="flex min-w-0 gap-1.5"><span className="font-mono font-semibold text-primary">#{v.numero ?? "?"}</span><span className="truncate text-slate-700">{toTitleCase(v.nome)}</span></li>)}
        </ul>
      )}
    </div>
  );
}
