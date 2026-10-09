/**
 * Estados do Log de auditoria (redesenho 08/10) — no desenho dos estados do
 * Controle RH e do Histórico: esqueleto com a geometria real da lista (dias e
 * linhas da trilha), erro que diz o que falhou com "Tentar novamente", vazio
 * com saída (ampliar o período), sem resultado com "Limpar filtros", acesso
 * restrito e o aviso de nomes que não carregaram.
 */
import type { ReactNode } from "react";
import { AlertCircle, CalendarRange, Inbox, Info, Lock, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EsqueletoDaAuditoria({ rotulo = "Carregando registros…" }: { rotulo?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={rotulo} className="aud-moldura overflow-hidden" data-testid="aud-carregando">
      <span className="sr-only">{rotulo}</span>
      <div aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="pas-osso h-3 w-40" /><div className="pas-osso ml-auto hidden h-3 w-32 sm:block" />
        </div>
        {[5, 3].map((n, g) => (
          <div key={g}>
            <div className="flex items-center gap-2.5 px-4 pb-1.5 pt-3.5">
              <div className="pas-osso h-3 w-14" /><div className="pas-osso h-2.5 w-28" /><span className="h-px flex-1 bg-border" />
            </div>
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <div className="pas-osso mt-1.5 hidden h-3 w-9 sm:block" />
                <div className="pas-osso h-7 w-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                  <div className="pas-osso h-3.5 max-w-[70%]" style={{ width: `${48 + ((i * 17 + g * 11) % 30)}%` }} />
                  <div className="pas-osso h-2.5 w-52 max-w-[50%]" />
                </div>
                <div className="pas-osso mt-1 hidden h-5 w-20 rounded-full md:block" />
                <div className="pas-osso mt-1.5 hidden h-3 w-20 lg:block" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Moldura({ tom = "neutro", icone, titulo, children, acoes, testid, role }: {
  tom?: "neutro" | "erro"; icone: ReactNode; titulo: string; children: ReactNode; acoes?: ReactNode; testid: string; role?: string;
}) {
  return (
    <div role={role} className={`pas-entra flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center ${tom === "erro" ? "border-danger/25" : "border-border"}`} data-testid={testid}>
      <span className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full ${tom === "erro" ? "bg-danger-soft text-danger" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
        {icone}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <div className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{children}</div>
      {acoes && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{acoes}</div>}
    </div>
  );
}

export function ErroDaAuditoria({ status, detalhe, onTentar, tentando }: { status: number | undefined; detalhe: string; onTentar: () => void; tentando: boolean }) {
  const titulo = status === 401
    ? "Sua sessão expirou. Entre novamente para consultar o log."
    : status === 403
      ? "Você não tem permissão para consultar o log de auditoria."
      : "Não foi possível carregar os registros";
  return (
    <Moldura tom="erro" role="alert" icone={<AlertCircle className="h-5 w-5" />} titulo={titulo} testid="aud-erro"
      acoes={status === 403 ? undefined : (
        <Button variant="outline" className="rounded-lg" onClick={onTentar} disabled={tentando} data-testid="aud-tentar-novamente">
          <RotateCw className={`mr-1.5 h-4 w-4 ${tentando ? "animate-spin" : ""}`} aria-hidden="true" />{tentando ? "Tentando…" : "Tentar novamente"}
        </Button>
      )}>
      {detalhe}
      {status !== 401 && status !== 403 && <p className="mt-2 text-xs text-muted-foreground/90">Isto não significa que não existam registros.</p>}
    </Moldura>
  );
}

export function VazioDaAuditoria({ filtrado, periodo, onLimpar, onAmpliar }: {
  filtrado: boolean;
  /** "Últimos 30 dias" — o período em vigor, por extenso. */
  periodo: string;
  onLimpar: () => void;
  /** Passa para o último ano (null quando já está nele). */
  onAmpliar: (() => void) | null;
}) {
  if (filtrado) {
    return (
      <Moldura icone={<SearchX className="h-5 w-5" />} titulo="Nenhum registro com esses filtros" testid="aud-sem-resultado"
        acoes={<>
          <Button variant="outline" className="rounded-lg" onClick={onLimpar} data-testid="aud-limpar-filtros-vazio">Limpar filtros</Button>
          {onAmpliar && <Button variant="ghost" className="rounded-lg text-primary hover:bg-brand-soft hover:text-primary" onClick={onAmpliar}><CalendarRange className="mr-1.5 h-4 w-4" aria-hidden="true" />Procurar no último ano</Button>}
        </>}>
        Nenhuma atividade corresponde à busca e aos recortes de agora ({periodo.toLowerCase()}).
      </Moldura>
    );
  }
  return (
    <Moldura icone={<Inbox className="h-5 w-5" />} titulo="Nenhuma atividade registrada" testid="aud-vazio"
      acoes={onAmpliar ? <Button variant="outline" className="rounded-lg" onClick={onAmpliar}><CalendarRange className="mr-1.5 h-4 w-4" aria-hidden="true" />Ver o último ano</Button> : undefined}>
      {onAmpliar
        ? <>Ninguém criou, alterou ou decidiu nada {/^Últimas/.test(periodo) ? "nas" : /^Últimos/.test(periodo) ? "nos" : "no"} {periodo.toLowerCase()}. Amplie o período para ver o que veio antes.</>
        : <>Ainda não há atividades registradas no último ano.</>}
    </Moldura>
  );
}

export function SemAcessoAuditoria() {
  return (
    <Moldura icone={<Lock className="h-5 w-5" />} titulo="Acesso restrito" testid="aud-sem-acesso">
      Apenas administradores podem acessar o log de auditoria.
    </Moldura>
  );
}

/** Os nomes (eventos, funções, colaboradores, pessoas) não chegaram: a lista funciona, mas com "não encontrado". */
export function AvisoDeNomes({ onTentar, tentando }: { onTentar: () => void; tentando: boolean }) {
  return (
    <div role="status" className="pas-entra flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-muted/70 px-3.5 py-2.5 text-xs text-slate-600" data-testid="aud-nomes-parciais">
      <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-[260px]">
        <span className="font-semibold text-slate-700">Alguns nomes não carregaram.</span>{" "}
        Onde aparecer “não encontrado”, o registro existe — só o nome do evento, da função, do colaborador ou da pessoa não veio.
      </p>
      <button type="button" onClick={onTentar} disabled={tentando} className="pas-alvo inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 font-medium text-slate-700 transition-colors hover:bg-muted disabled:opacity-60">
        <RotateCw className={`h-3.5 w-3.5 ${tentando ? "animate-spin" : ""}`} aria-hidden="true" />Carregar nomes
      </button>
    </div>
  );
}
