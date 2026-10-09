/**
 * Visão Quartos do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 * Hotel e tipo aparecem uma vez por grupo, como na planilha, e são editáveis aqui mesmo.
 *
 * 07/10: as faixas de pastel por quarto viraram um filete colorido à esquerda
 * e um respiro entre quartos (a cor continua sendo "quem divide o quarto");
 * "Início/Data ida" e "Término/Data volta" — que eram a ENTRADA e a SAÍDA de
 * cada ocupante — viraram duas colunas com o dia da semana junto da data; o
 * cabeçalho diz quantos quartos há, quantos já estão confirmados e oferece
 * "Refazer sugestões" no lugar em que o resultado aparece.
 *
 * 09/10: entrada e saída vêm da PASSAGEM (regra em shared/datas-do-quarto.ts,
 * calculada no servidor e enviada em `row.datasDoQuarto`); cada data diz de
 * onde veio ("da passagem", "sugerida", "da hospedagem", "da escala") e o
 * motivo de um dia a mais (volta a partir das 18h). Hospedagem reservada com
 * outras datas aparece como aviso na linha, e a observação "Datas diferentes
 * entre os ocupantes" é recalculada com as datas mostradas.
 */
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCheck, Loader2, RefreshCw, BedDouble, Scissors } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RoomGroup } from "@shared/operational-mirror-types";
import { seloDaOrigem } from "@shared/datas-do-quarto";
import { observacaoDeDatas, PREFIXO_DATAS_DIFERENTES } from "@shared/room-pairing";
import { cn } from "@/lib/utils";
import { MoverPara } from "./mover-para";
import { diaSemana, fmtDate, memberInfo, useLarguraMinima, type GroupViewProps } from "./mirror-shared";

/** As cores que separam um quarto do outro — um filete, não um banho de pastel. */
const COR_DO_GRUPO = ["var(--info-strong)", "var(--success-strong)", "var(--warning-strong)", "var(--primary)", "var(--danger-strong)", "var(--muted-foreground)"];

/**
 * Texto editável no lugar, para os campos do grupo (hotel). Salva ao sair do
 * campo ou no Enter; Esc devolve o valor anterior.
 */
function TextoEditavel({ valor, placeholder, aoSalvar, rotulo }: {
  valor: string | null | undefined;
  placeholder: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => { setTexto(valor ?? ""); }, [valor]);
  return (
    <input
      value={texto}
      aria-label={rotulo}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => { if ((valor ?? "") !== texto) aoSalvar(texto.trim()); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { e.preventDefault(); setTexto(valor ?? ""); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 w-full min-w-[130px] rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-foreground transition-colors hover:border-input hover:bg-card focus:border-primary focus:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 placeholder:font-normal placeholder:text-warning"
    />
  );
}

/**
 * Data de entrada/saída de um ocupante. Só aparece como campo no hover e no
 * foco: numa tabela de leitura, seis inputs por linha viram ruído. Quando a
 * pessoa tem data própria (chegou antes, saiu depois), o valor fica destacado —
 * é o sinal de que ela NÃO segue o período do quarto.
 */
function DataDoOcupante({ valor, propria, canEdit, rotulo, aoSalvar }: {
  valor: string | null | undefined;
  propria: boolean;
  canEdit: boolean;
  rotulo: string;
  aoSalvar: (v: string) => void;
}) {
  const iso = valor ? String(valor).slice(0, 10) : "";
  if (!canEdit) {
    return <span className={`tabular-nums ${propria ? "font-semibold text-primary" : ""}`}>{fmtDate(valor)}</span>;
  }
  return (
    <input
      type="date"
      defaultValue={iso}
      aria-label={rotulo}
      title={propria ? "Estadia própria — diferente do período do quarto" : "Segue o período do quarto"}
      onBlur={(e) => { if (e.target.value !== iso) aoSalvar(e.target.value); }}
      className={`esp-data h-7 w-[118px] rounded-md border border-transparent bg-transparent px-1 text-xs tabular-nums transition-colors hover:border-input hover:bg-card focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 ${
        propria ? "font-semibold text-primary" : "text-foreground"}`}
    />
  );
}

export type QuartosViewProps = GroupViewProps<RoomGroup> & {
  /** Estadia de UMA pessoa dentro do quarto — pode diferir do grupo. */
  onPatchMembro?: (membroId: string, campos: Record<string, unknown>) => void;
  /** "Refazer sugestões" no lugar em que o resultado aparece. */
  onRecalc?: () => void;
  recalcPending?: boolean;
};

export function QuartosView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onSeparar, onMover, pendingId, onPatchMembro, onRecalc, recalcPending }: QuartosViewProps) {
  const largo = useLarguraMinima(1024);
  const refazer = canEdit && onRecalc ? (
    <button type="button" onClick={onRecalc} disabled={recalcPending}
      className="esp-alvo inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {recalcPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
      {recalcPending ? "Recalculando…" : "Refazer sugestões"}
    </button>
  ) : null;
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="quartos-vazio">
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><BedDouble className="h-5 w-5" /></span>
        <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma sugestão de quarto ainda</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          As sugestões juntam primeiro quem tem as mesmas datas, depois a mesma função.{canEdit ? " Gere a partir das hospedagens do evento." : ""}
        </p>
        {refazer && <div className="mt-4">{refazer}</div>}
      </div>
    );
  }
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  /** Como cada quarto se descreve na lista de destinos: por quem está nele. */
  const descreve = (g: RoomGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    // 3 é o máximo (09/10): o destino cheio já se anuncia antes da escolha.
    return nomes.length ? `Com ${nomes.join(", ")}${nomes.length >= 3 ? " · lotado (máx. 3)" : ""}` : "Quarto vazio";
  };
  const confirmados = groups.filter((g) => g.confirmed).length;
  const pessoas = groups.reduce((n, g) => n + (g.members || []).length, 0);
  const th = "h-9 px-3 text-left align-middle text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap";

  // ── Peças de um quarto: as mesmas na tabela (≥1024) e no cartão (tablet/celular).
  /** Quem ocupa e de onde vem a estadia de cada um. */
  const ocupantes = (g: RoomGroup) => (g.members || []).map((mb, mi) => {
    const m = memberInfo(mb, collabById);
    const r = m.id ? rowByCollab.get(m.id) : undefined;
    // Estadia DESTA pessoa, quando ela difere do grupo (montagem,
    // desmontagem). Vazio = segue o quarto.
    const bruto = (g.members || [])[mi] as { id?: string; checkInDate?: string | null; checkOutDate?: string | null } | undefined;
    // Sem estadia própria, vale a regra da passagem (09/10); servidor antigo
    // sem `datasDoQuarto` cai na ordem de antes.
    const dq = r?.datasDoQuarto;
    const ini = bruto?.checkInDate || dq?.checkIn || r?.accommodation?.checkInDate || r?.schedule.startDate || g.checkInDate;
    const fim = bruto?.checkOutDate || dq?.checkOut || r?.accommodation?.checkOutDate || r?.schedule.endDate || g.checkOutDate;
    /** De onde veio cada data — o selo discreto embaixo dela. */
    const origem = (qual: "entrada" | "saida"): { base: string; extra?: string } | null => {
      if (qual === "entrada" ? bruto?.checkInDate : bruto?.checkOutDate) return { base: "ajustada no quarto" };
      if (!dq) return null;
      const base = seloDaOrigem(qual === "entrada" ? dq.origemEntrada : dq.origemSaida);
      if (!base) return null;
      if (qual === "entrada" && dq.chegadaDepoisDaMeiaNoite) return { base, extra: "chega após 0h" };
      if (qual === "saida" && dq.diariaExtraNaVolta) return { base, extra: `+1 diária (volta ${dq.diariaExtraNaVolta.horario})` };
      return { base };
    };
    return { m, r, bruto, ini, fim, mi, origem, divergencia: dq?.divergencia?.texto ?? null };
  });
  type Ocupante = ReturnType<typeof ocupantes>[number];
  const nomeDoOcupante = (g: RoomGroup, o: Ocupante) => (
    <>
      <span className="flex items-center gap-2 font-medium text-foreground">
        <span className="truncate">{o.m.name}</span>
        {o.m.noGender && <span className="shrink-0 rounded bg-warning-soft px-1 text-2xs font-medium text-warning" title="Sem gênero cadastrado — confira antes de confirmar o quarto">sem gênero</span>}
        {canEdit && o.m.id && (
          <MoverPara pessoa={o.m.name} grupoAtual={g.id} rotuloNovo="Quarto individual"
            consequencia="O tipo de cada quarto passa a seguir quantas pessoas sobram nele — e a hotelaria do evento muda junto."
            destinos={groups.filter((x) => x.id !== g.id).map((x) => ({ id: x.id, descricao: descreve(x) }))}
            onMover={(para) => onMover(o.m.id as string, g.id, para)} />
        )}
      </span>
      <span className="block text-2xs capitalize text-muted-foreground">{o.r?.function.area || o.r?.function.name || "—"}</span>
      {o.divergencia && (
        // Hospedagem já reservada com outras datas: não vence a passagem, mas
        // também não some — quem confere vê aqui.
        <span className="mt-0.5 flex max-w-[230px] items-start gap-1 whitespace-normal text-2xs leading-snug text-warning" data-testid={`room-divergencia-${g.id}-${o.mi}`}>
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{o.divergencia}</span>
        </span>
      )}
    </>
  );
  const data = (o: Ocupante, qual: "entrada" | "saida") => {
    const selo = o.origem(qual);
    return (
      <span className="inline-flex flex-col items-start">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-7 text-muted-foreground">{diaSemana(qual === "entrada" ? o.ini : o.fim)}</span>
          <DataDoOcupante valor={qual === "entrada" ? o.ini : o.fim} propria={!!(qual === "entrada" ? o.bruto?.checkInDate : o.bruto?.checkOutDate)}
            canEdit={canEdit && !!o.bruto?.id} rotulo={`${qual === "entrada" ? "Entrada" : "Saída"} de ${o.m.name}`}
            aoSalvar={(v) => onPatchMembro?.(o.bruto!.id as string, qual === "entrada" ? { checkInDate: v } : { checkOutDate: v })} />
        </span>
        {selo && (
          // Quebra antes do motivo em vez de alargar a coluna (a tabela cabe em 1366).
          <span className="flex max-w-[160px] flex-wrap gap-x-1 whitespace-normal pl-[34px] text-2xs leading-tight text-muted-foreground" data-testid={`room-origem-${qual}`}>
            <span>{selo.base}{selo.extra ? " ·" : ""}</span>
            {selo.extra && <span className="whitespace-nowrap font-medium text-foreground">{selo.extra}</span>}
          </span>
        )}
      </span>
    );
  };
  /**
   * "Datas diferentes entre os ocupantes — N noites em comum" recalculada com
   * as datas que as linhas mostram (09/10): a gravada no recálculo podia ser
   * de antes da regra da passagem. Uma observação escrita à mão continua.
   */
  const observacoes = (g: RoomGroup, lista: Ocupante[]) => {
    const dia = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
    const auto = observacaoDeDatas(lista.map((o) => ({ checkIn: dia(o.ini), checkOut: dia(o.fim) })));
    const manual = g.notes && !g.notes.startsWith(PREFIXO_DATAS_DIFERENTES) ? g.notes : null;
    return [auto, manual].filter((x): x is string => !!x);
  };
  /* Hotel e tipo aparecem uma vez por grupo, como na planilha —
     e são editáveis aqui mesmo, sem abrir outra tela. */
  const hotel = (g: RoomGroup) => canEdit ? (
    <TextoEditavel
      valor={g.hotelName}
      placeholder="Definir hotel…"
      aoSalvar={(v) => onPatch(g.id, { hotelName: v || null })}
      rotulo="Hotel do quarto"
    />
  ) : (g.hotelName || <span className="text-warning">sem hotel</span>);
  const tipo = (g: RoomGroup, lista: Ocupante[]) => {
    const n = lista.length;
    return (
    <span className="flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-xs font-semibold text-foreground">
          {n === 1 ? "Single" : n === 2 ? "Duplo" : n === 3 ? "Triplo" : `${n} pessoas`}
        </span>
        <span className="rounded bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
          {n} {n === 1 ? "pessoa" : "pessoas"}
        </span>
      </span>
      {canEdit && n > 1 && onSeparar && (
        <button type="button" onClick={() => onSeparar(g.id)}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`separar-${g.id}`} title="Separar em quartos individuais">
          <Scissors className="h-3 w-3" aria-hidden="true" /> Separar<span className="hidden 2xl:inline">&nbsp;em individuais</span>
        </button>
      )}
      {observacoes(g, lista).map((nota) => (
        <span key={nota} className="max-w-[220px] text-2xs leading-snug text-muted-foreground" data-testid={`room-obs-${g.id}`}>{nota}</span>
      ))}
    </span>
    );
  };
  const situacao = (g: RoomGroup) => g.confirmed ? (
    canEdit ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button"
            onClick={() => onPatch(g.id, { __reabrir: true })} data-testid={`reabrir-uber-${g.id}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-success/25 bg-success-soft px-2 text-xs font-medium text-success transition-colors hover:border-success/50">
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Confirmado
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">Quarto confirmado — fica de fora do recálculo das sugestões.</TooltipContent>
      </Tooltip>
    ) : <span className="inline-flex h-6 items-center gap-1 rounded-md bg-success-soft px-2 text-2xs font-medium text-success"><CheckCheck className="h-3 w-3" aria-hidden="true" /> Confirmado</span>
  ) : canEdit ? (
    <button type="button" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-room-${g.id}`}
      className="esp-alvo inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
      {pendingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
      {pendingId === g.id ? "Confirmando…" : "Confirmar"}
    </button>
  ) : <span className="inline-flex h-6 items-center rounded-md bg-brand-soft px-2 text-2xs font-medium text-primary">Sugestão</span>;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-1" data-testid="quartos-view">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">Quartos</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {groups.length} {groups.length === 1 ? "quarto" : "quartos"} · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} ·{" "}
          <span className={confirmados === groups.length ? "text-success" : "text-foreground"}>{confirmados} de {groups.length} confirmados</span>
        </p>
        <p className="hidden text-xs text-muted-foreground xl:block">· mesmas datas primeiro, depois a mesma função</p>
        <span className="ml-auto">{refazer}</span>
      </header>
      {!largo ? (
        // Tablet e celular: um cartão por quarto — o confirmar fica à vista,
        // em vez de no fim de uma tabela que rola de lado.
        <ul className="divide-y-[6px] divide-muted">
          {groups.map((g, gi) => {
            const lista = ocupantes(g);
            return (
              <li key={g.id} className={cn("esp-grupo-cartao px-4 py-3", g.confirmed && "bg-success-soft/25")}
                style={{ ["--esp-cor" as string]: COR_DO_GRUPO[gi % COR_DO_GRUPO.length] }} data-testid={`room-card-${g.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {tipo(g, lista)}
                  {situacao(g)}
                </div>
                <div className="mt-2 flex max-w-[420px] items-center gap-2"><span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Hotel</span><div className="min-w-0 flex-1 text-xs">{hotel(g)}</div></div>
                <ul className="mt-2 space-y-2.5">
                  {lista.map((o) => (
                    <li key={`${g.id}-${o.m.id ?? o.mi}`} className="group/linha text-sm" data-testid={`room-row-${g.id}-${o.mi}`}>
                      {nomeDoOcupante(g, o)}
                      {/* Entra | Sai lado a lado, rótulo em cima: com o selo de origem
                          embaixo da data, o rótulo ao lado desalinhava as duas. */}
                      <span className="mt-1.5 grid max-w-[420px] grid-cols-2 gap-x-3 text-xs">
                        <span className="flex flex-col gap-0.5"><span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Entra</span>{data(o, "entrada")}</span>
                        <span className="flex flex-col gap-0.5"><span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sai</span>{data(o, "saida")}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-surface-muted">
            <tr>
              <th scope="col" className={cn(th, "border-b border-border pl-4")}>Ocupante · departamento</th>
              <th scope="col" className={cn(th, "border-b border-border")}>Entrada</th>
              <th scope="col" className={cn(th, "border-b border-border")}>Saída</th>
              <th scope="col" className={cn(th, "border-b border-l border-border")}>Hotel</th>
              <th scope="col" className={cn(th, "border-b border-border")}>Quarto</th>
              <th scope="col" className={cn(th, "border-b border-border text-right pr-4")}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const lista = ocupantes(g);
              const cor = COR_DO_GRUPO[gi % COR_DO_GRUPO.length];
              const ultimoGrupo = gi === groups.length - 1;
              const fechaGrupo = ultimoGrupo ? "" : "border-b-[3px] border-b-muted";
              return lista.map((o) => {
                const fimDoGrupo = o.mi === lista.length - 1;
                const borda = fimDoGrupo ? fechaGrupo : "border-b border-b-border/60";
                return (
                  <tr key={`${g.id}-${o.m.id ?? o.mi}`}
                    className={cn("esp-grupo group/linha transition-colors hover:bg-surface-muted/60", g.confirmed && "bg-success-soft/25")}
                    style={{ ["--esp-cor" as string]: cor }}
                    data-testid={`room-row-${g.id}-${o.mi}`}>
                    <td className={cn("pb-1.5 pl-4 pr-3 pt-2 align-top", borda)}>{nomeDoOcupante(g, o)}</td>
                    <td className={cn("whitespace-nowrap px-3 py-1.5 align-top", borda)}>{data(o, "entrada")}</td>
                    <td className={cn("whitespace-nowrap px-3 py-1.5 align-top", borda)}>{data(o, "saida")}</td>
                    {o.mi === 0 ? <td className={cn("border-l border-l-border px-3 py-1.5 align-middle", fechaGrupo)} rowSpan={lista.length}>{hotel(g)}</td> : null}
                    {o.mi === 0 ? <td className={cn("px-3 py-1.5 align-middle", fechaGrupo)} rowSpan={lista.length}>{tipo(g, lista)}</td> : null}
                    {o.mi === 0 ? <td className={cn("py-1.5 pl-3 pr-4 text-right align-middle", fechaGrupo)} rowSpan={lista.length}>{situacao(g)}</td> : null}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
