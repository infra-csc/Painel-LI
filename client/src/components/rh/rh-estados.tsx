// Estados da página do Controle RH — redesenho 08/10.
//
// Carregando: esqueleto com a geometria real (resumo, fila, filtros, faixa do
// evento e linhas), com o brilho da família (pas-osso). Erro: o que falhou e
// "Tentar novamente" (antes um aviso genérico). Vazio: três casos distintos —
// a fila em dia (com a saída para ver os concluídos), nenhum resultado para
// os filtros (com "Limpar filtros") e a fila realmente vazia.
import type { ReactNode } from "react";
import { AlertCircle, CheckCheck, Inbox, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";

export function EsqueletoDoRh() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando a fila do RH" className="flex flex-col gap-4" data-testid="rh-carregando">
      <span className="sr-only">Carregando a fila do RH…</span>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`px-4 py-3.5 space-y-2 ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}>
              <div className="pas-osso h-3 w-20" /><div className={`pas-osso ${i === 0 ? "h-7 w-32" : "h-5 w-10"}`} /><div className="pas-osso h-2.5 w-24" />
            </div>
          ))}
        </div>
        <div className="h-10 border-t border-border bg-surface-muted/60" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-border bg-card overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`px-3.5 pt-3 pb-3.5 space-y-2 ${i > 0 ? "sm:border-l border-border" : ""}`}>
            <div className="pas-osso h-3 w-24" /><div className="pas-osso h-5 w-16" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="flex gap-2">
        <div className="pas-osso h-[34px] flex-[1_1_220px] max-w-[320px] rounded-lg" />
        <div className="pas-osso h-[34px] w-[160px] rounded-lg hidden sm:block" />
        <div className="pas-osso h-[34px] w-[96px] rounded-lg hidden sm:block" />
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-9 border-b border-border bg-surface-muted/70" />
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-muted/40">
          <div className="pas-osso w-4 h-4 rounded" />
          <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-56 max-w-[60%]" /><div className="pas-osso h-2.5 w-40 max-w-[40%]" /></div>
          <div className="pas-osso h-4 w-24 hidden md:block" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
            <div className="flex-1 space-y-1.5"><div className="pas-osso h-3.5 w-44 max-w-[60%]" /><div className="pas-osso h-2.5 w-28 max-w-[40%]" /></div>
            <div className="pas-osso h-5 w-20 hidden md:block" />
            <div className="pas-osso h-4 w-24 hidden lg:block" />
            <div className="pas-osso h-4 w-20" />
            <div className="pas-osso h-8 w-20 rounded-lg hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Moldura({ tom = "neutro", icone, titulo, children, acoes, testid, role }: {
  tom?: "neutro" | "erro" | "ok"; icone: ReactNode; titulo: string; children: ReactNode; acoes?: ReactNode; testid: string; role?: string;
}) {
  return (
    <div role={role} className={`pas-entra flex flex-col items-center text-center rounded-xl border bg-card px-6 py-14 ${tom === "erro" ? "border-danger/25" : "border-border"}`} data-testid={testid}>
      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full mb-3 ${tom === "erro" ? "bg-danger-soft text-danger" : tom === "ok" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`} aria-hidden="true">
        {icone}
      </span>
      <h2 className="m-0 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="m-0 mt-1.5 max-w-[480px] text-sm leading-relaxed text-muted-foreground">{children}</p>
      {acoes && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{acoes}</div>}
    </div>
  );
}

export function ErroDoRh({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Moldura tom="erro" role="alert" icone={<AlertCircle className="w-5 h-5" />} titulo="Não foi possível carregar as prestações" testid="rh-erro"
      acoes={<Button variant="outline" className="rounded-lg" onClick={onRetry} data-testid="rh-tentar-novamente"><RotateCw className="w-4 h-4 mr-1.5" aria-hidden="true" />Tentar novamente</Button>}>
      A fila não chegou — sem ela não dá para dizer o que espera o RH. Verifique sua conexão e tente de novo.
      <span className="block mt-2 text-xs text-muted-foreground/90">Detalhe: {apiErrorMessage(error, "sem resposta do servidor")}</span>
    </Moldura>
  );
}

export function VazioDoRh({ caso, ocultos, onLimpar, onMostrarConcluidos }: {
  /** `filtros`: nada bate com o recorte; `em-dia`: só concluídos/recusados (ocultos); `vazia`: nada na fila. */
  caso: "filtros" | "em-dia" | "vazia";
  /** Concluídos + recusados ocultos pelo interruptor. */
  ocultos: number;
  onLimpar: () => void;
  onMostrarConcluidos: (() => void) | null;
}) {
  const verConcluidos = onMostrarConcluidos && ocultos > 0
    ? <Button variant="outline" className="rounded-lg" onClick={onMostrarConcluidos}>Mostrar concluídos e recusados ({ocultos})</Button>
    : null;
  if (caso === "filtros") {
    return (
      <div id="rh-listing">
        <Moldura icone={<SearchX className="w-5 h-5" />} titulo="Nenhuma prestação com esses filtros" testid="rh-sem-resultado"
          acoes={<><Button variant="outline" className="rounded-lg" onClick={onLimpar} data-testid="rh-limpar-filtros-vazio">Limpar filtros</Button>{verConcluidos}</>}>
          Nada na fila bate com o evento, a busca e os recortes de agora. Ajuste ou limpe para ver as demais prestações.
        </Moldura>
      </div>
    );
  }
  if (caso === "em-dia") {
    return (
      <div id="rh-listing">
        <Moldura tom="ok" icone={<CheckCheck className="w-5 h-5" />} titulo="Fila em dia" testid="rh-em-dia" acoes={verConcluidos}>
          Nenhuma prestação esperando ninguém. Concluídos e recusados ficam ocultos — ligue o interruptor para ver o histórico completo.
        </Moldura>
      </div>
    );
  }
  return (
    <div id="rh-listing">
      <Moldura icone={<Inbox className="w-5 h-5" />} titulo="Nenhuma prestação na fila" testid="rh-vazio">
        As prestações aparecem aqui a partir da escalação confirmada de um evento.
      </Moldura>
    </div>
  );
}
