/**
 * AJUSTES DA BUSCA (etapa 2, 09/10) — só admin, na aba Consumo. Os números
 * que o dono pediu "configurável": o teto por trecho (justificativa acima de
 * N% do típico), o acompanhamento de preço (quantas, quanto cair para avisar
 * e a hora da checagem diária) e a mala (valor estimado e quem despacha).
 *
 * Edição em linha, num painel só: os campos mostram o valor em vigor; "Salvar"
 * acende quando algo muda; erro de faixa aparece no próprio campo.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { LIMITES_DOS_AJUSTES, ehFuncaoQueDespachaPorPadrao, type AjustesDaBusca as Ajustes } from "@shared/regras-da-busca";
import type { Function as Funcao } from "@shared/schema";
import { Painel } from "@/components/tickets/analises/partes";
import { useAjustesDaBusca, useSalvarAjustes } from "./use-busca-de-passagens";

type CampoNumerico = keyof typeof LIMITES_DOS_AJUSTES;
interface Rascunho { tetoPorTrechoPct: string; limiteDeAcompanhamentos: string; quedaParaAvisoPct: string; horaDoAcompanhamento: string; valorDaMalaReais: string; funcoesComMala: string[] | null }

const paraRascunho = (a: Ajustes): Rascunho => ({
  tetoPorTrechoPct: String(a.tetoPorTrechoPct),
  limiteDeAcompanhamentos: String(a.limiteDeAcompanhamentos),
  quedaParaAvisoPct: String(a.quedaParaAvisoPct),
  horaDoAcompanhamento: String(a.horaDoAcompanhamento),
  valorDaMalaReais: String(Math.round(a.valorDaMalaCentavos / 100)),
  funcoesComMala: a.funcoesComMala,
});

function Campo({ id, rotulo, ajuda, valor, onChange, sufixo, erro, testid, estreito }: {
  id: string; rotulo: string; ajuda: string; valor: string; onChange: (v: string) => void; sufixo?: string; erro?: string | null; testid: string; estreito?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">{rotulo}</label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 7))}
          inputMode="numeric"
          aria-invalid={!!erro}
          aria-describedby={`${id}-ajuda`}
          className={cn("h-9 rounded-lg border", estreito ? "w-16" : "w-24", " bg-card px-2.5 text-sm tabular-nums focus:outline-none focus:ring-[3px]", erro ? "border-danger-strong focus:ring-danger/20" : "border-border focus:border-primary focus:ring-primary/12")}
          data-testid={testid}
        />
        {sufixo && <span className="text-xs text-muted-foreground">{sufixo}</span>}
      </div>
      <p id={`${id}-ajuda`} className={cn("m-0 mt-1 text-2xs leading-4", erro ? "text-danger-strong" : "text-muted-foreground")} role={erro ? "alert" : undefined}>{erro ?? ajuda}</p>
    </div>
  );
}

export function AjustesDaBusca() {
  const { toast } = useToast();
  const q = useAjustesDaBusca(true);
  const salvar = useSalvarAjustes();
  const funcoes = useQuery<Funcao[]>({ queryKey: ["/api/functions"], staleTime: 300_000 });
  const [r, setR] = useState<Rascunho | null>(null);
  useEffect(() => { if (q.data && !r) setR(paraRascunho(q.data.ajustes)); }, [q.data, r]);

  const lista = useMemo(() => (funcoes.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [funcoes.data]);
  const padraoIds = useMemo(() => lista.filter((f) => ehFuncaoQueDespachaPorPadrao(f.name)).map((f) => f.id), [lista]);

  if (q.isLoading || !r || !q.data) {
    return <div className="pas-osso h-48 rounded-xl" aria-hidden="true" data-testid="ajustes-carregando" />;
  }
  const original = paraRascunho(q.data.ajustes);
  const erro = (campo: CampoNumerico, texto: string, fator = 1): string | null => {
    const { min, max } = LIMITES_DOS_AJUSTES[campo];
    const n = Number(texto) * fator;
    if (texto === "" || !Number.isInteger(n) || n < min || n > max) return `Entre ${(min / fator).toLocaleString("pt-BR")} e ${(max / fator).toLocaleString("pt-BR")}.`;
    return null;
  };
  const erros = {
    tetoPorTrechoPct: erro("tetoPorTrechoPct", r.tetoPorTrechoPct),
    limiteDeAcompanhamentos: erro("limiteDeAcompanhamentos", r.limiteDeAcompanhamentos),
    quedaParaAvisoPct: erro("quedaParaAvisoPct", r.quedaParaAvisoPct),
    horaDoAcompanhamento: erro("horaDoAcompanhamento", r.horaDoAcompanhamento),
    valorDaMalaReais: erro("valorDaMalaCentavos", r.valorDaMalaReais, 100),
  };
  const sujo = JSON.stringify(r) !== JSON.stringify(original);
  const invalido = Object.values(erros).some(Boolean);
  const usandoPadrao = r.funcoesComMala === null;
  const marcadas = new Set(usandoPadrao ? padraoIds : r.funcoesComMala ?? []);
  const alternarFuncao = (id: string) => {
    const base = new Set(marcadas);
    if (base.has(id)) base.delete(id); else base.add(id);
    setR({ ...r, funcoesComMala: Array.from(base) });
  };
  const enviar = () => {
    salvar.mutate({
      tetoPorTrechoPct: Number(r.tetoPorTrechoPct),
      limiteDeAcompanhamentos: Number(r.limiteDeAcompanhamentos),
      quedaParaAvisoPct: Number(r.quedaParaAvisoPct),
      horaDoAcompanhamento: Number(r.horaDoAcompanhamento),
      valorDaMalaCentavos: Number(r.valorDaMalaReais) * 100,
      funcoesComMala: r.funcoesComMala,
    }, {
      onSuccess: (resp) => { setR(paraRascunho(resp.ajustes)); toast({ title: "Ajustes da busca salvos", description: "Valem a partir da próxima busca e da próxima checagem diária." }); },
      onError: (e) => toast({ title: "Não foi possível salvar", description: apiErrorMessage(e, "Tente de novo."), variant: "destructive" }),
    });
  };
  return (
    <Painel
      testid="ajustes-da-busca"
      titulo="Ajustes da busca"
      pergunta="Teto por trecho, acompanhamento de preço e mala — valem para admin e Compras"
      acao={<SlidersHorizontal className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Cada alteração vai para o log de auditoria.</span>
          <div className="flex items-center gap-1.5">
            {sujo && <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => setR(original)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Desfazer</Button>}
            <Button type="button" size="sm" className="h-8 rounded-lg" disabled={!sujo || invalido || salvar.isPending} onClick={enviar} data-testid="salvar-ajustes">
              {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Salvar ajustes
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Teto por trecho</legend>
          <Campo id="aj-teto" rotulo="Justificar acima de" sufixo="% do típico" valor={r.tetoPorTrechoPct} onChange={(v) => setR({ ...r, tetoPorTrechoPct: v })} erro={erros.tetoPorTrechoPct} testid="ajuste-teto-trecho"
            ajuda="Passagem acima disto (contra o preço típico da rota) só é registrada com justificativa." />
        </fieldset>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Acompanhar preço</legend>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-2">
            <Campo id="aj-limite" rotulo="Até" sufixo="escalações" valor={r.limiteDeAcompanhamentos} onChange={(v) => setR({ ...r, limiteDeAcompanhamentos: v })} erro={erros.limiteDeAcompanhamentos} testid="ajuste-limite" estreito ajuda="ao mesmo tempo" />
            <Campo id="aj-queda" rotulo="Avisar se cair" sufixo="%" valor={r.quedaParaAvisoPct} onChange={(v) => setR({ ...r, quedaParaAvisoPct: v })} erro={erros.quedaParaAvisoPct} testid="ajuste-queda" estreito ajuda="ou se a tendência virar subir" />
            <Campo id="aj-hora" rotulo="Checar às" sufixo="h" valor={r.horaDoAcompanhamento} onChange={(v) => setR({ ...r, horaDoAcompanhamento: v })} erro={erros.horaDoAcompanhamento} testid="ajuste-hora" estreito ajuda="horário de Brasília, 1x/dia" />
          </div>
        </fieldset>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Mala</legend>
          <Campo id="aj-mala" rotulo="Valor estimado" sufixo="R$ por perna" valor={r.valorDaMalaReais} onChange={(v) => setR({ ...r, valorDaMalaReais: v })} erro={erros.valorDaMalaReais} testid="ajuste-mala"
            ajuda="Somado ao custo de quem despacha quando a tarifa não inclui mala." />
          <div className="mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="m-0 text-xs font-medium text-slate-700">Quem despacha</p>
              {usandoPadrao
                ? <span className="text-2xs text-muted-foreground">regra padrão: cenotécnica</span>
                : <button type="button" className="text-2xs font-medium text-primary hover:underline" onClick={() => setR({ ...r, funcoesComMala: null })}>Voltar ao padrão</button>}
            </div>
            {funcoes.isLoading ? <div className="pas-osso mt-2 h-20" aria-hidden="true" /> : (
              <ul className="m-0 mt-1.5 grid max-h-44 list-none grid-cols-1 gap-x-3 overflow-y-auto rounded-lg border border-border p-1.5 sm:grid-cols-2" aria-label="Funções que despacham mala" data-testid="funcoes-com-mala">
                {lista.map((f) => (
                  <li key={f.id}>
                    <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs text-slate-700 hover:bg-muted">
                      <input type="checkbox" checked={marcadas.has(f.id)} onChange={() => alternarFuncao(f.id)} className="h-3.5 w-3.5 accent-primary" />
                      <span className="truncate">{f.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>
      </div>
    </Painel>
  );
}
