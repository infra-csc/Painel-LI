/**
 * Visão Quartos do espelho operacional (25/09 — extraída da página; redesenho 07/10).
 * Hotel e tipo aparecem uma vez por quarto e são editáveis aqui mesmo.
 *
 * 09/10: entrada e saída vêm da PASSAGEM (regra em shared/datas-do-quarto.ts,
 * calculada no servidor e enviada em `row.datasDoQuarto`); cada data diz de
 * onde veio ("da passagem", "sugerida", "da hospedagem", "da escala") e o
 * motivo de um dia a mais (volta a partir das 18h).
 *
 * 09/10 (tarde), reclamação do dono — "a divisão não está muito clara, só com
 * esse negócio de cor na ponta": a tabela com células mescladas virou UM BLOCO
 * POR QUARTO (cartão com cabeçalho próprio: "Quarto N", tipo, hotel, ações),
 * com a mesma grade de colunas em todos os blocos para comparar datas de
 * relance. Os avisos do quarto aparecem uma vez, no bloco; a divergência de
 * hospedagem só desce para a linha quando não é de todos. Quando os ocupantes
 * não chegam/saem juntos, o tipo vira a OCUPAÇÃO POR NOITE ("13→14 Single ·
 * 14→16 Duplo", shared/ocupacao-por-noite.ts), que substitui a frase "Datas
 * diferentes entre os ocupantes". A grade é por container query (bloco `esp-`
 * quartos do index.css): o mesmo markup serve à mesa, ao tablet e ao celular.
 */
import { useState, useEffect, type ReactNode } from "react";
import { AlertTriangle, Building2, CheckCheck, Loader2, Moon, RefreshCw, BedDouble, Scissors, StickyNote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MirrorEvent, RoomGroup } from "@shared/operational-mirror-types";
import { seloDaOrigem } from "@shared/datas-do-quarto";
import { observacaoDeDatas, PREFIXO_DATAS_DIFERENTES } from "@shared/room-pairing";
import { ocupacaoPorNoite, rotuloDoTipo, type TipoDoTrecho } from "@shared/ocupacao-por-noite";
import type { QuartoDaRoomingList } from "@shared/rooming-list";
import { MoverPara } from "./mover-para";
import { RoomingListPdf } from "./rooming-list-pdf";
import { diaSemana, fmtDate, memberInfo, type GroupViewProps } from "./mirror-shared";

/** A cor do TIPO é detalhe (o ponto do selo), não o separador entre quartos. */
const COR_DO_TIPO: Record<TipoDoTrecho, string> = {
  single: "var(--neutral)",
  double: "var(--primary)",
  triple: "var(--info-strong)",
};

const dia = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);
const ddmm = (v: string | null | undefined) => {
  const d = dia(v);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—";
};

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
 * foco: numa lista de leitura, seis inputs por linha viram ruído. Quando a
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
  /** Evento do espelho — com ele aparece "PDF para o hotel" (rooming list). */
  evento?: MirrorEvent;
};

export function QuartosView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onSeparar, onMover, pendingId, onPatchMembro, onRecalc, recalcPending, evento }: QuartosViewProps) {
  const refazer = canEdit && onRecalc ? (
    <button type="button" onClick={onRecalc} disabled={recalcPending}
      className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
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
    /** De onde veio cada data — o selo discreto embaixo dela, e o motivo da noite a mais. */
    const origem = (qual: "entrada" | "saida"): { base: string; extra?: string } | null => {
      if (qual === "entrada" ? bruto?.checkInDate : bruto?.checkOutDate) return { base: "ajustada no quarto" };
      if (!dq) return null;
      const base = seloDaOrigem(qual === "entrada" ? dq.origemEntrada : dq.origemSaida);
      if (!base) return null;
      if (qual === "entrada" && dq.chegadaDepoisDaMeiaNoite) return { base, extra: "chega após 0h" };
      if (qual === "saida" && dq.diariaExtraNaVolta) return { base, extra: `+1 diária · volta ${dq.diariaExtraNaVolta.horario}` };
      return { base };
    };
    return { m, r, bruto, ini, fim, mi, origem, divergencia: dq?.divergencia?.texto ?? null };
  });
  type Ocupante = ReturnType<typeof ocupantes>[number];

  /** Tudo o que um quarto mostra, calculado uma vez por render. */
  const quartos = groups.map((g, gi) => {
    const lista = ocupantes(g);
    const trechos = ocupacaoPorNoite(lista.map((o) => ({ checkIn: dia(o.ini), checkOut: dia(o.fim), o })));
    // Divergência de hospedagem igual para TODOS → um aviso do quarto; senão, na linha de quem tem.
    const divs = lista.map((o) => o.divergencia);
    const divergenciaComum = divs.length > 0 && divs.every((d) => d && d === divs[0]) ? divs[0] : null;
    // "Datas diferentes…" (recalculada com as datas mostradas): com a ocupação
    // por noite à vista, a frase não diz nada a mais — só fica sem ela.
    const auto = trechos.length > 1 ? null : observacaoDeDatas(lista.map((o) => ({ checkIn: dia(o.ini), checkOut: dia(o.fim) })));
    const manual = g.notes && !g.notes.startsWith(PREFIXO_DATAS_DIFERENTES) ? g.notes : null;
    return { g, numero: gi + 1, lista, trechos, divergenciaComum, notas: [auto, manual].filter((x): x is string => !!x) };
  });

  const nomeDoOcupante = (g: RoomGroup, o: Ocupante) => (
    // Nome inteiro, nunca cortado: se não couber com os selos, ele quebra em
    // linhas (o "Mover", invisível até o hover, não pode descer e abrir um buraco).
    <span className="flex min-h-7 min-w-0 items-center gap-2">
      <span className="min-w-0 break-words text-sm font-medium text-foreground" title={o.m.genderInferred ? "Gênero deduzido pelo nome" : undefined}>{o.m.name}</span>
      {o.m.noGender && (
        <span className="shrink-0 whitespace-nowrap rounded bg-warning-soft px-1.5 text-2xs font-medium leading-5 text-warning"
          title="Não foi possível deduzir pelo nome — confira antes de confirmar o quarto" data-testid={`room-sem-genero-${g.id}-${o.mi}`}>
          confira o gênero
        </span>
      )}
      {canEdit && o.m.id && (
        <MoverPara pessoa={o.m.name} grupoAtual={g.id} rotuloNovo="Quarto individual"
          consequencia="O tipo de cada quarto passa a seguir quantas pessoas sobram nele — e a hotelaria do evento muda junto."
          destinos={groups.filter((x) => x.id !== g.id).map((x) => ({ id: x.id, descricao: descreve(x) }))}
          onMover={(para) => onMover(o.m.id as string, g.id, para)} />
      )}
    </span>
  );

  const data = (o: Ocupante, qual: "entrada" | "saida") => {
    const selo = o.origem(qual);
    const valor = qual === "entrada" ? o.ini : o.fim;
    return (
      <div className={qual === "entrada" ? "esp-oc-ent" : "esp-oc-sai"}>
        <span className="esp-oc-rotulo text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{qual === "entrada" ? "Entra" : "Sai"}</span>
        <span className="flex h-7 items-center gap-1.5 text-xs">
          <span className="w-7 shrink-0 text-muted-foreground">{diaSemana(valor)}</span>
          <DataDoOcupante valor={valor} propria={!!(qual === "entrada" ? o.bruto?.checkInDate : o.bruto?.checkOutDate)}
            canEdit={canEdit && !!o.bruto?.id} rotulo={`${qual === "entrada" ? "Entrada" : "Saída"} de ${o.m.name}`}
            aoSalvar={(v) => onPatchMembro?.(o.bruto!.id as string, qual === "entrada" ? { checkInDate: v } : { checkOutDate: v })} />
        </span>
        {selo && (
          // Data em cima; embaixo, com respiro, a origem discreta e — quando
          // há — a noite a mais como selo próprio (não um texto colado).
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs leading-4 text-muted-foreground" data-testid={`room-origem-${qual}`}>
            <span>{selo.base}</span>
            {selo.extra && (
              <span className="esp-selo-noite inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-info-soft px-1.5 font-medium text-info">
                <Moon className="h-3 w-3" aria-hidden="true" />{selo.extra}
              </span>
            )}
          </span>
        )}
      </div>
    );
  };

  /** "Duplo · 2 pessoas" — ou, se a ocupação muda de noite para noite, os trechos. */
  const tipo = (q: (typeof quartos)[number]) => {
    const n = q.lista.length;
    if (q.trechos.length > 1) {
      return (
        <span className="esp-trechos" data-testid={`room-trechos-${q.g.id}`} role="list" aria-label="Ocupação por noite">
          {q.trechos.map((t) => {
            const nomes = t.ocupantes.map((x) => x.o.m.name.split(" ")[0]).join(", ");
            return (
              <span key={t.de} role="listitem" className="esp-trecho"
                title={`${ddmm(t.de)} a ${ddmm(t.ate)} · ${t.noites} ${t.noites === 1 ? "noite" : "noites"} · ${nomes}`}>
                <i className="esp-trecho-ponto" style={{ background: COR_DO_TIPO[t.tipo] }} aria-hidden="true" />
                <span className="tabular-nums text-muted-foreground">{ddmm(t.de)}→{ddmm(t.ate)}</span>
                <span className="font-semibold text-foreground">{rotuloDoTipo(t.tipo)}</span>
              </span>
            );
          })}
        </span>
      );
    }
    const chave: TipoDoTrecho = n <= 1 ? "single" : n === 2 ? "double" : "triple";
    return (
      <span className="esp-trechos">
        <span className="esp-trecho">
          <i className="esp-trecho-ponto" style={{ background: COR_DO_TIPO[chave] }} aria-hidden="true" />
          <span className="font-semibold text-foreground">{n === 1 ? "Single" : n === 2 ? "Duplo" : n === 3 ? "Triplo" : `${n} pessoas`}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span className="tabular-nums text-muted-foreground">{n} {n === 1 ? "pessoa" : "pessoas"}</span>
        </span>
      </span>
    );
  };

  /* Hotel aparece uma vez por quarto — e é editável aqui mesmo, sem abrir outra tela. */
  const hotel = (g: RoomGroup) => (
    <span className="esp-quarto-hotel flex min-w-0 items-center gap-1.5 text-xs">
      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      {canEdit ? (
        <TextoEditavel valor={g.hotelName} placeholder="Definir hotel…" aoSalvar={(v) => onPatch(g.id, { hotelName: v || null })} rotulo="Hotel do quarto" />
      ) : (g.hotelName ? <span className="truncate font-medium text-foreground">{g.hotelName}</span> : <span className="text-warning">sem hotel</span>)}
    </span>
  );

  const situacao = (g: RoomGroup) => g.confirmed ? (
    canEdit ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button"
            onClick={() => onPatch(g.id, { __reabrir: true })} data-testid={`reabrir-uber-${g.id}`}
            className="esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-success/25 bg-success-soft px-2 text-xs font-medium text-success transition-colors hover:border-success/50">
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Confirmado
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">Quarto confirmado — fica de fora do recálculo das sugestões. Clique para reabrir.</TooltipContent>
      </Tooltip>
    ) : <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md bg-success-soft px-2 text-2xs font-medium text-success"><CheckCheck className="h-3 w-3" aria-hidden="true" /> Confirmado</span>
  ) : canEdit ? (
    <button type="button" onClick={() => onConfirm(g.id)} disabled={pendingId === g.id} data-testid={`confirm-room-${g.id}`}
      className="esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2.5 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
      {pendingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
      {pendingId === g.id ? "Confirmando…" : "Confirmar"}
    </button>
  ) : <span className="inline-flex h-6 items-center whitespace-nowrap rounded-md bg-brand-soft px-2 text-2xs font-medium text-primary">Sugestão</span>;

  /** Os avisos do quarto, uma vez só, logo abaixo do cabeçalho. */
  const avisos = (q: (typeof quartos)[number]) => {
    const itens: ReactNode[] = [];
    if (q.divergenciaComum) {
      const n = q.lista.length;
      itens.push(
        <p key="div" className="flex items-start gap-1.5 text-xs leading-snug text-warning" data-testid={`room-divergencia-${q.g.id}`}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{n > 1 && <span className="font-semibold">{n === 2 ? "Os dois ocupantes: " : `Os ${n} ocupantes: `}</span>}{q.divergenciaComum}</span>
        </p>,
      );
    }
    for (const nota of q.notas) {
      itens.push(
        <p key={nota} className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground" data-testid={`room-obs-${q.g.id}`}>
          <StickyNote className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />{nota}
        </p>,
      );
    }
    return itens.length ? <div className="esp-quarto-avisos">{itens}</div> : null;
  };

  // Dados da rooming list: as MESMAS datas que a tela mostra.
  const quartosParaPdf: QuartoDaRoomingList[] = quartos.map((q) => ({
    hotelName: q.g.hotelName,
    observacao: q.g.notes && !q.g.notes.startsWith(PREFIXO_DATAS_DIFERENTES) ? q.g.notes : null,
    hospedes: q.lista.map((o) => ({ collaboratorId: o.m.id ?? null, nome: o.m.name, checkIn: dia(o.ini), checkOut: dia(o.fim) })),
  }));

  return (
    <section data-testid="quartos-view">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Quartos</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {groups.length} {groups.length === 1 ? "quarto" : "quartos"} · {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} ·{" "}
          <span className={confirmados === groups.length ? "font-medium text-success" : "text-foreground"}>{confirmados} de {groups.length} confirmados</span>
        </p>
        <p className="hidden text-xs text-muted-foreground xl:block">· mesmas datas primeiro, depois a mesma função</p>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {evento && <RoomingListPdf evento={evento} quartos={quartosParaPdf} />}
          {refazer}
        </span>
      </header>

      <div className="esp-quartos-lista">
        {/* Uma régua de colunas para todos os blocos — a mesma grade das linhas. */}
        <div className="esp-quartos-colunas" aria-hidden="true">
          <span className="esp-col-nome">Ocupante<span className="esp-so-medio"> · departamento</span></span>
          <span className="esp-col-dep">Departamento</span>
          <span className="esp-col-ent">Entrada</span>
          <span className="esp-col-sai">Saída</span>
        </div>

        {quartos.map((q) => {
          const { g } = q;
          return (
            <article key={g.id} className="esp-quarto" data-confirmado={g.confirmed ? "true" : undefined}
              aria-label={`Quarto ${q.numero}`} data-testid={`room-card-${g.id}`}>
              <div className="esp-quarto-cab">
                <span className="esp-quarto-id flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <h4 className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">Quarto {q.numero}</h4>
                  {tipo(q)}
                </span>
                {hotel(g)}
                <span className="esp-quarto-acoes flex items-center gap-1.5">
                  {canEdit && q.lista.length > 1 && onSeparar && (
                    <button type="button" onClick={() => onSeparar(g.id)}
                      className="esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`separar-${g.id}`} title="Separar em quartos individuais" aria-label="Separar em quartos individuais">
                      <Scissors className="h-3.5 w-3.5" aria-hidden="true" />Separar
                    </button>
                  )}
                  {situacao(g)}
                </span>
              </div>
              {avisos(q)}
              <ul className="esp-quarto-ocupantes">
                {q.lista.map((o) => (
                  <li key={`${g.id}-${o.m.id ?? o.mi}`} className="esp-ocupante group/linha" data-testid={`room-row-${g.id}-${o.mi}`}>
                    {/* Quem: uma célula no celular/tablet; na mesa vira colunas (display: contents). */}
                    <div className="esp-oc-quem min-w-0">
                      <div className="esp-oc-nome min-w-0">{nomeDoOcupante(g, o)}</div>
                      <div className="esp-oc-dep min-w-0 truncate text-xs capitalize text-muted-foreground">{o.r?.function.area || o.r?.function.name || "—"}</div>
                      {o.divergencia && !q.divergenciaComum && (
                        // Hospedagem já reservada com outras datas, só para esta pessoa:
                        // não vence a passagem, mas também não some — quem confere vê aqui.
                        <div className="esp-oc-aviso flex items-start gap-1 text-2xs leading-snug text-warning" data-testid={`room-divergencia-${g.id}-${o.mi}`}>
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{o.divergencia}</span>
                        </div>
                      )}
                    </div>
                    {data(o, "entrada")}
                    {data(o, "saida")}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
