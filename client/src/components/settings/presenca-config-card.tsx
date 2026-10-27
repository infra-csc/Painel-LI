/**
 * Presença e acesso do colaborador — Tabela de valores (27/10, Fase 1 do
 * Módulo de Honorários).
 *
 * As regras que o app usa na presença, com o PADRÃO PROVISÓRIO decidido por
 * nós (o dono pode mudar): selfie obrigatória na entrada e na saída,
 * localização registrada, valor-hora da hora extra = diária ÷ 8, ajuste do
 * produtor até 10%, guarda das selfies por 365 dias depois do pagamento e o
 * termo de consentimento (RASCUNHO — revisar com o jurídico). Só o
 * administrador muda; o DP vê. Salva na hora (GET/PUT
 * /api/presenca/configuracao) — como a data de corte, fora da barra de
 * alterações da página. Mudar o texto do termo exige versão nova (quem já
 * aceitou aceita de novo — o servidor recusa sem isso).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileWarning, Loader2, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { CHAVE_PRESENCA } from "@/components/presenca/use-presenca";
import { LIMITES_DA_CONFIGURACAO, type ConfiguracaoDaPresenca, type ModoDeLocalizacao } from "@shared/presenca";
import { GrupoDeAjustes, LinhaDeAjuste } from "./settings-fields";

export const CHAVE_CONFIG_PRESENCA = "/api/presenca/configuracao";

interface RespostaDaConfiguracao {
  configuracao: ConfiguracaoDaPresenca;
  padrao: ConfiguracaoDaPresenca;
  provisorio: boolean;
  podeEditar: boolean;
}

type Rascunho = {
  selfieObrigatoria: boolean;
  localizacao: ModoDeLocalizacao;
  horaExtraDivisor: string;
  produtorAjusteMaxPct: string;
  retencaoDias: string;
  termoVersao: string;
  termoTexto: string;
};

const paraRascunho = (c: ConfiguracaoDaPresenca): Rascunho => ({
  selfieObrigatoria: c.selfieObrigatoria,
  localizacao: c.localizacao,
  horaExtraDivisor: String(c.horaExtraDivisor).replace(".", ","),
  produtorAjusteMaxPct: String(c.produtorAjusteMaxPct).replace(".", ","),
  retencaoDias: String(c.retencaoDias),
  termoVersao: c.termoVersao,
  termoTexto: c.termoTexto,
});

const numero = (v: string) => Number(v.replace(",", "."));

/** O que mudou (corpo do PUT) e o primeiro erro de preenchimento, se houver. */
export function diferencaDaConfiguracao(r: Rascunho, atual: ConfiguracaoDaPresenca): { corpo: Partial<Record<keyof ConfiguracaoDaPresenca, unknown>>; erro: string | null } {
  const L = LIMITES_DA_CONFIGURACAO;
  const corpo: Partial<Record<keyof ConfiguracaoDaPresenca, unknown>> = {};
  if (r.selfieObrigatoria !== atual.selfieObrigatoria) corpo.selfieObrigatoria = r.selfieObrigatoria;
  if (r.localizacao !== atual.localizacao) corpo.localizacao = r.localizacao;
  const nums: [keyof Pick<Rascunho, "horaExtraDivisor" | "produtorAjusteMaxPct" | "retencaoDias">, string, boolean][] = [
    ["horaExtraDivisor", "Divisor da hora extra", false],
    ["produtorAjusteMaxPct", "Ajuste máximo do produtor", false],
    ["retencaoDias", "Guarda das selfies", true],
  ];
  for (const [campo, rotulo, inteiro] of nums) {
    const n = numero(r[campo]);
    const { min, max } = L[campo];
    if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) {
      return { corpo, erro: `${rotulo}: use ${inteiro ? "um número inteiro" : "um número"} de ${min} a ${max.toLocaleString("pt-BR")}.` };
    }
    if (n !== atual[campo]) corpo[campo] = n;
  }
  const versao = r.termoVersao.trim();
  const texto = r.termoTexto.trim();
  if (versao !== atual.termoVersao) corpo.termoVersao = versao;
  if (texto !== atual.termoTexto) {
    if (texto.length < L.termoTexto.min) return { corpo, erro: `Texto do termo: pelo menos ${L.termoTexto.min} caracteres.` };
    if (versao === atual.termoVersao) return { corpo, erro: "Mudou o texto do termo: informe uma versão nova (quem já aceitou precisa aceitar de novo)." };
    corpo.termoTexto = texto;
  }
  if (corpo.termoVersao !== undefined && (versao.length < L.termoVersao.min || versao.length > L.termoVersao.max)) {
    return { corpo, erro: `Versão do termo: de ${L.termoVersao.min} a ${L.termoVersao.max} caracteres.` };
  }
  return { corpo, erro: null };
}

/** Campo de número com a unidade, no desenho dos campos da Tabela de valores. */
function CampoNumero({ id, rotulo, unidade, valor, onChange, salvo, padrao, disabled, apoio }: {
  id: string; rotulo: string; unidade?: string; valor: string; onChange: (v: string) => void; salvo: string; padrao: string; disabled: boolean; apoio?: ReactNode;
}) {
  const alterado = valor !== salvo;
  return (
    <div className="cfg-campo-bloco min-w-0">
      <label htmlFor={id} className="cfg-rotulo" title={rotulo}>{rotulo}</label>
      <div className={cn("cfg-campo", alterado && "cfg-campo-alterado", disabled && "opacity-70")}>
        <input id={id} type="text" inputMode="decimal" value={valor} disabled={disabled} autoComplete="off"
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          className="cfg-campo-input" data-testid={id} />
        {unidade && <span className="cfg-campo-unidade" aria-hidden="true">{unidade}</span>}
      </div>
      <p className={cn("cfg-apoio", alterado ? "cfg-apoio-alterado" : "text-muted-foreground")}>
        {alterado ? <>antes {salvo}{unidade ? ` ${unidade}` : ""}</> : apoio ?? <>padrão {padrao}{unidade ? ` ${unidade}` : ""}</>}
      </p>
    </div>
  );
}

export function PresencaConfigCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery<RespostaDaConfiguracao>({ queryKey: [CHAVE_CONFIG_PRESENCA] });
  const atual = q.data?.configuracao;
  const padrao = q.data?.padrao;
  const podeEditar = !!q.data?.podeEditar;
  const [r, setR] = useState<Rascunho | null>(null);
  useEffect(() => { if (atual) setR(paraRascunho(atual)); }, [atual]);
  const salvo = useMemo(() => (atual ? paraRascunho(atual) : null), [atual]);
  const pad = useMemo(() => (padrao ? paraRascunho(padrao) : null), [padrao]);

  const m = useMutation({
    mutationFn: async (corpo: Record<string, unknown>) => (await apiRequest("PUT", CHAVE_CONFIG_PRESENCA, corpo)).json() as Promise<RespostaDaConfiguracao>,
    onSuccess: (resp) => {
      qc.setQueryData([CHAVE_CONFIG_PRESENCA], resp);
      qc.invalidateQueries({ queryKey: [CHAVE_PRESENCA] });
      toast({ variant: "success", title: "Regras da presença salvas", description: "Valem a partir do próximo registro no app e na tela da presença." });
    },
    onError: (e) => toast({ variant: "destructive", title: "Não foi possível salvar as regras da presença", description: apiErrorMessage(e, "Tente de novo.") }),
  });

  const selo = (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-warning/25 bg-warning-soft text-2xs font-semibold text-warning whitespace-nowrap" title="Decisões nossas até o dono confirmar">
      Padrão provisório — o dono pode mudar
    </span>
  );

  let corpo: ReactNode;
  if (q.isLoading || (!r && !q.isError)) {
    corpo = (
      <div className="px-5 py-4 space-y-3" aria-busy="true" aria-label="Carregando as regras da presença">
        <div className="pas-osso h-4 w-56" /><div className="pas-osso h-10 w-full max-w-[560px] rounded-lg" /><div className="pas-osso h-24 w-full max-w-[720px] rounded-lg" />
      </div>
    );
  } else if (q.isError || !r || !salvo || !pad || !atual) {
    corpo = (
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm text-danger" role="alert">
        Não foi possível carregar as regras da presença.
        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => q.refetch()}>Tentar de novo</Button>
      </div>
    );
  } else {
    const dif = diferencaDaConfiguracao(r, atual);
    const mudou = Object.keys(dif.corpo).length > 0 || JSON.stringify(r) !== JSON.stringify(salvo);
    const desab = !podeEditar || m.isPending;
    const termoMudou = r.termoTexto.trim() !== atual.termoTexto;
    corpo = (
      <>
        <LinhaDeAjuste titulo="Selfie e localização" descricao="O que a entrada e a saída pedem — no app do colaborador e quando o representante registra. O raio da arena ainda não foi definido: a localização não bloqueia." colunas={2}>
          <div className="cfg-campo-bloco min-w-0">
            <span className="cfg-rotulo" id="cfg-prs-selfie-rotulo">Selfie obrigatória</span>
            <div className={cn("cfg-campo justify-between", r.selfieObrigatoria !== salvo.selfieObrigatoria && "cfg-campo-alterado")}>
              <span className="text-sm text-foreground">{r.selfieObrigatoria ? "Sim" : "Não"}</span>
              <Switch checked={r.selfieObrigatoria} disabled={desab} onCheckedChange={(v) => setR({ ...r, selfieObrigatoria: v })} aria-labelledby="cfg-prs-selfie-rotulo" data-testid="cfg-prs-selfie" />
            </div>
            <p className="cfg-apoio text-muted-foreground">na entrada e na saída · padrão: {pad.selfieObrigatoria ? "sim" : "não"}</p>
          </div>
          <div className="cfg-campo-bloco min-w-0">
            <label htmlFor="cfg-prs-local" className="cfg-rotulo">Localização</label>
            <div className={cn("cfg-campo", r.localizacao !== salvo.localizacao && "cfg-campo-alterado")}>
              <select id="cfg-prs-local" value={r.localizacao} disabled={desab} onChange={(e) => setR({ ...r, localizacao: e.target.value as ModoDeLocalizacao })}
                className="w-full h-full bg-transparent border-0 outline-none text-sm text-foreground">
                <option value="registrar">Registrar</option>
                <option value="nao_registrar">Não registrar</option>
              </select>
            </div>
            <p className="cfg-apoio text-muted-foreground">{r.localizacao === "registrar" ? "pede o GPS; negado, registra sem" : "não pede o GPS"}</p>
          </div>
        </LinhaDeAjuste>

        <LinhaDeAjuste titulo="Hora extra e ajuste do produtor" descricao="Valor-hora = diária ÷ divisor. No check-out final, a produção ajusta o valor calculado dentro deste limite; o DP não tem limite." colunas={2}>
          <CampoNumero id="cfg-prs-divisor" rotulo="Divisor da hora extra" unidade="h" valor={r.horaExtraDivisor} onChange={(v) => setR({ ...r, horaExtraDivisor: v })}
            salvo={salvo.horaExtraDivisor} padrao={pad.horaExtraDivisor} disabled={desab} />
          <CampoNumero id="cfg-prs-ajuste" rotulo="Ajuste da produção (até)" unidade="%" valor={r.produtorAjusteMaxPct} onChange={(v) => setR({ ...r, produtorAjusteMaxPct: v })}
            salvo={salvo.produtorAjusteMaxPct} padrao={pad.produtorAjusteMaxPct} disabled={desab} />
        </LinhaDeAjuste>

        <LinhaDeAjuste titulo="Guarda das selfies" descricao="Por quanto tempo as fotos e a localização ficam guardadas depois do pagamento. Hoje só registra a política — a limpeza automática vem depois." colunas={2}>
          <CampoNumero id="cfg-prs-retencao" rotulo="Guardar por" unidade="dias" valor={r.retencaoDias} onChange={(v) => setR({ ...r, retencaoDias: v })}
            salvo={salvo.retencaoDias} padrao={pad.retencaoDias} disabled={desab} />
        </LinhaDeAjuste>

        <LinhaDeAjuste
          titulo={<span className="inline-flex flex-wrap items-center gap-2">Termo de consentimento (LGPD)
            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-danger-soft text-2xs font-semibold text-danger" data-testid="cfg-prs-rascunho"><FileWarning className="w-3 h-3" aria-hidden="true" />RASCUNHO — revisar com o jurídico</span>
          </span>}
          descricao="O colaborador aceita no primeiro acesso ao app. Mudou o texto? Troque a versão: todo mundo aceita de novo."
          colunas={2}
        >
          <div className="cfg-campo-bloco min-w-0 col-span-full">
            <label htmlFor="cfg-prs-versao" className="cfg-rotulo">Versão</label>
            <div className={cn("cfg-campo max-w-[280px]", r.termoVersao !== salvo.termoVersao && "cfg-campo-alterado")}>
              <input id="cfg-prs-versao" type="text" value={r.termoVersao} disabled={desab} maxLength={40} onChange={(e) => setR({ ...r, termoVersao: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className="cfg-campo-input" style={{ textAlign: "left" }} autoComplete="off" />
            </div>
            <p className={cn("cfg-apoio", termoMudou && r.termoVersao.trim() === atual.termoVersao ? "font-medium text-danger" : "text-muted-foreground")}>
              {termoMudou && r.termoVersao.trim() === atual.termoVersao ? "O texto mudou: troque a versão." : `em vigor: ${atual.termoVersao}`}
            </p>
          </div>
          <div className="cfg-campo-bloco min-w-0 col-span-full">
            <label htmlFor="cfg-prs-termo" className="cfg-rotulo">Texto que o colaborador lê</label>
            <Textarea id="cfg-prs-termo" value={r.termoTexto} disabled={desab} rows={9} onChange={(e) => setR({ ...r, termoTexto: e.target.value })}
              className={cn("rounded-lg text-sm leading-6", termoMudou && "border-warning-strong")} data-testid="cfg-prs-termo" />
          </div>
        </LinhaDeAjuste>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-t border-border bg-surface-muted/60 max-sm:px-4">
          {podeEditar ? (
            <>
              {dif.erro && mudou && <p role="alert" className="m-0 text-xs font-medium text-danger basis-full">{dif.erro}</p>}
              <Button type="button" size="sm" className="h-9 rounded-lg" disabled={!mudou || !!dif.erro || m.isPending}
                onClick={() => m.mutate(dif.corpo as Record<string, unknown>)} data-testid="cfg-prs-salvar">
                {m.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Salvando…</> : "Salvar regras da presença"}
              </Button>
              {mudou && (
                <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg gap-1.5" onClick={() => setR(salvo)} disabled={m.isPending}>
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />Desfazer
                </Button>
              )}
              <span className="text-2xs text-muted-foreground sm:ml-auto">Salva na hora, separado da barra de alterações da página.</span>
            </>
          ) : (
            <p className="m-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="w-3.5 h-3.5" aria-hidden="true" />Só o administrador muda estas regras. O DP vê o que está valendo.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <GrupoDeAjustes
      id="cfg-presenca"
      titulo="Presença e acesso do colaborador"
      descricao={<>As regras do check-in com selfie, do check-out final e do app do colaborador. Decisões provisórias nossas, a confirmar com o dono.<span className="block mt-1.5">{selo}</span></>}
      data-testid="cfg-presenca"
    >
      {corpo}
    </GrupoDeAjustes>
  );
}
