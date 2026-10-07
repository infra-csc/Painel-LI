/**
 * Estados da Sugestão de escala (25/09 — extraídos da página): sem evento
 * escolhido e período inválido. Cada um tem uma saída nomeada.
 *
 * 07/10 (redesenho): o desenho dos estados da Validação e da Escalação
 * (`EstadoDaValidacao`: círculo com o ícone, título, a causa e o próximo
 * passo) — e ganharam a companhia do esqueleto no formato da tela, do erro de
 * carregamento e do "sem acesso", que antes eram um cartão genérico de lista,
 * uma faixa vermelha solta e um cartão com h3 sem ícone.
 */
import { CalendarDays, CalendarX2, CloudOff, EyeOff, FolderInput, Lock, RotateCw, Save } from "lucide-react";
import { MotivoDesabilitado } from "@/components/common/motivo-desabilitado";
import { cn } from "@/lib/utils";
import { PERIOD_MARGIN_DAYS } from "@/components/scaling-validation/scaling-grid-utils";
import { EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";

/** Botões dos estados — o mesmo desenho do `AcaoDoEstado` da Validação, com `disabled`. */
const ACAO = "sug-alvo inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const ACAO_PRINCIPAL = cn(ACAO, "bg-primary text-primary-foreground shadow-1 hover:bg-primary-hover");
const ACAO_SECUNDARIA = cn(ACAO, "border border-border bg-card text-slate-700 hover:bg-muted");

export function SemEvento({ parkedEventName, readOnly, busy, functionsError, onPickEvent, onCopyEvent }: {
  /** Grade de OUTRO evento ainda em memória (o usuário limpou o seletor). */
  parkedEventName: string | null;
  readOnly: boolean;
  busy: boolean;
  functionsError: boolean;
  onPickEvent: () => void;
  onCopyEvent: () => void;
}) {
  return (
    <EstadoDaValidacao
      icone={<CalendarDays aria-hidden="true" />}
      titulo="Escolha o evento para abrir a grade"
      texto={<>A grade cobre o período do evento (ajustável em até {PERIOD_MARGIN_DAYS} dias para cada lado) e o rascunho fica salvo neste navegador por 7 dias, separado por evento.</>}
      testId="sug-sem-evento"
      acao={
        <div className="flex flex-col items-center gap-4">
          {/* Limpou o seletor com a grade montada: ela não sumiu — está guardada no rascunho do evento. */}
          {parkedEventName && (
            <p className="inline-flex max-w-md items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-medium text-primary">
              <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Sua grade de {parkedEventName} continua salva — selecione o evento para voltar a ela.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={ACAO_PRINCIPAL} onClick={onPickEvent}>
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Selecionar evento
            </button>
            <MotivoDesabilitado motivo={readOnly ? "Modo leitura — só Produção e Admin montam a grade" : undefined} desabilitado={busy || functionsError}>
              <button type="button" className={ACAO_SECUNDARIA} disabled={busy || functionsError} onClick={onCopyEvent}>
                <FolderInput className="h-4 w-4" aria-hidden="true" /> Copiar de um evento anterior
              </button>
            </MotivoDesabilitado>
          </div>
          {readOnly && (
            <p className="text-xs text-muted-foreground">Em modo leitura dá para consultar a tela, mas não montar nem enviar a grade.</p>
          )}
        </div>
      }
    />
  );
}

/** O motivo já está no alerta inline acima (periodError); aqui só a saída. */
export function PeriodoInvalido({ canReset, onEventPeriod }: { canReset: boolean; onEventPeriod: () => void }) {
  return (
    <EstadoDaValidacao
      icone={<CalendarX2 aria-hidden="true" />}
      titulo="A grade só abre com um período válido"
      texto="Corrija as datas em “Dias na grade”, logo acima, ou volte para as datas do evento."
      testId="sug-periodo-invalido"
      acao={canReset ? (
        <button type="button" className={ACAO_SECUNDARIA} onClick={onEventPeriod}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" /> Usar o período do evento
        </button>
      ) : undefined}
    />
  );
}

/**
 * Modo leitura sem grade: a grade é um rascunho de quem monta (Produção/Admin)
 * e não vem do servidor — em leitura ela é sempre vazia. Em vez de três
 * caminhos desabilitados, o estado diz por quê (o caminho para a Validação já
 * está na faixa logo acima).
 */
export function LeituraSemGrade({ temEnviadas }: { temEnviadas: boolean }) {
  return (
    <EstadoDaValidacao
      icone={<EyeOff aria-hidden="true" />}
      titulo="Em modo leitura não há grade para montar"
      texto={temEnviadas
        ? "A grade é montada por Produção e Admin, no navegador de quem monta. As vagas que já foram enviadas deste evento estão na Validação."
        : "A grade é montada por Produção e Admin, no navegador de quem monta. Este evento ainda não tem vagas enviadas para a Validação."}
      testId="sug-leitura-sem-grade"
    />
  );
}

/**
 * Depois do envio: a faixa verde diz o que foi enviado; aqui, o que acontece
 * agora — os três passos seguintes do módulo, os mesmos da barra do topo.
 * Antes ficava a grade vazia com os botões de montar, como se nada tivesse
 * acontecido.
 */
export function ProximosPassos() {
  const passos = [
    { n: 2, titulo: "Validação", texto: "Cada área confere as vagas das suas funções e valida, pede ajuste ou pede exclusão." },
    { n: 3, titulo: "Aprovação", texto: "O aprovador de cada função decide as vagas validadas e os pedidos das áreas." },
    { n: 4, titulo: "Histórico", texto: "A linha do tempo do evento guarda cada passo, do envio à decisão." },
  ];
  return (
    <section aria-labelledby="sug-proximos" className="sug-entra rounded-xl border border-border bg-card px-5 py-4 shadow-[0_1px_2px_hsl(222_47%_11%/0.04)]" data-testid="sug-proximos-passos">
      <h2 id="sug-proximos" className="text-[13px] font-semibold text-foreground">O que acontece agora</h2>
      <ol className="mt-3 grid gap-3 md:grid-cols-3 md:gap-0">
        {passos.map((p, i) => (
          <li key={p.n} className={cn("flex gap-3 md:px-4", i === 0 && "md:pl-0", i > 0 && "md:border-l md:border-border")}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold tabular-nums text-primary" aria-hidden="true">{p.n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{p.titulo}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Eventos/funções não carregaram: a causa e o "tentar de novo", no desenho dos estados. */
export function ErroAoCarregar({ mensagem, tentando, onRetry }: { mensagem: string; tentando: boolean; onRetry: () => void }) {
  return (
    <EstadoDaValidacao
      tom="erro"
      icone={<CloudOff aria-hidden="true" />}
      titulo="Não foi possível carregar eventos e funções"
      texto={<>{mensagem} O rascunho local da grade está intacto — nada se perdeu.</>}
      testId="sug-erro"
      acao={
        <button type="button" className={ACAO_PRINCIPAL} onClick={onRetry} data-testid="button-tentar-de-novo">
          <RotateCw className={cn("h-4 w-4", tentando && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
          {tentando ? "Tentando…" : "Tentar de novo"}
        </button>
      }
    />
  );
}

/** Sem permissão para a tela — mesmo texto de antes, no desenho dos estados. */
export function AcessoNegadoSugestao() {
  return (
    <div className="sug-entra mx-auto mt-6 max-w-xl rounded-xl border border-border bg-card px-8 py-12 text-center" data-testid="sug-sem-acesso">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3.5 text-[15px] font-semibold text-foreground">Acesso negado</h3>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
        Você não tem permissão para sugerir escala. Se você monta a escala dos eventos, peça acesso ao administrador do painel.
      </p>
    </div>
  );
}

/**
 * Esqueleto no formato da tela (linha do evento, resumo, grade), com o brilho
 * que passa — antes era o cartão genérico de lista de três linhas.
 */
export function EsqueletoDaSugestao({ label }: { label: string }) {
  return (
    <div className="space-y-5" aria-busy="true" data-testid="sug-esqueleto">
      <div className="space-y-2" aria-hidden="true">
        <div className="flex items-center gap-2"><div className="val-osso h-4 w-4 rounded" /><div className="val-osso h-9 w-full max-w-[440px] rounded-lg" /></div>
        <div className="val-osso ml-6 h-3 w-56" />
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className="val-osso h-3.5 w-32" />
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border xl:grid-cols-[minmax(0,1fr)_repeat(3,minmax(150px,0.34fr))]">
          <div className="col-span-3 space-y-2.5 bg-card px-4 py-3 xl:col-span-1"><div className="val-osso h-3 w-24" /><div className="val-osso h-8 w-full max-w-[520px] rounded-lg" /></div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 bg-card px-4 py-3"><div className="val-osso h-3 w-16" /><div className="val-osso h-6 w-10" /><div className="val-osso h-2.5 w-4/5" /></div>
          ))}
        </div>
      </div>
      <div className="space-y-3" aria-hidden="true">
        <div className="val-osso h-3.5 w-40" />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="h-11 border-b border-border bg-surface-muted" />
          {[62, 48, 70, 55, 40].map((w, i) => (
            <div key={i} className="flex h-[50px] items-center gap-3 border-b border-border px-3 last:border-b-0">
              <div className="w-[120px] space-y-1.5 lg:w-[200px]"><div className="val-osso h-3.5" style={{ width: `${w}%` }} /><div className="val-osso h-2.5 w-1/3" /></div>
              <div className="flex gap-2.5">{[0, 1, 2, 3, 4].map((c) => <div key={c} className="val-osso h-8 w-12 rounded-md" />)}</div>
              <div className="val-osso ml-auto hidden h-5 w-40 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">{label}</p>
    </div>
  );
}
