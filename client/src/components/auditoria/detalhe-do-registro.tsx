/**
 * Detalhe de um registro do Log de auditoria — painel lateral (redesenho 08/10).
 *
 * Antes o registro abria DENTRO da lista (a pilha toda descia) com uma tabela
 * de três colunas de 12px e os detalhes técnicos num <details> solto. Agora um
 * painel à direita, que deixa a lista no lugar e permite andar de registro em
 * registro (↑/↓ ou os botões do rodapé) — é assim que se investiga:
 *   - cabeçalho: o tom e a ação, quem fez o quê (a frase), quando (com
 *     segundos e "há quanto tempo") e o contexto (evento · função · colaborador);
 *   - "O que mudou": cada campo com o valor de antes e o de depois lado a lado;
 *     ou os dados de uma criação / como estava antes de excluir;
 *   - "Investigar": ver tudo da mesma pessoa ou do mesmo módulo (os filtros de
 *     sempre, um clique);
 *   - detalhes técnicos recolhidos (nº, IP, navegador, código do registro com
 *     "copiar") e, só quando o registro não tem como ser lido em português, os
 *     dados gravados em JSON formatado e recolhível.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Boxes, Check, ChevronDown, Copy, FileJson, Info, UserRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MODULOS } from "@shared/log-auditoria";
import { TOM, dataHoraCompleta, dataHoraSp, haQuantoTempo, jsonGravado, navegadorCurto, plural } from "./auditoria-utils";
import { Valor, nomeDaPessoa, type ItemDoLog } from "./lista-da-auditoria";

const SEM_NOME = "Outro campo";

function NotaSemNome({ n, onVer }: { n: number; onVer: () => void }) {
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground">
      <span>+ {plural(n, "campo ainda sem nome em português", "campos ainda sem nome em português")}</span>
      <button type="button" onClick={onVer} className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Ver nos dados gravados
      </button>
    </p>
  );
}

function Secao({ titulo, contagem, children, testid }: { titulo: string; contagem?: number; children: ReactNode; testid?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card" data-testid={testid}>
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-foreground">{titulo}</h3>
        {contagem !== undefined && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-semibold tabular-nums text-slate-600">{contagem}</span>
        )}
      </header>
      <div className="px-4 pb-3.5">{children}</div>
    </section>
  );
}

function CopiarCodigo({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!valor || !navigator.clipboard) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(valor).then(() => {
          setCopiado(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopiado(false), 1600);
        }).catch(() => {});
      }}
      className="pas-alvo inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-primary transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={copiado ? "Código copiado" : "Copiar o código do registro"}
    >
      {copiado ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      <span aria-live="polite">{copiado ? "Copiado" : "Copiar"}</span>
    </button>
  );
}

function Json({ rotulo, obj }: { rotulo: string; obj: Record<string, unknown> }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-2xs font-medium text-muted-foreground">{rotulo}</p>
      <pre className="aud-json">{JSON.stringify(obj, null, 2)}</pre>
    </div>
  );
}

export function DetalheDoRegistro({ item, aberto, onFechar, posicao, onAnterior, onProximo, onFiltrarPessoa, onFiltrarModulo }: {
  item: ItemDoLog | null;
  aberto: boolean;
  onFechar: () => void;
  /** Posição na página: { i: 0-based, n: total da página }. */
  posicao: { i: number; n: number };
  onAnterior: (() => void) | null;
  onProximo: (() => void) | null;
  /** null quando a pessoa não está na lista de usuários (ex.: "Sistema"). */
  onFiltrarPessoa: (() => void) | null;
  onFiltrarModulo: (() => void) | null;
}) {
  // O último registro mostrado fica no painel enquanto ele desliza para fora
  // (sem ele o painel esvaziava no meio da animação de fechar).
  const ultimo = useRef<ItemDoLog | null>(item);
  if (item) ultimo.current = item;
  const mostrado = item ?? ultimo.current;
  const log = mostrado?.log;
  const d = mostrado?.d;
  const tom = d ? TOM[d.tom] : TOM.neutro;
  const Icone = tom.icon;

  const antes = log ? jsonGravado(log.previousData) : null;
  const depois = log ? jsonGravado(log.newData) : null;
  const temDetalhe = !!d && (d.mudancas.length > 0 || d.dados.length > 0);
  // "Outro campo" (campo ainda sem nome em português) não diz nada ao lado de um
  // valor solto: sai da lista legível e vira UMA linha que leva aos dados gravados.
  const legivel = <T extends { campo: string }>(xs: T[]) => xs.filter((x) => x.campo !== SEM_NOME);
  const mudancas = d ? legivel(d.mudancas) : [];
  const dados = d ? legivel(d.dados) : [];
  const semNome = d ? d.mudancas.length - mudancas.length + d.dados.length - dados.length : 0;
  const tecnicoRef = useRef<HTMLDetailsElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const abrirTecnico = () => {
    const el = tecnicoRef.current;
    if (!el) return;
    el.open = true;
    el.querySelector("[data-testid='aud-json']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  // JSON só quando o português não dá conta: nada legível, ou campos sem nome.
  const mostrarJson = (!!antes || !!depois) && (!temDetalhe || semNome > 0);

  const navegarPorTeclado = (e: KeyboardEvent) => {
    const alvo = e.target as HTMLElement;
    if (alvo.closest("input, textarea, pre, [contenteditable=true]")) return;
    if ((e.key === "ArrowUp" || e.key === "k") && onAnterior) { e.preventDefault(); onAnterior(); }
    if ((e.key === "ArrowDown" || e.key === "j") && onProximo) { e.preventDefault(); onProximo(); }
  };

  // Alteração gravada sem diff (nenhum campo mudou): os dados são o registro
  // inteiro, não "o que foi registrado" — a tela diz isso (08/10).
  const tituloDosDados = log?.action === "delete" ? "Como estava antes de excluir"
    : d?.semMudancaDeCampo ? "Alteração sem mudança de campo registrada" : "Dados registrados";

  return (
    <Sheet open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent
        side="right"
        ref={painelRef}
        tabIndex={-1}
        // O foco vai para o painel (não para o primeiro botão): ↑/↓ já andam e
        // nenhum "Tudo de…" fica marcado sem a pessoa ter escolhido.
        onOpenAutoFocus={(e) => { e.preventDefault(); painelRef.current?.focus(); }}
        // Ao fechar, o foco volta para a linha do registro que estava aberto —
        // não para a primeira que abriu o painel (a pessoa pode ter andado com ↑/↓).
        onCloseAutoFocus={(e) => {
          const linha = log ? document.querySelector<HTMLElement>(`[data-testid="log-${log.logNumber}"]`) : null;
          if (linha) { e.preventDefault(); linha.focus({ preventScroll: true }); }
        }}
        onKeyDown={navegarPorTeclado}
        className="aud-ficha flex w-full outline-none flex-col gap-0 border-l border-border bg-surface-muted p-0 sm:max-w-[560px]"
        data-testid="aud-detalhe"
      >
        {log && d ? (
          <>
            {/* ── Cabeçalho: o quê, quem, quando ── */}
            <div className="shrink-0 border-b border-border bg-card px-5 pb-4 pt-5 pr-12">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full", tom.marca)} aria-hidden="true"><Icone className="h-3.5 w-3.5" /></span>
                <span className={cn("aud-chip", tom.chip)}>{d.acao}</span>
                <span className="text-xs text-muted-foreground">{d.modulo}</span>
                <span className="ml-auto text-2xs tabular-nums text-muted-foreground">nº {log.logNumber}</span>
              </div>
              <SheetTitle className="mt-3 text-[15px] font-normal leading-6 text-foreground break-words">
                <span className="font-semibold">{nomeDaPessoa(log)}</span> {d.frase}
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs text-muted-foreground">
                <time dateTime={log.createdAt} className="tabular-nums">{dataHoraCompleta(log.createdAt)}</time>
                {haQuantoTempo(log.createdAt) && <> · {haQuantoTempo(log.createdAt)}</>}
              </SheetDescription>
              {d.contexto.length > 0 && (
                <p className="mt-2.5 rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs leading-relaxed text-slate-700 break-words">
                  {d.contexto.join(" · ")}
                </p>
              )}
            </div>

            {/* ── Corpo ── */}
            <div key={log.id} className="aud-entra min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {d.mudancas.length > 0 && (
                <Secao titulo="O que mudou" contagem={d.mudancas.length} testid="aud-mudancas">
                  {mudancas.length > 0 && <div className="aud-diff-caixa">
                  <div className="aud-diff-cab" aria-hidden="true"><span>Antes</span><span /><span>Depois</span></div>
                  <dl className="aud-diff">
                    {mudancas.map((m, i) => (
                      <div key={`${m.campo}-${i}`} className="aud-diff-linha">
                        <dt className="aud-diff-campo">{m.campo}</dt>
                        <dd className="aud-diff-antes"><span className="sr-only">Antes: </span><Valor v={m.antes} /></dd>
                        <span className="aud-diff-seta" aria-hidden="true">→</span>
                        <dd className="aud-diff-depois"><span className="sr-only">Depois: </span><Valor v={m.depois} /></dd>
                      </div>
                    ))}
                  </dl>
                  </div>}
                  {semNome > 0 && <NotaSemNome n={semNome} onVer={abrirTecnico} />}
                </Secao>
              )}

              {d.mudancas.length === 0 && d.dados.length > 0 && (
                <Secao titulo={tituloDosDados} contagem={d.dados.length} testid="aud-dados">
                  {d.semMudancaDeCampo && (
                    <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground" data-testid="aud-sem-mudanca">
                      Nenhum campo mudou nesta alteração (ou o “antes” não foi gravado). Abaixo, o registro como ficou:
                    </p>
                  )}
                  {dados.length > 0 && <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">
                    {dados.map((x, i) => (
                      <div key={`${x.campo}-${i}`} className="min-w-0">
                        <dt className="text-2xs font-medium text-muted-foreground">{x.campo}</dt>
                        <dd className="mt-0.5 text-sm text-foreground break-words"><Valor v={x.valor} /></dd>
                      </div>
                    ))}
                  </dl>}
                  {semNome > 0 && <NotaSemNome n={semNome} onVer={abrirTecnico} />}
                </Secao>
              )}

              {!temDetalhe && (
                <div className="flex gap-2.5 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground" data-testid="aud-sem-detalhe">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <p>
                    <span className="font-medium text-slate-700">Este registro não guarda detalhes de campos.</span>{" "}
                    Ele diz quem fez e quando; o valor de cada campo não foi gravado nesta ação.
                  </p>
                </div>
              )}

              {(onFiltrarPessoa || onFiltrarModulo) && (
                <Secao titulo="Investigar">
                  <div className="flex flex-wrap gap-2">
                    {onFiltrarPessoa && (
                      <button type="button" onClick={onFiltrarPessoa} className="aud-pivo" data-testid="aud-ver-pessoa">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">Tudo de {nomeDaPessoa(log)}</span>
                      </button>
                    )}
                    {onFiltrarModulo && (
                      <button type="button" onClick={onFiltrarModulo} className="aud-pivo" data-testid="aud-ver-modulo">
                        <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate">Tudo em {MODULOS[log.entityType]?.rotulo ?? d.modulo}</span>
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-2xs text-muted-foreground">Troca o filtro da lista e mantém o período e a busca.</p>
                </Secao>
              )}

              <details ref={tecnicoRef} className="aud-tecnico group rounded-xl border border-border bg-card" data-testid="aud-tecnico">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-foreground outline-none hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  Detalhes técnicos
                  <span className="hidden font-normal text-muted-foreground sm:inline">nº, IP, navegador{mostrarJson ? ", dados gravados" : ""}</span>
                  <ChevronDown className="aud-tecnico-seta ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </summary>
                <div className="space-y-3 px-4 pb-4">
                  <dl className="grid grid-cols-1 gap-x-5 gap-y-2.5 text-xs sm:grid-cols-2">
                    <div><dt className="text-2xs font-medium text-muted-foreground">Registro nº</dt><dd className="mt-0.5 font-mono tabular-nums text-slate-700">{log.logNumber}</dd></div>
                    <div><dt className="text-2xs font-medium text-muted-foreground">Data e hora</dt><dd className="mt-0.5 tabular-nums text-slate-700">{dataHoraSp(log.createdAt)}</dd></div>
                    <div><dt className="text-2xs font-medium text-muted-foreground">IP</dt><dd className="mt-0.5 font-mono text-slate-700">{log.ipAddress || "—"}</dd></div>
                    <div><dt className="text-2xs font-medium text-muted-foreground">Navegador</dt><dd className="mt-0.5 text-slate-700">{navegadorCurto(log.userAgent)}</dd></div>
                    <div className="sm:col-span-2">
                      <dt className="text-2xs font-medium text-muted-foreground">Código do registro alterado</dt>
                      <dd className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 font-mono text-slate-700 break-all">{log.entityId || "—"}</span>
                        {log.entityId && <CopiarCodigo valor={log.entityId} />}
                      </dd>
                    </div>
                  </dl>
                  {mostrarJson && (
                    <div className="space-y-2 border-t border-border pt-3" data-testid="aud-json">
                      <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-muted-foreground">
                        <FileJson className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {temDetalhe
                          ? `${plural(semNome, "campo ainda não tem", "campos ainda não têm")} nome em português — os dados como foram gravados:`
                          : "Os campos gravados são todos técnicos — os dados como foram gravados:"}
                      </p>
                      <div className={cn("grid gap-2", antes && depois ? "sm:grid-cols-2" : "grid-cols-1")}>
                        {antes && <Json rotulo="Antes" obj={antes} />}
                        {depois && <Json rotulo={antes ? "Depois" : "Gravado"} obj={depois} />}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>

            {/* ── Rodapé: andar pela lista sem fechar ── */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-3 sm:px-5">
              <button type="button" onClick={onAnterior ?? undefined} disabled={!onAnterior} className="aud-nav" aria-label="Registro anterior (mais recente)" data-testid="aud-anterior">
                <ArrowUp className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Mais recente</span>
              </button>
              <button type="button" onClick={onProximo ?? undefined} disabled={!onProximo} className="aud-nav" aria-label="Próximo registro (mais antigo)" data-testid="aud-proximo">
                <ArrowDown className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Mais antigo</span>
              </button>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" aria-live="polite"><span className="sr-only">Registro </span>{posicao.i + 1} de {posicao.n}<span className="sr-only"> nesta página</span></span>
              <span className="hidden whitespace-nowrap text-2xs text-muted-foreground lg:inline" aria-hidden="true">· <kbd className="aud-tecla">↑</kbd> <kbd className="aud-tecla">↓</kbd> para andar</span>
              <button type="button" onClick={onFechar} className="aud-nav ml-auto" data-testid="aud-fechar">Fechar</button>
            </div>
          </>
        ) : (
          <SheetTitle className="sr-only">Registro do log</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}
