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
 *
 * 15/10, dono: "todos ficam no mesmo hotel por evento" — um campo "Hotel do
 * evento" no topo (hotel-do-evento.tsx) aplica o hotel a todos os quartos; o
 * cabeçalho de cada bloco mostra o hotel discreto e "trocar só este" vira a
 * exceção, em vez de pedir "Definir hotel…" quarto a quarto.
 *
 * 20/10, dono: "colocar o preço total e de cada quarto no Espelho". Abaixo do
 * hotel do evento, o painel "Valores do hotel" (valores-do-hotel.tsx: tarifas
 * por apartamento por noite, distribuição, calculado × pago); em cada bloco,
 * o rodapé com a conta das noites e o total do quarto, e em cada ocupante a
 * parte dele e o late check-out (valores-do-quarto.tsx). As datas usadas na
 * conta são as MESMAS da tela (periodoNoQuarto, shared/custo-dos-quartos.ts).
 * 21/10: a tarifa é do APARTAMENTO, dividida entre quem dorme no quarto.
 *
 * 22/10, dono: "no espelho ter a opção de colocar se o hotel não tem duplo ou
 * triplo". Na faixa do hotel do evento, "O hotel tem: Individual · Duplo ·
 * Triplo" (tipos-do-hotel.tsx). Mudar a opção não refaz nada sozinho: quarto
 * que excede o que o hotel tem ganha um selo ("o hotel não tem triplo") e o
 * topo mostra um aviso com "Refazer sugestões" — refazer sozinho também
 * refaria os carros não confirmados e desfaria os ajustes à mão nos quartos
 * não confirmados. O "Mover" não deixa juntar num tipo que o hotel não tem.
 *
 * 23/10, dono: "Sistema está misturando prova que foi cancelada com provas
 * novas". Vaga cancelada não chega mais aqui (o servidor a tira de `rows` e
 * dos quartos; ver shared/vagas-canceladas.ts). Quarto CONFIRMADO de onde
 * alguém saiu por isso mostra o aviso "uma vaga deste quarto foi cancelada".
 *
 * 23/10, dono: "no espelho operacional, quando colocarmos o hotel, refletir na
 * passagem" → "quando confirmar, deve preencher lá na aba de Hospedagem com
 * os dados". O "Confirmar" do quarto preenche a HOSPEDAGEM de cada pessoa
 * (hotel, datas, tipo, valor, com quem divide) — a que Passagens, Hospedagens
 * e Escalação leem. Dado lançado à mão e diferente fica: a linha mostra a
 * diferença com "Usar os dados do quarto"; quarto reaberto avisa para
 * conferir; a faixa do hotel do evento resume (hospedagens-do-quarto.tsx).
 */
import { useState, useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Building2, CheckCheck, Loader2, Moon, Pencil, RefreshCw, BedDouble, Scissors, StickyNote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MirrorEvent, MirrorRow, RoomGroup } from "@shared/operational-mirror-types";
import { seloDaOrigem } from "@shared/datas-do-quarto";
import { motivoDoTipoQueOHotelNaoTem, observacaoDeDatas, PREFIXO_DATAS_DIFERENTES, tipoQueOHotelNaoTem, tiposDoHotelOuPadrao } from "@shared/room-pairing";
import { ocupacaoPorNoite, rotuloDoTipo, trechosPorApartamento, type TipoDoTrecho } from "@shared/ocupacao-por-noite";
import { chaveDoHotel, hotelDoEvento, nomeDeHotelLimpo, type QuartoDaRoomingList } from "@shared/rooming-list";
import { chaveDoOcupante, custoDoHotel, dividirCentavos, entradaDoCustoDoHotel, periodoNoQuarto, type ValoresDoHotelSalvos } from "@shared/custo-dos-quartos";
import { fonteDoHotel } from "@shared/operational-mirror-types";
import { avisoDeQuemSaiu } from "@shared/vagas-canceladas";
import { conferirHospedagem, ocupantesDoQuarto } from "@shared/hotel-na-hospedagem";
import { HotelDoEvento } from "./hotel-do-evento";
import { HospedagemDoOcupanteAviso, HospedagensDasVagas, type HospedagemDoOcupante } from "./hospedagens-do-quarto";
import { PainelDeValoresDoHotel, useValoresDoHotel } from "./valores-do-hotel";
import { AvisoDeQuartosQueExcedem, TiposDoHotelChips } from "./tipos-do-hotel";
import { partesTxt, ValorDaPessoa, ValoresDoQuarto } from "./valores-do-quarto";
import { MoverPara } from "./mover-para";
import { RoomingListPdf } from "./rooming-list-pdf";
import { brl, diaSemana, fmtDate, memberInfo, type GroupViewProps } from "./mirror-shared";

/**
 * O total da hospedagem foi escrito pelo Confirmar (23/10) e não mexido
 * depois? Então não é "lançado na grade": é a própria conta do quarto — a
 * linha mostra o valor calculado normal, sem riscar.
 */
const valorEscritoPeloConfirmar = (r: MirrorRow) => {
  const escrito = r.hospedagemDoEspelho?.totalCents;
  return escrito != null && r.accommodation?.totalCents != null && Number(escrito) === r.accommodation.totalCents;
};

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
function TextoEditavel({ valor, placeholder, aoSalvar, rotulo, list, autoFocus, aoTerminar }: {
  valor: string | null | undefined;
  placeholder: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
  /** id de um <datalist> com sugestões. */
  list?: string;
  autoFocus?: boolean;
  /** Chamado ao sair do campo (salvando ou não). */
  aoTerminar?: () => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  // Esc descarta: o blur que vem logo depois ainda vê o texto digitado.
  const descartar = useRef(false);
  useEffect(() => { setTexto(valor ?? ""); }, [valor]);
  return (
    <input
      value={texto}
      aria-label={rotulo}
      placeholder={placeholder}
      list={list}
      autoFocus={autoFocus}
      maxLength={120}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (!descartar.current && (valor ?? "") !== texto) aoSalvar(texto.trim());
        descartar.current = false;
        aoTerminar?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { e.preventDefault(); descartar.current = true; setTexto(valor ?? ""); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 w-full min-w-[130px] rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-foreground transition-colors hover:border-input hover:bg-card focus:border-primary focus:bg-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 placeholder:font-normal placeholder:text-warning"
    />
  );
}

/**
 * Hotel no cabeçalho de um quarto (15/10, dono: "todos ficam no mesmo hotel
 * por evento"). Não pede mais "Definir hotel…" em cada bloco: o hotel do
 * evento aparece discreto, e "trocar só este" (no hover/foco; sempre à vista
 * no toque) abre o campo para a exceção. Quarto em OUTRO hotel aparece
 * destacado — é a exceção que alguém escolheu.
 */
function HotelDoQuarto({ valor, doEvento, canEdit, listaDeSugestoes, aoSalvar }: {
  valor: string | null | undefined;
  doEvento: string | null;
  canEdit: boolean;
  listaDeSugestoes: string;
  aoSalvar: (v: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const chave = chaveDoHotel(valor);
  const segueOEvento = !!chave && chave === chaveDoHotel(doEvento);
  const icone = <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;

  if (canEdit && editando) {
    return (
      <span className="esp-quarto-hotel flex min-w-0 items-center gap-1.5 text-xs">
        {icone}
        <TextoEditavel valor={valor} placeholder={doEvento ?? "Hotel deste quarto"} rotulo="Hotel só deste quarto" list={listaDeSugestoes} autoFocus
          aoSalvar={(v) => aoSalvar(nomeDeHotelLimpo(v) || null)} aoTerminar={() => setEditando(false)} />
      </span>
    );
  }

  // Na exceção (outro hotel) o lápis fica sempre à vista e sem texto — o nome
  // do hotel é o que precisa de espaço; nos demais, o texto aparece no hover.
  const excecao = !!chave && !segueOEvento;
  const trocar = canEdit ? (
    <button type="button" onClick={() => setEditando(true)} data-testid="quarto-hotel-trocar"
      aria-label={valor ? `Trocar o hotel só deste quarto (${valor})` : "Definir o hotel só deste quarto"}
      title={excecao ? "Trocar o hotel só deste quarto" : undefined}
      className={`esp-alvo inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-medium text-muted-foreground transition-[opacity,color,background-color] hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        excecao ? "" : "esp-revela opacity-0 focus:opacity-100 group-hover/quarto:opacity-100 group-focus-within/quarto:opacity-100"}`}>
      <Pencil className="h-3 w-3" aria-hidden="true" />
      {/* No celular só o lápis: o nome do hotel precisa da largura. */}
      {excecao ? null : <span className="esp-hotel-trocar-texto">{valor ? "trocar só este" : "definir só este"}</span>}
    </button>
  ) : null;

  return (
    <span className="esp-quarto-hotel flex min-w-0 items-center gap-1.5 text-xs" data-testid="quarto-hotel">
      {icone}
      {!chave ? (
        // Sem hotel: com hotel do evento definido isto é pendência (confirmado
        // que ficou de fora); sem ele, só "a definir" — o campo do topo resolve.
        <span className={doEvento ? "font-medium text-warning" : "text-muted-foreground"}>{doEvento ? "sem hotel" : "hotel a definir"}</span>
      ) : segueOEvento ? (
        <span className="min-w-0 truncate text-muted-foreground" title="Hotel do evento">{valor}</span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5" title={doEvento ? `Este quarto não segue o hotel do evento (${doEvento})` : undefined}>
          <span className="min-w-0 truncate font-medium text-foreground">{valor}</span>
          <span className="shrink-0 whitespace-nowrap rounded bg-info-soft px-1.5 text-2xs font-medium leading-5 text-info">outro hotel</span>
        </span>
      )}
      {trocar}
    </span>
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
  /**
   * Valores do hotel gravados (20/10). `undefined` = servidor antigo (nada de
   * valores na tela); `null` = tabelas ainda não criadas no banco.
   */
  valores?: ValoresDoHotelSalvos | null;
};

export function QuartosView({ groups, collabById, rows, canEdit, onConfirm, onPatch, onSeparar, onMover, pendingId, onPatchMembro, onRecalc, recalcPending, evento, valores }: QuartosViewProps) {
  const mutacoesDeValores = useValoresDoHotel(evento?.id ?? "");
  /* Apartamentos que o hotel tem (22/10). Servidor antigo / sem tabelas: todos. */
  const tiposDoHotel = tiposDoHotelOuPadrao(valores?.tipos);
  const chipsDosTipos = evento && valores !== undefined ? (
    <TiposDoHotelChips tipos={tiposDoHotel} canEdit={canEdit} indisponivel={valores === null} mutacoes={mutacoesDeValores} />
  ) : null;
  const refazer =canEdit && onRecalc ? (
    <button type="button" onClick={onRecalc} disabled={recalcPending}
      className="esp-alvo inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-xs font-medium text-slate-700 shadow-1 transition-colors hover:border-primary/40 hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {recalcPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
      {recalcPending ? "Recalculando…" : "Refazer sugestões"}
    </button>
  ) : null;
  if (groups.length === 0) {
    return (
      <>
      {/* A opção vale para a primeira sugestão também: à vista antes de gerar. */}
      {chipsDosTipos && <div className="esp-hotel-evento">{chipsDosTipos}</div>}
      <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="quartos-vazio">
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true"><BedDouble className="h-5 w-5" /></span>
        <h2 className="m-0 text-base font-semibold text-foreground">Nenhuma sugestão de quarto ainda</h2>
        <p className="m-0 mt-1.5 max-w-[440px] text-sm leading-relaxed text-muted-foreground">
          As sugestões juntam primeiro quem tem as mesmas datas, depois a mesma função.{canEdit ? " Gere a partir das hospedagens do evento." : ""}
        </p>
        {refazer && <div className="mt-4">{refazer}</div>}
      </div>
      </>
    );
  }
  const rowByCollab = new Map(rows.filter((r) => r.collaborator.id).map((r) => [r.collaborator.id as string, r]));
  /** Como cada quarto se descreve na lista de destinos: por quem está nele. */
  const descreve = (g: RoomGroup) => {
    const nomes = (g.members || []).map((m) => memberInfo(m, collabById).name.split(" ")[0]);
    // 3 é o máximo (09/10): o destino cheio já se anuncia antes da escolha.
    return nomes.length ? `Com ${nomes.join(", ")}${nomes.length >= 3 ? " · lotado (máx. 3)" : ""}` : "Quarto vazio";
  };
  /**
   * Por que não dá para juntar alguém a este quarto (22/10): lotado, ou o
   * hotel não tem o tipo que ele viraria. A cenotécnica do triplo continua
   * sendo conferida no servidor (o motivo volta no aviso de erro).
   */
  const bloqueioDoDestino = (g: RoomGroup): string | null => {
    const n = (g.members || []).length + 1;
    if (n >= 4) return "Lotado — um quarto comporta no máximo 3 pessoas.";
    return motivoDoTipoQueOHotelNaoTem(n, tiposDoHotel);
  };
  const confirmados = groups.filter((g) => g.confirmed).length;
  const pessoas = groups.reduce((n, g) => n + (g.members || []).length, 0);

  /** Quem ocupa e de onde vem a estadia de cada um. */
  const ocupantes = (g: RoomGroup) => (g.members || []).map((mb, mi) => {
    const m = memberInfo(mb, collabById);
    const r = m.id ? rowByCollab.get(m.id) : undefined;
    // Estadia DESTA pessoa, quando ela difere do grupo (montagem,
    // desmontagem). Vazio = segue o quarto.
    const bruto = (g.members || [])[mi] as { id?: string; collaboratorId?: string | null; checkInDate?: string | null; checkOutDate?: string | null } | undefined;
    // Sem estadia própria, vale a regra da passagem (09/10); servidor antigo
    // sem `datasDoQuarto` cai na ordem de antes. A mesma regra que a conta
    // dos valores do hotel usa (periodoNoQuarto).
    const dq = r?.datasDoQuarto;
    const { checkIn: ini, checkOut: fim } = periodoNoQuarto(bruto, r, g);
    /** Identidade da pessoa na conta dos valores (shared/custo-dos-quartos.ts). */
    const chave = chaveDoOcupante(bruto ?? {}, mi, g.id);
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
    /*
     * Hospedagem da vaga × quarto (23/10). Confirmado: o que o Confirmar
     * preencheu, o que difere (lançado à mão) ou ficou para trás. Reaberto:
     * se a hospedagem tem dados do último Confirmar, o aviso para conferir.
     * Quem não precisa de hospedagem (e não tem) fica de fora, como no servidor.
     * `ocupantesDoQuarto` é a mesma função que o servidor usa para gravar
     * (no máximo 3 por quarto — refazer por ocupante não pesa).
     */
    const dados = mb.collaboratorId ? ocupantesDoQuarto(g, rowByCollab).find((o) => o.collaboratorId === mb.collaboratorId) : undefined;
    let hospedagem: HospedagemDoOcupante | null = null;
    if (r && dados && dados.precisa) {
      if (g.confirmed) {
        const { situacao, diferencas } = conferirHospedagem(r.accommodation, r.hospedagemDoEspelho, dados.dados);
        if (situacao) hospedagem = { teamInclusionId: r.teamInclusionId, nome: m.name, situacao, diferencas };
      } else if (r.hospedagemDoEspelho && Object.keys(r.hospedagemDoEspelho).length > 0) {
        hospedagem = { teamInclusionId: r.teamInclusionId, nome: m.name, situacao: "reaberto", diferencas: [] };
      }
    }
    return { m, r, bruto, ini, fim, mi, origem, chave, hospedagem, divergencia: dq?.divergencia?.texto ?? null };
  });
  type Ocupante = ReturnType<typeof ocupantes>[number];

  /** Tudo o que um quarto mostra, calculado uma vez por render. */
  const quartos = groups.map((g, gi) => {
    const lista = ocupantes(g);
    // Pelo apartamento que o hotel usa (22/10): sem duplo, a noite de dois num triplo é Triplo.
    const trechos = trechosPorApartamento(ocupacaoPorNoite(lista.map((o) => ({ checkIn: dia(o.ini), checkOut: dia(o.fim), o }))), tiposDoHotel);
    // Divergência de hospedagem igual para TODOS → um aviso do quarto; senão, na linha de quem tem.
    const divs = lista.map((o) => o.divergencia);
    const divergenciaComum = divs.length > 0 && divs.every((d) => d && d === divs[0]) ? divs[0] : null;
    // "Datas diferentes…" (recalculada com as datas mostradas): com a ocupação
    // por noite à vista, a frase não diz nada a mais — só fica sem ela.
    const auto = trechos.length > 1 ? null : observacaoDeDatas(lista.map((o) => ({ checkIn: dia(o.ini), checkOut: dia(o.fim) })));
    const manual = g.notes && !g.notes.startsWith(PREFIXO_DATAS_DIFERENTES) ? g.notes : null;
    // Tipo que o quarto virou e o hotel não tem (22/10) — selo no bloco e aviso no topo.
    const excede = tipoQueOHotelNaoTem(lista.length, tiposDoHotel);
    return { g, numero: gi + 1, lista, trechos, divergenciaComum, excede, notas: [auto, manual].filter((x): x is string => !!x) };
  });
  const excedentes = quartos.filter((q) => q.excede).map((q) => ({ tipo: q.excede as "double" | "triple", confirmed: !!q.g.confirmed }));

  /* Valores do hotel (20/10): a mesma conta do servidor, com as datas desta tela. */
  const comPainel = !!evento && valores !== undefined;
  const custo = custoDoHotel(entradaDoCustoDoHotel(groups, rows, valores ?? null));
  const comValores = comPainel && custo.temValores;
  const numeroDoQuarto = new Map(quartos.map((q) => [q.g.id, q.numero]));
  const escolhasDeLate = new Set((valores?.lateCheckouts ?? []).map((l) => l.collaboratorId));
  /** "R$ 200,00 a noite (R$ 100,00 para cada um)" do trecho — no título do selo de ocupação. */
  const tarifaDoTrecho = (quartoId: string, de: string) => {
    const t = comValores ? custo.porQuarto.get(quartoId)?.trechos.find((x) => x.de === de) : undefined;
    if (t?.tarifaCentavos == null) return "";
    return ` · ${brl(t.tarifaCentavos)} a noite${t.pessoas > 1 ? ` (${partesTxt(dividirCentavos(t.tarifaCentavos, t.pessoas))} para cada um)` : ""}`;
  };
  /** Nome curto de cada ocupante para a conta do quarto: o primeiro nome; o inteiro se repetir no quarto. */
  const nomesDaConta = (lista: Ocupante[]) => {
    const primeiro = (o: Ocupante) => o.m.name.trim().split(/\s+/)[0] || o.m.name;
    const repetidos = new Set(lista.map(primeiro).filter((n, i, a) => a.indexOf(n) !== i));
    return new Map(lista.map((o) => [o.chave, repetidos.has(primeiro(o)) ? o.m.name : primeiro(o)]));
  };

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
          destinos={groups.filter((x) => x.id !== g.id).map((x) => ({ id: x.id, descricao: descreve(x), bloqueio: bloqueioDoDestino(x) }))}
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
                title={`${ddmm(t.de)} a ${ddmm(t.ate)} · ${t.noites} ${t.noites === 1 ? "noite" : "noites"} · ${nomes}${tarifaDoTrecho(q.g.id, t.de)}`}>
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
          <span className="font-semibold text-foreground">{n === 1 ? "Individual" : n === 2 ? "Duplo" : n === 3 ? "Triplo" : `${n} pessoas`}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span className="tabular-nums text-muted-foreground">{n} {n === 1 ? "pessoa" : "pessoas"}</span>
        </span>
      </span>
    );
  };

  /* Hotel: o do evento, discreto; a exceção ("trocar só este") fica no próprio bloco. */
  const hotelEvento = hotelDoEvento(groups);
  const listaDeHoteis = `esp-hoteis-${evento?.id ?? "quartos"}`;
  // Sugestões: hotéis já usados nos quartos e nas hospedagens do evento.
  const sugestoesDeHotel = Array.from(new Map(
    [...groups.map((g) => g.hotelName), ...rows.map((r) => r.accommodation?.hotelName)]
      .map((h) => nomeDeHotelLimpo(h)).filter(Boolean).map((h) => [chaveDoHotel(h), h] as const),
  ).values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const hotel = (g: RoomGroup) => (
    <HotelDoQuarto valor={g.hotelName} doEvento={hotelEvento} canEdit={canEdit} listaDeSugestoes={listaDeHoteis}
      aoSalvar={(v) => onPatch(g.id, { hotelName: v })} />
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
    // Confirmado = já combinado com o hotel: quem saiu (vaga cancelada) precisa
    // ser desfeito lá. No não confirmado, o "Refazer sugestões" resolve sozinho.
    const saiu = q.g.confirmed ? avisoDeQuemSaiu(q.g.foraDoEspelho, "quarto") : null;
    if (saiu) {
      itens.push(
        <p key="saiu" className="flex items-start gap-1.5 text-xs font-medium leading-snug text-danger" role="status" data-testid={`room-vaga-cancelada-${q.g.id}`}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{saiu}</span>
        </p>,
      );
    }
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
  // Os valores só vão no PDF "com valores (uso interno)" — o do hotel sai sem.
  const quartosParaPdf: QuartoDaRoomingList[] = quartos.map((q) => {
    const cq = comValores ? custo.porQuarto.get(q.g.id) : undefined;
    return {
      hotelName: q.g.hotelName,
      observacao: q.g.notes && !q.g.notes.startsWith(PREFIXO_DATAS_DIFERENTES) ? q.g.notes : null,
      hospedes: q.lista.map((o) => ({
        collaboratorId: o.m.id ?? null, nome: o.m.name, checkIn: dia(o.ini), checkOut: dia(o.fim),
        ...(cq ? { valorCentavos: cq.pessoas.find((p) => p.chave === o.chave)?.totalCentavos ?? null } : {}),
      })),
      ...(cq ? { valorCentavos: cq.totalCentavos, valorCompleto: cq.completo } : {}),
    };
  });

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
          {evento && <RoomingListPdf evento={evento} quartos={quartosParaPdf} comValoresDisponivel={comValores} tiposDoHotel={tiposDoHotel} />}
          {refazer}
        </span>
      </header>

      <datalist id={listaDeHoteis}>
        {sugestoesDeHotel.map((h) => <option key={h} value={h} />)}
      </datalist>
      {evento && (
        <HotelDoEvento eventId={evento.id} canEdit={canEdit} listaDeSugestoes={listaDeHoteis}
          quartos={groups.map((g) => ({ id: g.id, hotelName: g.hotelName, confirmed: g.confirmed }))}>
          {chipsDosTipos}
          <HospedagensDasVagas eventId={evento.id} canEdit={canEdit}
            ocupantes={quartos.flatMap((q) => q.lista.map((o) => o.hospedagem).filter((h): h is HospedagemDoOcupante => !!h))} />
        </HotelDoEvento>
      )}
      <AvisoDeQuartosQueExcedem excedentes={excedentes} canEdit={canEdit} onRecalc={onRecalc} recalcPending={recalcPending} />
      {comPainel && evento && (
        <PainelDeValoresDoHotel eventId={evento.id} canEdit={canEdit} valores={valores ?? null} custo={custo}
          numeroDoQuarto={numeroDoQuarto} totalDeQuartos={groups.length} mutacoes={mutacoesDeValores} />
      )}

      <div className="esp-quartos-lista" data-valores={comValores || undefined}>
        {/* Uma régua de colunas para todos os blocos — a mesma grade das linhas. */}
        <div className="esp-quartos-colunas" aria-hidden="true">
          <span className="esp-col-nome">Ocupante<span className="esp-so-medio"> · departamento</span></span>
          <span className="esp-col-dep">Departamento</span>
          <span className="esp-col-ent">Entrada</span>
          <span className="esp-col-sai">Saída</span>
          {comValores && <span className="esp-col-val">Valor</span>}
        </div>

        {quartos.map((q) => {
          const { g } = q;
          return (
            <article key={g.id} className="esp-quarto group/quarto" data-confirmado={g.confirmed ? "true" : undefined}
              data-excede={q.excede ?? undefined}
              aria-label={`Quarto ${q.numero}${q.excede ? ` — o hotel não tem ${q.excede === "double" ? "duplo" : "triplo"}` : ""}`} data-testid={`room-card-${g.id}`}>
              <div className="esp-quarto-cab">
                <span className="esp-quarto-id flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <h4 className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">Quarto {q.numero}</h4>
                  {tipo(q)}
                  {q.excede && (
                    <span className="esp-selo-excede" data-testid={`room-excede-${g.id}`}
                      title={g.confirmed ? "Confirmado: o recálculo não mexe neste quarto — reabra ou separe à mão." : "“Refazer sugestões” remonta este quarto com o que o hotel tem."}>
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      o hotel não tem {q.excede === "double" ? "duplo" : "triplo"}
                    </span>
                  )}
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
                      {o.hospedagem && (
                        <HospedagemDoOcupanteAviso eventId={evento?.id} canEdit={canEdit} ocupante={o.hospedagem} />
                      )}
                    </div>
                    {data(o, "entrada")}
                    {data(o, "saida")}
                    {comValores && (
                      <ValorDaPessoa pessoa={custo.porQuarto.get(g.id)?.pessoas.find((p) => p.chave === o.chave)} nome={o.m.name}
                        collaboratorId={o.m.id ?? null} temEscolhaSalva={!!o.m.id && escolhasDeLate.has(o.m.id)} lateNaHospedagem={!!o.r?.accommodation?.lateCheckout}
                        lancadoCentavos={o.r && fonteDoHotel(o.r) === "lancado" && !valorEscritoPeloConfirmar(o.r) ? o.r.accommodation?.totalCents ?? null : null}
                        canEdit={canEdit} mutacoes={mutacoesDeValores} />
                    )}
                  </li>
                ))}
              </ul>
              {comValores && custo.porQuarto.get(g.id) && (
                <ValoresDoQuarto quarto={custo.porQuarto.get(g.id)!} nomes={nomesDaConta(q.lista)} canEdit={canEdit} mutacoes={mutacoesDeValores} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
