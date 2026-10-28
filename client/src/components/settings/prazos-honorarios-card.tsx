/**
 * Prazos dos honorários — Tabela de valores (28/10, Fase 3 do Módulo de
 * Honorários: prazos e cobranças), logo depois do card "Presença e acesso do
 * colaborador".
 *
 * Slide 13 (21/10) deixou "Prazo para confirmar e para enviar NF: definir
 * dias" para o dono. Até lá valem os dias PROVISÓRIOS (shared/prazos-honorarios):
 * confirmar a presença 2 dias e check-out final 3 dias após o último dia;
 * Conferência DP 3 dias após o envio; OC 3 dias após a aprovação; nota fiscal
 * 5 dias após a OC; conferência da nota 2 dias após o envio. Dias corridos,
 * no horário de Brasília. Só o administrador muda; o DP vê. Salva na hora
 * (GET/PUT /api/honorarios/prazos), fora da barra de alterações da página.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { CAMPOS_DO_PRAZO, DESCRICAO_DO_PRAZO, LIMITES_DO_PRAZO, type CampoDoPrazo, type PrazosDosHonorarios } from "@shared/prazos-honorarios";
import { GrupoDeAjustes, LinhaDeAjuste } from "./settings-fields";

export const CHAVE_PRAZOS_HONORARIOS = "/api/honorarios/prazos";

interface RespostaDosPrazos {
  prazos: PrazosDosHonorarios;
  padrao: PrazosDosHonorarios;
  provisorio: boolean;
  podeEditar: boolean;
}

type Rascunho = Record<CampoDoPrazo, string>;
const paraRascunho = (p: PrazosDosHonorarios): Rascunho =>
  Object.fromEntries(CAMPOS_DO_PRAZO.map((c) => [c, String(p[c])])) as Rascunho;

/** O que mudou (corpo do PUT) e o primeiro erro de preenchimento. */
export function diferencaDosPrazos(r: Rascunho, atual: PrazosDosHonorarios): { corpo: Partial<Record<CampoDoPrazo, number>>; erro: string | null } {
  const corpo: Partial<Record<CampoDoPrazo, number>> = {};
  for (const campo of CAMPOS_DO_PRAZO) {
    const n = Number(r[campo].trim());
    if (!Number.isInteger(n) || n < LIMITES_DO_PRAZO.min || n > LIMITES_DO_PRAZO.max) {
      return { corpo, erro: `${DESCRICAO_DO_PRAZO[campo].rotulo}: use um número inteiro de ${LIMITES_DO_PRAZO.min} a ${LIMITES_DO_PRAZO.max} dias.` };
    }
    if (n !== atual[campo]) corpo[campo] = n;
  }
  return { corpo, erro: null };
}

/** As três linhas do card: o que é do colaborador, da produção e do DP. */
const GRUPOS: { titulo: string; descricao: string; campos: CampoDoPrazo[] }[] = [
  { titulo: "Depois do evento", descricao: "Contados do último dia de trabalho da prestação. A produção pode fechar sem a confirmação do colaborador (com justificativa).", campos: ["confirmarPresenca", "checkoutFinal"] },
  { titulo: "Com o DP", descricao: "Conferência a partir do envio ao DP (check-out final); OC a partir da aprovação na Conferência DP.", campos: ["conferenciaDp", "registrarOc"] },
  { titulo: "Nota fiscal", descricao: "O colaborador envia a nota a partir do registro da OC; o DP confere a partir do envio. Devolvida: volta a contar da devolução.", campos: ["enviarNf", "conferirNf"] },
];

function CampoDias({ campo, valor, salvo, padrao, disabled, onChange }: {
  campo: CampoDoPrazo; valor: string; salvo: string; padrao: string; disabled: boolean; onChange: (v: string) => void;
}) {
  const d = DESCRICAO_DO_PRAZO[campo];
  const id = `cfg-prz-${campo}`;
  const alterado = valor !== salvo;
  return (
    <div className="cfg-campo-bloco min-w-0">
      <label htmlFor={id} className="cfg-rotulo" title={`${d.rotulo} — ${d.quem}`}>{d.rotulo}</label>
      <div className={cn("cfg-campo", alterado && "cfg-campo-alterado", disabled && "opacity-70")}>
        <input id={id} type="text" inputMode="numeric" value={valor} disabled={disabled} autoComplete="off"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          className="cfg-campo-input" data-testid={id} />
        <span className="cfg-campo-unidade" aria-hidden="true">dias</span>
      </div>
      <p className={cn("cfg-apoio", alterado ? "cfg-apoio-alterado" : "text-muted-foreground")}>
        {alterado ? <>antes {salvo} dias</> : <>{d.quem} · {d.aPartirDe} · padrão {padrao}</>}
      </p>
    </div>
  );
}

export function PrazosHonorariosCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery<RespostaDosPrazos>({ queryKey: [CHAVE_PRAZOS_HONORARIOS] });
  const atual = q.data?.prazos;
  const padrao = q.data?.padrao;
  const podeEditar = !!q.data?.podeEditar;
  const [r, setR] = useState<Rascunho | null>(null);
  useEffect(() => { if (atual) setR(paraRascunho(atual)); }, [atual]);
  const salvo = useMemo(() => (atual ? paraRascunho(atual) : null), [atual]);
  const pad = useMemo(() => (padrao ? paraRascunho(padrao) : null), [padrao]);

  const m = useMutation({
    mutationFn: async (corpo: Record<string, unknown>) => (await apiRequest("PUT", CHAVE_PRAZOS_HONORARIOS, corpo)).json() as Promise<RespostaDosPrazos>,
    onSuccess: (resp) => {
      qc.setQueryData([CHAVE_PRAZOS_HONORARIOS], resp);
      // Os prazos aparecem no Painel, na presença, no portal e no sino.
      qc.invalidateQueries({ queryKey: ["/api/rh/controle"] });
      qc.invalidateQueries({ queryKey: ["/api/presenca/eventos"] });
      qc.invalidateQueries({ queryKey: ["shell", "honorarios-prazos"] });
      toast({ variant: "success", title: "Prazos salvos", description: "O Painel, a presença e o app do colaborador já contam com os dias novos." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Não foi possível salvar os prazos", description: apiErrorMessage(e, "Tente de novo.") }),
  });

  const selo = (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-warning/25 bg-warning-soft text-2xs font-semibold text-warning whitespace-nowrap" title="Decisão nossa até o dono definir os dias (slide 13)">
      Padrão provisório — o dono pode mudar
    </span>
  );

  let corpo: ReactNode;
  if (q.isLoading || (!r && !q.isError)) {
    corpo = (
      <div className="px-5 py-4 space-y-3" aria-busy="true" aria-label="Carregando os prazos">
        <div className="pas-osso h-4 w-56" /><div className="pas-osso h-10 w-full max-w-[560px] rounded-lg" />
      </div>
    );
  } else if (q.isError || !r || !salvo || !pad || !atual) {
    corpo = (
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-danger" role="alert">
        Não foi possível carregar os prazos.
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => q.refetch()}>Tentar de novo</Button>
      </div>
    );
  } else {
    const dif = diferencaDosPrazos(r, atual);
    const mudou = CAMPOS_DO_PRAZO.some((c) => r[c] !== salvo[c]);
    const desab = !podeEditar || m.isPending;
    corpo = (
      <>
        {GRUPOS.map((g) => (
          <LinhaDeAjuste key={g.titulo} titulo={g.titulo} descricao={g.descricao} colunas={2}>
            {g.campos.map((c) => (
              <CampoDias key={c} campo={c} valor={r[c]} salvo={salvo[c]} padrao={pad[c]} disabled={desab} onChange={(v) => setR({ ...r, [c]: v })} />
            ))}
          </LinhaDeAjuste>
        ))}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-t border-border bg-surface-muted/60 max-sm:px-4">
          {podeEditar ? (
            <>
              {dif.erro && mudou && <p role="alert" className="m-0 text-xs font-medium text-danger basis-full">{dif.erro}</p>}
              <Button type="button" size="sm" className="h-9 rounded-lg" disabled={!mudou || !!dif.erro || m.isPending}
                onClick={() => m.mutate(dif.corpo)} data-testid="cfg-prz-salvar">
                {m.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Salvando…</> : "Salvar prazos"}
              </Button>
              {mudou && (
                <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg gap-1.5" onClick={() => setR(salvo)} disabled={m.isPending}>
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />Desfazer
                </Button>
              )}
              <span className="text-2xs text-muted-foreground sm:ml-auto">Salva na hora, separado da barra de alterações da página.</span>
            </>
          ) : (
            <p className="m-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="w-3.5 h-3.5" aria-hidden="true" />Só o administrador muda os prazos. O DP vê o que está valendo.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <GrupoDeAjustes
      id="cfg-prazos-honorarios"
      titulo="Prazos dos honorários"
      descricao={<>Quantos dias cada um tem em cada etapa do fluxo novo — o Painel de honorários, a Presença no evento e o app do colaborador avisam “vence hoje” e “atrasado”. Dias corridos, no horário de Brasília.<span className="block mt-1.5">{selo}</span></>}
      data-testid="cfg-prazos-honorarios"
    >
      {corpo}
    </GrupoDeAjustes>
  );
}
