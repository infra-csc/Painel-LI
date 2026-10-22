/**
 * "Valores do hotel" na aba Quartos (20/10, pedido do dono: "colocar o valor
 * total que estou pagando e ele distribuir, para saber quanto estamos gastando
 * com cada [apartamento]").
 *
 * Um painel logo abaixo do "Hotel do evento", em três partes:
 *  1. TARIFAS por APARTAMENTO por noite — Individual, Duplo, Triplo —
 *     divididas entre quem dorme no quarto (21/10, dono: "o duplo é uma vez
 *     só"; antes eram lidas por pessoa); editáveis no lugar (salvam ao sair
 *     do campo; Esc desfaz);
 *  2. a DISTRIBUIÇÃO do custo por tipo de apartamento (barra + legenda com
 *     diárias de apartamento e valor) e o custo médio por pessoa;
 *  3. CALCULADO × PAGO: o total calculado, o valor pago ao hotel (a fatura) e
 *     a diferença — só comparada; nada é redistribuído sem alguém pedir.
 *
 * 22/10: tipo que o hotel não tem (tipos-do-hotel.tsx) fica cinza nas tarifas
 * ("o hotel não tem") e não aparece na distribuição.
 *
 * A conta é shared/custo-dos-quartos.ts (a mesma do servidor). Quem edita é
 * quem já edita os quartos (logística); quem só consulta vê os valores.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDollarSign, Info, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import type { TipoDoTrecho } from "@shared/ocupacao-por-noite";
import {
  rotuloDoApartamento, TIPOS_DE_APARTAMENTO, LIMITE_DA_DIARIA_CENTAVOS, LIMITE_DO_VALOR_PAGO_CENTAVOS,
  type CustoDoHotel, type ValoresDoHotelSalvos,
} from "@shared/custo-dos-quartos";
import { hotelTemOTipo } from "@shared/room-pairing";
import { brl } from "./mirror-shared";
import { mirrorQueryKey } from "./use-mirror-data";

/** A cor de cada tipo — a mesma do ponto do selo nos blocos de quarto. */
export const COR_DO_APARTAMENTO: Record<TipoDoTrecho, string> = {
  single: "var(--neutral)",
  double: "var(--primary)",
  triple: "var(--info-strong)",
};
const COR_DO_LATE = "var(--warning-strong)";

const diariasTxt = (n: number) => `${n} ${n === 1 ? "diária" : "diárias"}`;
const pessoasTxt = (n: number) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;

/**
 * Texto digitado → centavos. Aceita "138", "138,5", "1.380,00", "R$ 138,00" e
 * "138.50" (ponto decimal com 1–2 casas). Vazio → `null`; o resto → "invalido".
 */
export function centavosDoTexto(texto: string): number | null | "invalido" {
  const t = texto.replace(/R\$\s*/i, "").replace(/\s+/g, "").trim();
  if (!t) return null;
  let normal: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+(,\d{1,2})?$/.test(t)) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(t)) normal = t;
  else return "invalido";
  const reais = Number(normal);
  return Number.isFinite(reais) ? Math.round(reais * 100) : "invalido";
}

/** "138,00" — o valor no campo, sem o símbolo (o "R$" fica fixo à esquerda). */
const textoDoCampo = (c: number | null | undefined) =>
  c === null || c === undefined ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Campo de dinheiro editável no lugar, em centavos e anulável. Salva ao sair
 * do campo ou no Enter; Esc devolve o valor anterior. Mostra salvando → salvo,
 * e o erro fica no campo (com o texto digitado) até a próxima tentativa.
 */
export function CampoDeDinheiro({ valor, aoSalvar, rotulo, placeholder, limite, desabilitado, autoFocus, testid, className, aoTerminar, descricao }: {
  valor: number | null | undefined;
  aoSalvar: (v: number | null) => Promise<unknown>;
  /** Nome acessível do campo. */
  rotulo: string;
  placeholder?: string;
  limite: number;
  desabilitado?: boolean;
  autoFocus?: boolean;
  testid?: string;
  className?: string;
  /** Chamado ao sair do campo, depois de salvar (ou de não haver o que salvar). */
  aoTerminar?: () => void;
  /** id de um texto de apoio (aria-describedby). */
  descricao?: string;
}) {
  const [texto, setTexto] = useState(textoDoCampo(valor));
  const [estado, setEstado] = useState<"ocioso" | "salvando" | "salvo" | "erro">("ocioso");
  const [erro, setErro] = useState<string | null>(null);
  const descartar = useRef(false);
  const focado = useRef(false);
  const idDoErro = useId();
  // Outra pessoa (ou outra parte da tela) mudou o valor: acompanha, se não estiver digitando.
  useEffect(() => { if (!focado.current) setTexto(textoDoCampo(valor)); }, [valor]);
  useEffect(() => {
    if (estado !== "salvo") return;
    const t = setTimeout(() => setEstado("ocioso"), 1400);
    return () => clearTimeout(t);
  }, [estado]);

  const confirmar = async () => {
    const lido = centavosDoTexto(texto);
    if (lido === "invalido") { setEstado("erro"); setErro("Valor inválido (ex.: 138,00)"); return; }
    if (lido !== null && lido > limite) { setEstado("erro"); setErro("Valor alto demais — confira a digitação"); return; }
    if (lido === (valor ?? null)) { setTexto(textoDoCampo(valor)); setEstado("ocioso"); setErro(null); aoTerminar?.(); return; }
    setEstado("salvando"); setErro(null);
    try {
      await aoSalvar(lido);
      setTexto(textoDoCampo(lido));
      setEstado("salvo");
      aoTerminar?.();
    } catch (e) {
      setEstado("erro");
      setErro(apiErrorMessage(e, "Não foi possível salvar."));
    }
  };

  return (
    <span className={`esp-dinheiro-campo ${className ?? ""}`}>
    <span className="esp-dinheiro" data-estado={estado}>
      <span className="esp-dinheiro-moeda" aria-hidden="true">R$</span>
      <input
        value={texto}
        inputMode="decimal"
        autoComplete="off"
        aria-label={rotulo}
        aria-invalid={estado === "erro" || undefined}
        aria-describedby={[estado === "erro" ? idDoErro : null, descricao].filter(Boolean).join(" ") || undefined}
        placeholder={placeholder ?? "—"}
        disabled={desabilitado || estado === "salvando"}
        autoFocus={autoFocus}
        data-testid={testid}
        onFocus={(e) => { focado.current = true; e.currentTarget.select(); }}
        onChange={(e) => { setTexto(e.target.value); if (estado === "erro") { setEstado("ocioso"); setErro(null); } }}
        onBlur={() => {
          focado.current = false;
          if (descartar.current) { descartar.current = false; aoTerminar?.(); return; }
          void confirmar();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") {
            e.preventDefault(); e.stopPropagation();
            descartar.current = true; setTexto(textoDoCampo(valor)); setEstado("ocioso"); setErro(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="esp-dinheiro-estado" aria-hidden="true">
        {estado === "salvando" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />}
        {estado === "salvo" && <Check className="esp-dinheiro-ok h-3.5 w-3.5 text-success" />}
        {estado === "erro" && <AlertTriangle className="h-3.5 w-3.5 text-danger" />}
      </span>
    </span>
      {estado === "erro" && erro && <span id={idDoErro} role="alert" className="esp-dinheiro-erro">{erro}</span>}
    </span>
  );
}

type CamposDoEvento = Partial<Record<"individualCentavos" | "duploCentavos" | "triploCentavos" | "faturaCentavos", number | null>>
  /** 22/10 — o hotel tem apartamento Duplo/Triplo (tipos-do-hotel.tsx). */
  & { temDuplo?: boolean; temTriplo?: boolean };
const CAMPO_DO_TIPO: Record<TipoDoTrecho, "individualCentavos" | "duploCentavos" | "triploCentavos"> ={ single: "individualCentavos", double: "duploCentavos", triple: "triploCentavos" };

/** Mutações dos valores do hotel. Todas atualizam a MESMA resposta do Espelho. */
export function useValoresDoHotel(eventId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidar = () => queryClient.invalidateQueries({ queryKey: mirrorQueryKey(eventId) });
  const avisarErro = (titulo: string) => (e: unknown) =>
    toast({ title: titulo, description: apiErrorMessage(e, "Tente novamente em instantes."), variant: "destructive" });

  const evento = useMutation({
    mutationFn: async (campos: CamposDoEvento) => (await apiRequest("PUT", `/api/events/${eventId}/operational-mirror/hotel-valores`, campos)).json(),
    onSuccess: invalidar,
  });
  const quarto = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: { diariaPropriaCentavos?: number | null; valorPagoCentavos?: number | null } }) =>
      (await apiRequest("PUT", `/api/hotel-room-groups/${id}/valores`, campos)).json(),
    onSuccess: invalidar,
  });
  const late = useMutation({
    mutationFn: async (corpo: { collaboratorId: string; ativo: boolean | null; valorCentavos?: number | null }) =>
      (await apiRequest("PUT", `/api/events/${eventId}/operational-mirror/late-checkout`, corpo)).json(),
    onSuccess: invalidar,
    onError: avisarErro("Não foi possível salvar o late check-out"),
  });
  return { evento, quarto, late };
}
export type ValoresDoHotelMutacoes = ReturnType<typeof useValoresDoHotel>;

/** "+R$ 120,00 · 2,4% acima do calculado" / "bate com o calculado". */
export function leituraDaDiferenca(diferenca: number, percentual: number | null): { tom: "ok" | "acima" | "abaixo"; texto: string } {
  if (diferenca === 0) return { tom: "ok", texto: "Bate com o calculado" };
  const pct = percentual === null ? "" : ` · ${Math.abs(percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return diferenca > 0
    ? { tom: "acima", texto: `+${brl(diferenca)}${pct} acima do calculado` }
    : { tom: "abaixo", texto: `−${brl(-diferenca)}${pct} abaixo do calculado` };
}

export function PainelDeValoresDoHotel({ eventId, canEdit, valores, custo, numeroDoQuarto, totalDeQuartos, mutacoes }: {
  eventId: string;
  canEdit: boolean;
  /** `null` = as tabelas ainda não existem no banco (o boot ainda está criando). */
  valores: ValoresDoHotelSalvos | null;
  custo: CustoDoHotel;
  numeroDoQuarto: Map<string, number>;
  totalDeQuartos: number;
  mutacoes: ValoresDoHotelMutacoes;
}) {
  const indisponivel = valores === null;
  const idAjuda = `valores-ajuda-${eventId}`;
  const salvarEvento = (campos: CamposDoEvento) => mutacoes.evento.mutateAsync(campos);
  const tarifa = (t: TipoDoTrecho) => valores?.tarifas[t] ?? null;
  const porTipo = new Map(custo.porTipo.map((t) => [t.tipo, t]));
  /** 22/10 — tipo que o hotel não tem fica cinza aqui e some da distribuição. */
  const tem = (t: TipoDoTrecho) => hotelTemOTipo(t, valores?.tipos);

  // ── 1. Tarifas ───────────────────────────────────────────────────────────
  const tarifas = (
    <div className="esp-valores-tarifas" role="group" aria-label="Tarifas por apartamento por noite">
      {TIPOS_DE_APARTAMENTO.map((t) => {
        const r = porTipo.get(t)!;
        if (!tem(t)) {
          // A tarifa gravada fica guardada (volta se marcarem de novo), mas não aparece nem entra na conta.
          return (
            <div key={t} className="esp-valores-tarifa" data-sem-tipo data-testid={`tarifa-${t}`}>
              <span className="esp-valores-rotulo">
                <i className="esp-valores-ponto" style={{ background: "var(--border)" }} aria-hidden="true" />
                {rotuloDoApartamento(t)}
              </span>
              <span className="esp-valores-numero esp-valores-sem-tipo" data-testid={`tarifa-${t}-sem-tipo`}>o hotel não tem</span>
              <span className={`esp-valores-dica ${r.noitesDeQuarto > 0 ? "text-warning" : ""}`}>
                {r.noitesDeQuarto > 0 ? `${diariasTxt(r.noitesDeQuarto)} em quarto que excede` : "fora das sugestões"}
              </span>
            </div>
          );
        }
        // Âmbar só quando já há valores e ESTE tipo ficou sem: no vazio, é só o convite.
        const falta = custo.temValores && r.noitesSemTarifa > 0;
        const idDica = `tarifa-${t}-${eventId}`;
        return (
          <div key={t} className="esp-valores-tarifa" data-falta={falta || undefined} data-testid={`tarifa-${t}`}>
            <span className="esp-valores-rotulo">
              <i className="esp-valores-ponto" style={{ background: COR_DO_APARTAMENTO[t] }} aria-hidden="true" />
              {rotuloDoApartamento(t)}
            </span>
            {canEdit ? (
              <CampoDeDinheiro valor={tarifa(t)} rotulo={`Tarifa ${rotuloDoApartamento(t)} por apartamento por noite`} limite={LIMITE_DA_DIARIA_CENTAVOS}
                desabilitado={indisponivel} testid={`tarifa-${t}-campo`} descricao={idDica}
                aoSalvar={(v) => salvarEvento({ [CAMPO_DO_TIPO[t]]: v })} />
            ) : (
              <span className={`esp-valores-numero ${tarifa(t) === null ? "text-muted-foreground" : ""}`}>{tarifa(t) === null ? "—" : brl(tarifa(t))}</span>
            )}
            <span id={idDica} className={`esp-valores-dica ${falta ? "text-warning" : ""}`}>
              {falta ? `${diariasTxt(r.noitesSemTarifa)} sem tarifa` : r.noitesDeQuarto > 0 ? diariasTxt(r.noitesDeQuarto) : "nenhuma noite"}
            </span>
          </div>
        );
      })}
    </div>
  );

  // ── 3. Calculado × pago ──────────────────────────────────────────────────
  const fatura = valores?.faturaCentavos ?? null;
  const dif = custo.fatura ? leituraDaDiferenca(custo.fatura.diferencaCentavos, custo.fatura.percentual) : null;
  const fechamento = (
    <div className="esp-valores-fechamento" data-testid="valores-fechamento">
      <div className="esp-valores-celula">
        <span className="esp-valores-rotulo">Calculado</span>
        <span className={`esp-valores-total ${custo.temValores ? "" : "text-muted-foreground"}`} data-testid="valores-calculado">{custo.temValores ? brl(custo.totalCentavos) : "—"}</span>
        <span className={`esp-valores-dica ${custo.temValores && !custo.completo ? "text-warning" : ""}`}>
          {!custo.temValores ? "aparece com as tarifas"
            : !custo.completo ? "parcial — falta tarifa de algum tipo"
              : custo.custoMedioPorPessoaCentavos !== null ? `média de ${brl(custo.custoMedioPorPessoaCentavos)} por pessoa · ${pessoasTxt(custo.pessoas)}` : "—"}
        </span>
      </div>
      <div className="esp-valores-celula">
        <span className="esp-valores-rotulo">Pago ao hotel</span>
        {canEdit ? (
          <CampoDeDinheiro valor={fatura} rotulo="Valor total pago ao hotel (fatura)" limite={LIMITE_DO_VALOR_PAGO_CENTAVOS} placeholder="fatura"
            desabilitado={indisponivel} testid="valores-fatura-campo" className="esp-dinheiro-largo"
            aoSalvar={(v) => salvarEvento({ faturaCentavos: v })} />
        ) : (
          <span className={`esp-valores-numero ${fatura === null ? "text-muted-foreground" : ""}`}>{fatura === null ? "não informado" : brl(fatura)}</span>
        )}
        <span className="esp-valores-dica">{fatura === null ? "o total da fatura" : "fatura do evento"}</span>
      </div>
      <div className="esp-valores-celula" aria-live="polite">
        <span className="esp-valores-rotulo">Diferença</span>
        {dif ? (
          <>
            <span className={`esp-valores-numero esp-dif-${dif.tom}`} data-testid="valores-diferenca">
              {custo.fatura!.diferencaCentavos === 0 ? brl(0) : `${custo.fatura!.diferencaCentavos > 0 ? "+" : "−"}${brl(Math.abs(custo.fatura!.diferencaCentavos))}`}
            </span>
            <span className={`esp-valores-dica esp-dif-${dif.tom}`}>
              {dif.tom === "ok" ? dif.texto : `${custo.fatura!.percentual === null ? "" : `${Math.abs(custo.fatura!.percentual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · `}o hotel cobrou a ${dif.tom === "acima" ? "mais" : "menos"}`}
            </span>
          </>
        ) : (
          <>
            <span className="esp-valores-numero text-muted-foreground">—</span>
            <span className="esp-valores-dica">aparece com o valor pago</span>
          </>
        )}
      </div>
    </div>
  );

  // ── 2. Distribuição ──────────────────────────────────────────────────────
  const fatias = [
    ...custo.porTipo.filter((t) => t.centavos > 0 && tem(t.tipo)).map((t) => ({ chave: t.tipo as string, cor: COR_DO_APARTAMENTO[t.tipo], centavos: t.centavos })),
    ...(custo.lateCheckout.centavos > 0 ? [{ chave: "late", cor: COR_DO_LATE, centavos: custo.lateCheckout.centavos }] : []),
  ];
  const distribuicao = (
    <div className="esp-valores-distribuicao" data-testid="valores-distribuicao">
      {custo.totalCentavos > 0 && (
        <div className="esp-valores-barra" role="img"
          aria-label={`Distribuição: ${fatias.map((f) => `${f.chave === "late" ? "Late check-out" : rotuloDoApartamento(f.chave as TipoDoTrecho)} ${brl(f.centavos)}`).join(", ")}`}>
          {fatias.map((f) => <span key={f.chave} style={{ flexGrow: f.centavos, background: f.cor }} />)}
        </div>
      )}
      <ul className="esp-valores-legenda">
        {custo.porTipo.filter((t) => t.noitesDeQuarto > 0 && tem(t.tipo)).map((t) => (
          <li key={t.tipo} data-testid={`distribuicao-${t.tipo}`}>
            <i className="esp-valores-ponto" style={{ background: COR_DO_APARTAMENTO[t.tipo] }} aria-hidden="true" />
            <span className="font-medium text-foreground">{rotuloDoApartamento(t.tipo)}</span>
            <span className="tabular-nums text-foreground">{brl(t.centavos)}</span>
            <span className="tabular-nums text-muted-foreground" title={`${diariasTxt(t.noitesDeQuarto)} de apartamento · ${t.pessoasNoite} ${t.pessoasNoite === 1 ? "pessoa-noite" : "pessoas-noite"}`}>
              {diariasTxt(t.noitesDeQuarto)}{t.noitesSemTarifa > 0 ? ` · ${t.noitesSemTarifa} sem tarifa` : ""}
            </span>
          </li>
        ))}
        {custo.lateCheckout.pessoas > 0 && (
          <li data-testid="distribuicao-late">
            <i className="esp-valores-ponto" style={{ background: COR_DO_LATE }} aria-hidden="true" />
            <span className="font-medium text-foreground">Late check-out</span>
            <span className="tabular-nums text-foreground">{brl(custo.lateCheckout.centavos)}</span>
            <span className="tabular-nums text-muted-foreground">{pessoasTxt(custo.lateCheckout.pessoas)}</span>
          </li>
        )}
      </ul>
    </div>
  );

  const avisos: { chave: string; texto: string }[] = [
    ...custo.noitesAcimaDoTriplo.map((n) => ({
      chave: `${n.quartoId}-${n.de}`,
      texto: `Quarto ${numeroDoQuarto.get(n.quartoId) ?? "?"} tem ${n.pessoas} pessoas na mesma noite — usei a tarifa do Triplo. Confira o quarto (o máximo é 3).`,
    })),
  ];
  if (custo.pagoPorQuarto) {
    const p = custo.pagoPorQuarto;
    const l = leituraDaDiferenca(p.diferencaCentavos, p.calculadoCentavos > 0 ? p.diferencaCentavos / p.calculadoCentavos : null);
    avisos.push({
      chave: "por-quarto",
      texto: `Pago por quarto: ${brl(p.pagoCentavos)} em ${p.quartos} de ${totalDeQuartos} ${totalDeQuartos === 1 ? "quarto" : "quartos"} (calculado ${brl(p.calculadoCentavos)}) · ${l.texto.charAt(0).toLowerCase()}${l.texto.slice(1)}.`,
    });
  }

  const vazio = !custo.temValores;
  return (
    <section className="esp-valores" aria-labelledby={`valores-titulo-${eventId}`} data-testid="valores-do-hotel" data-vazio={vazio || undefined}>
      <header className="esp-valores-cab">
        <h4 id={`valores-titulo-${eventId}`} className="esp-valores-titulo">
          <CircleDollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Valores do hotel
        </h4>
        <span id={idAjuda} className="text-xs text-muted-foreground">por apartamento, por noite — dividido entre quem dorme no quarto</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" data-testid="valores-como-calcula" className="esp-alvo ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />Como é calculado
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[340px] space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p className="text-sm font-semibold text-foreground">Como o valor é calculado</p>
            <p>A tarifa é o preço do <b className="text-foreground">apartamento por noite</b>. Em cada noite o quarto custa a tarifa do tipo daquela noite — uma pessoa é <b className="text-foreground">Individual</b>, duas é <b className="text-foreground">Duplo</b>, três é <b className="text-foreground">Triplo</b> — e o valor é dividido entre quem dorme nele: Duplo de R$ 200 dá R$ 100 para cada um.</p>
            <p>No duplo em que um chega antes, as noites dele sozinho são Individual, e ele paga o apartamento inteiro. Centavos que não dividem certo ficam com os primeiros da lista; a soma sempre bate com o quarto.</p>
            {(!tem("double") || !tem("triple")) && (
              <p data-testid="valores-como-calcula-tipos">Este hotel não tem {!tem("double") && !tem("triple") ? "duplo nem triplo" : !tem("double") ? "duplo: a noite de duas pessoas num triplo é cobrada como Triplo" : "triplo"}. Tipo que o hotel não tem fica sem tarifa — o quarto aparece marcado.</p>
            )}
            <p>Quarto com <b className="text-foreground">diária própria</b> usa o preço dele em todas as noites, dividido do mesmo jeito. O <b className="text-foreground">late check-out</b> é por pessoa e soma no valor de quem tem — igual à parte dela na última noite, se ninguém escrever outro valor.</p>
            <p>O total entra no “Hotel” do custo do Espelho, a menos que o total de hotel da pessoa tenha sido lançado à mão na grade. O valor pago ao hotel só é comparado; nada é redistribuído.</p>
          </PopoverContent>
        </Popover>
      </header>

      {indisponivel && (
        <p className="esp-valores-aviso text-warning" role="status" data-testid="valores-indisponivel">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Os valores do hotel ainda não estão disponíveis neste servidor — o banco está sendo preparado. Recarregue em alguns instantes.
        </p>
      )}

      <div className="esp-valores-corpo">
        {tarifas}
        {fechamento}
      </div>

      {vazio ? (
        <p className="esp-valores-vazio" data-testid="valores-vazio">
          {canEdit
            ? "Comece pelas tarifas: com elas, cada quarto mostra a conta das noites, cada pessoa o seu valor e aqui aparece a distribuição por tipo de apartamento."
            : "As tarifas do hotel ainda não foram definidas — quem cuida da hospedagem lança aqui, e o valor de cada quarto aparece em seguida."}
        </p>
      ) : distribuicao}

      {avisos.length > 0 && (
        <div className="esp-valores-avisos">
          {avisos.map((a) => (
            <p key={a.chave} className={`esp-valores-aviso ${a.chave === "por-quarto" ? "text-muted-foreground" : "text-warning"}`} data-testid={`valores-aviso-${a.chave === "por-quarto" ? "por-quarto" : "4-pessoas"}`}>
              {a.chave === "por-quarto" ? <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {a.texto}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
