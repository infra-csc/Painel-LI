/**
 * Valores DENTRO de cada quarto da aba Quartos (20/10):
 *  - `ValoresDoQuarto`: o rodapé do bloco — a conta das noites, o total do
 *    quarto e quanto cada um paga nele, a diária própria (com "voltar ao
 *    padrão") e o valor pago ao hotel por este quarto, opcional, com a
 *    diferença;
 *  - `ValorDaPessoa`: o valor (a PARTE) de cada ocupante na linha dele e o
 *    late check-out (marcar, valor sugerido igual à parte dela na última
 *    noite, editar, tirar).
 *
 * 21/10, dono: a tarifa é do APARTAMENTO por noite, dividida entre quem dorme
 * no quarto ("o duplo é uma vez só"), e a conta antiga — "● 1 noite
 * Individual 1 × R$ 100,00" — estava "bem difícil de entender". Agora é uma
 * frase por trecho de ocupação, com as datas e sem multiplicador de pessoas:
 *   "07/11 → 10/11 · 3 noites em Duplo · R$ 200,00 a noite = R$ 600,00 —
 *    R$ 300,00 para cada um"
 * e, no fim, o total do quarto e quanto cada um paga nele.
 *
 * Contas em shared/custo-dos-quartos.ts. O "lançado na grade" aparece quando
 * o total de hotel da pessoa foi escrito à mão na grade — é ele que entra no
 * custo do Espelho, não o calculado (o padrão manual × calculado do app).
 */
import { useState } from "react";
import { AlertTriangle, Clock, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { CustoDaPessoaNoQuarto, CustoDoQuarto, TrechoComValor } from "@shared/custo-dos-quartos";
import { LIMITE_DA_DIARIA_CENTAVOS, LIMITE_DO_VALOR_PAGO_CENTAVOS, rotuloDoApartamento } from "@shared/custo-dos-quartos";
import { CampoDeDinheiro, leituraDaDiferenca, type ValoresDoHotelMutacoes } from "./valores-do-hotel";
import { brl } from "./mirror-shared";

const noitesTxt = (n: number) => `${n} ${n === 1 ? "noite" : "noites"}`;
const ddmm = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;

/**
 * A parte de cada pessoa num trecho: "R$ 500,00"; quando o centavo não divide
 * certo (triplo de R$ 100), a faixa real: "R$ 33,33 a R$ 33,34".
 */
export function partesTxt(partes: readonly number[]): string {
  const min = Math.min(...partes);
  const max = Math.max(...partes);
  return min === max ? brl(min) : `${brl(min)} a ${brl(max)}`;
}

/**
 * Quem paga o quê no trecho, em português: "Thiago paga o quarto inteiro"
 * (sozinho) · "R$ 300,00 para cada um" · "R$ 33,33 a R$ 33,34 para cada um".
 */
export function quemPagaTxt(t: Pick<TrechoComValor, "pessoas" | "chaves" | "partesCentavos">, nomes: ReadonlyMap<string, string>): string | null {
  if (!t.partesCentavos) return null;
  if (t.pessoas === 1) {
    const nome = nomes.get(t.chaves[0]);
    return nome ? `${nome} paga o quarto inteiro` : "paga o quarto inteiro";
  }
  return `${partesTxt(t.partesCentavos)} para cada um`;
}

/** Rodapé de valores de um quarto. `nomes`: chave da pessoa → nome curto (o primeiro, ou o inteiro se repetir no quarto). */
export function ValoresDoQuarto({ quarto, nomes, canEdit, mutacoes }: {
  quarto: CustoDoQuarto;
  nomes: ReadonlyMap<string, string>;
  canEdit: boolean;
  mutacoes: ValoresDoHotelMutacoes;
}) {
  const [editandoDiaria, setEditandoDiaria] = useState(false);
  const salvar = (campos: { diariaPropriaCentavos?: number | null; valorPagoCentavos?: number | null }) =>
    mutacoes.quarto.mutateAsync({ id: quarto.id, campos });
  const dif = quarto.diferencaCentavos === null ? null
    : leituraDaDiferenca(quarto.diferencaCentavos, quarto.totalCentavos > 0 ? quarto.diferencaCentavos / quarto.totalCentavos : null);
  const nomeDe = (chave: string) => nomes.get(chave) ?? "Ocupante";
  const comLate = quarto.pessoas.filter((p) => p.lateCheckout);
  const pagantes = quarto.pessoas.filter((p) => p.noites > 0);

  // Uma frase por trecho de ocupação; cada pedaço quebra inteiro (no celular,
  // a frase desce em linhas sem partir "R$ 200,00 a noite" no meio).
  const conta = (
    <ul className="esp-qv-conta" aria-label="Conta das noites" data-testid={`quarto-conta-${quarto.id}`}>
      {quarto.trechos.map((t) => {
        const quem = quemPagaTxt(t, nomes);
        return (
          <li key={t.de} className="esp-qv-trecho" data-sem-tarifa={t.tarifaCentavos === null || undefined} data-testid={`quarto-trecho-${quarto.id}`}>
            {/* Os {" "} não mudam o desenho (flex) — deixam o texto lido/copiado com espaços. */}
            <span className="esp-qv-pedaco tabular-nums text-muted-foreground">{ddmm(t.de)} → {ddmm(t.ate)}</span>{" "}
            <span className="esp-qv-sep" aria-hidden="true">·</span>{" "}
            <span className="esp-qv-pedaco">{noitesTxt(t.noites)} em <b className="font-semibold text-foreground">{rotuloDoApartamento(t.tipo)}</b></span>{" "}
            <span className="esp-qv-sep" aria-hidden="true">·</span>{" "}
            {t.tarifaCentavos === null ? (
              <span className="esp-qv-pedaco font-medium text-warning">sem tarifa</span>
            ) : (
              <>
                <span className="esp-qv-pedaco tabular-nums">{brl(t.tarifaCentavos)} a noite = <b className="font-semibold text-foreground">{brl(t.totalCentavos)}</b></span>
                {quem && <>{" "}<span className="esp-qv-pedaco text-muted-foreground">— {quem}</span></>}
              </>
            )}
            {t.acimaDoTriplo && (
              <>{" "}<span className="esp-qv-pedaco inline-flex items-center gap-1 font-medium text-warning" title="O máximo é 3 por quarto — usei a tarifa do Triplo dividida pelas pessoas da noite">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />{t.pessoas} pessoas (máx. 3)
              </span></>
            )}
          </li>
        );
      })}
      {comLate.map((p) => (
        <li key={`late-${p.chave}`} className="esp-qv-trecho" data-testid={`quarto-late-${quarto.id}`}>
          <Clock className="h-3 w-3 shrink-0 self-center text-warning-strong" aria-hidden="true" />
          <span className="esp-qv-pedaco">Late check-out de {nomeDe(p.chave)}:</span>{" "}
          {p.lateCheckout!.valorCentavos === null
            ? <span className="esp-qv-pedaco font-medium text-warning">sem valor</span>
            : <b className="esp-qv-pedaco font-semibold tabular-nums text-foreground">+ {brl(p.lateCheckout!.valorCentavos)}</b>}
        </li>
      ))}
    </ul>
  );

  // Diária própria: "diária própria do quarto" com o lápis; própria = valor + "voltar ao padrão".
  const diaria = canEdit ? (
    quarto.usaDiariaPropria || editandoDiaria ? (
      <span className="esp-qv-campo" data-testid={`quarto-diaria-${quarto.id}`}>
        <span className="esp-qv-rotulo">Diária deste quarto</span>
        <CampoDeDinheiro valor={quarto.diariaPropriaCentavos} rotulo="Diária deste quarto, por apartamento por noite" limite={LIMITE_DA_DIARIA_CENTAVOS}
          autoFocus={editandoDiaria && !quarto.usaDiariaPropria} testid={`quarto-diaria-campo-${quarto.id}`} placeholder="a noite"
          aoSalvar={(v) => salvar({ diariaPropriaCentavos: v })} aoTerminar={() => setEditandoDiaria(false)} />
        <span className="text-xs text-muted-foreground">a noite, em vez da tarifa do evento</span>
        {quarto.usaDiariaPropria && (
          <button type="button" onClick={() => void salvar({ diariaPropriaCentavos: null })} data-testid={`quarto-diaria-padrao-${quarto.id}`}
            className="esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RotateCcw className="h-3 w-3" aria-hidden="true" />voltar ao padrão
          </button>
        )}
      </span>
    ) : (
      <button type="button" onClick={() => setEditandoDiaria(true)} data-testid={`quarto-diaria-definir-${quarto.id}`}
        className="esp-alvo inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Pencil className="h-3 w-3" aria-hidden="true" />diária própria do quarto
      </button>
    )
  ) : quarto.usaDiariaPropria ? (
    <span className="text-xs text-muted-foreground" data-testid={`quarto-diaria-${quarto.id}`}>
      Diária deste quarto: <b className="font-semibold tabular-nums text-foreground">{brl(quarto.diariaPropriaCentavos)}</b> a noite (em vez da tarifa do evento)
    </span>
  ) : null;

  const pago = canEdit ? (
    <span className="esp-qv-campo" data-testid={`quarto-pago-${quarto.id}`}>
      <span className="esp-qv-rotulo">Pago</span>
      <CampoDeDinheiro valor={quarto.valorPagoCentavos} rotulo="Valor pago ao hotel por este quarto (opcional)" limite={LIMITE_DO_VALOR_PAGO_CENTAVOS}
        placeholder="opcional" testid={`quarto-pago-campo-${quarto.id}`} aoSalvar={(v) => salvar({ valorPagoCentavos: v })} />
    </span>
  ) : quarto.valorPagoCentavos !== null ? (
    <span className="esp-qv-campo"><span className="esp-qv-rotulo">Pago</span><span className="tabular-nums text-foreground">{brl(quarto.valorPagoCentavos)}</span></span>
  ) : null;

  return (
    <div className="esp-quarto-valores" data-testid={`quarto-valores-${quarto.id}`} data-propria={quarto.usaDiariaPropria || undefined}>
      {conta}
      <div className="esp-qv-fecho">
        {/* Quanto cada um paga NO quarto (com o late check-out) — só com 2 ou mais. */}
        {pagantes.length > 1 && (
          <p className="esp-qv-cada" data-testid={`quarto-cada-um-${quarto.id}`}>
            <span className="esp-qv-rotulo self-center">Cada um</span>{" "}
            {pagantes.map((p, i) => (
              <span key={p.chave} className="esp-qv-pedaco">
                {i > 0 && <><span className="esp-qv-sep" aria-hidden="true">·</span>{" "}</>}
                {nomeDe(p.chave)} <b className="font-semibold tabular-nums text-foreground">{brl(p.totalCentavos)}</b>{" "}
              </span>
            ))}
          </p>
        )}
        <span className="esp-qv-total">
          <span className="esp-qv-rotulo">Total do quarto</span>
          <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`quarto-total-${quarto.id}`}>{brl(quarto.totalCentavos)}</span>
          {!quarto.completo && (
            <span className="text-2xs font-medium text-warning">
              parcial · {quarto.noitesSemTarifa > 0 ? `${noitesTxt(quarto.noitesSemTarifa)} sem tarifa` : "late check-out sem valor"}
            </span>
          )}
        </span>
      </div>
      {(diaria || pago) && (
        <div className="esp-qv-ajustes">
          {diaria}
          {pago}
          {dif && (
            <span className={`esp-qv-dif esp-dif-${dif.tom}`} data-testid={`quarto-diferenca-${quarto.id}`}>{dif.texto}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Valor de UM ocupante na linha dele + o late check-out. `lancado`: o total de
 * hotel da pessoa escrito à mão na grade (é o que conta no Espelho).
 */
export function ValorDaPessoa({ pessoa, nome, collaboratorId, temEscolhaSalva, lateNaHospedagem, lancadoCentavos, canEdit, mutacoes }: {
  pessoa: CustoDaPessoaNoQuarto | undefined;
  nome: string;
  collaboratorId: string | null;
  /** Há uma escolha de late check-out gravada na aba Quartos (vence a hospedagem). */
  temEscolhaSalva: boolean;
  /** A caixa "Late check-out" da hospedagem da vaga (grade) está marcada. */
  lateNaHospedagem: boolean;
  lancadoCentavos: number | null;
  canEdit: boolean;
  mutacoes: ValoresDoHotelMutacoes;
}) {
  const [aberto, setAberto] = useState(false);
  if (!pessoa || pessoa.noites === 0) {
    return <div className="esp-oc-val"><span className="esp-oc-rotulo text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Valor</span><span className="text-xs text-muted-foreground">sem datas</span></div>;
  }
  const late = pessoa.lateCheckout;
  /** A parte dela na última noite (tarifa do apartamento ÷ ocupantes) — a sugestão do late. */
  const sugestao = pessoa.parteDaUltimaNoiteCentavos;
  const podeMarcar = canEdit && !!collaboratorId;

  const gravar = (ativo: boolean | null, valorCentavos?: number | null) =>
    mutacoes.late.mutateAsync({ collaboratorId: collaboratorId as string, ativo, ...(valorCentavos !== undefined ? { valorCentavos } : {}) });

  const editorDoLate = (
    <PopoverContent align="end" className="w-[300px] p-0" data-testid="late-checkout-popover">
      <div className="space-y-3 px-4 pb-3 pt-3.5">
        <div>
          <p className="text-sm font-semibold text-foreground">Late check-out</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={nome}>{nome}</p>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-foreground">Tem late check-out</span>
          <Switch checked={!!late} disabled={mutacoes.late.isPending}
            onCheckedChange={(v) => { void gravar(v, v ? null : undefined).catch(() => {}); }} data-testid="late-checkout-switch" />
        </label>
        {late && (
          <div className="space-y-1">
            <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Valor</span>
            <CampoDeDinheiro valor={late.sugerido ? null : late.valorCentavos} rotulo={`Valor do late check-out de ${nome}`} limite={LIMITE_DA_DIARIA_CENTAVOS}
              placeholder={sugestao === null ? "valor" : (sugestao / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              testid="late-checkout-valor" className="esp-dinheiro-largo"
              aoSalvar={(v) => gravar(true, v)} />
            <p className="text-xs leading-snug text-muted-foreground">
              {sugestao === null
                ? "Sem tarifa para a última noite: escreva o valor."
                : late.sugerido ? `Igual à parte dela na última noite (${brl(sugestao)}). Escreva outro valor se o hotel cobrar diferente.` : `A parte dela na última noite é ${brl(sugestao)} — apague para voltar a ela.`}
            </p>
          </div>
        )}
        {late?.origem === "hospedagem" && (
          <p className="text-xs leading-snug text-muted-foreground">Marcado na hospedagem da vaga (grade). Desligar aqui vale só para o custo.</p>
        )}
      </div>
      {/* Desligado aqui, mas marcado na hospedagem: o caminho de volta. */}
      {temEscolhaSalva && lateNaHospedagem && !late && (
        <div className="border-t bg-surface-muted px-4 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={mutacoes.late.isPending}
            onClick={() => { void gravar(null).then(() => setAberto(false)).catch(() => {}); }} data-testid="late-checkout-seguir-hospedagem">
            <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Voltar ao da hospedagem (marcado lá)
          </Button>
        </div>
      )}
    </PopoverContent>
  );

  const selo = late ? (
    <span className="esp-oc-late" data-testid="late-checkout-selo">
      <Clock className="h-3 w-3" aria-hidden="true" />late {late.valorCentavos === null ? "sem valor" : `+${brl(late.valorCentavos)}`}
    </span>
  ) : null;

  return (
    <div className="esp-oc-val" data-testid="valor-da-pessoa">
      <span className="esp-oc-rotulo text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Valor</span>
      {/* Linha 1: noites e valor (o valor fecha a coluna, alinhado com os dos outros). */}
      <span className="flex h-7 items-center gap-2">
        <span className="text-2xs tabular-nums text-muted-foreground">{noitesTxt(pessoa.noites)}</span>
        {!pessoa.completo && <span className="text-2xs font-medium text-warning" title="Há noite sem tarifa">parcial</span>}
        <span className={`text-sm font-semibold tabular-nums ${lancadoCentavos !== null ? "text-muted-foreground line-through decoration-1" : "text-foreground"}`}
          data-testid="valor-da-pessoa-total"
          title={lancadoCentavos !== null ? "Calculado — no custo do Espelho vale o total lançado na grade" : `A parte de ${nome} no quarto: a diária de cada noite dividida entre quem dorme nele${late ? ", mais o late check-out" : ""}`}>
          {brl(pessoa.totalCentavos)}
        </span>
      </span>
      {/* Linha 2: o late check-out (selo, ou "marcar" que aparece no hover/foco). */}
      <span className="flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-2xs leading-4 text-muted-foreground">
        {podeMarcar ? (
          <Popover open={aberto} onOpenChange={setAberto}>
            <PopoverTrigger asChild>
              {late ? (
                <button type="button" className="esp-alvo esp-oc-late-botao" aria-label={`Late check-out de ${nome}: ${late.valorCentavos === null ? "sem valor" : brl(late.valorCentavos)}. Editar`}>{selo}</button>
              ) : (
                <button type="button" data-testid="late-checkout-marcar"
                  className="esp-alvo esp-revela inline-flex h-5 items-center gap-1 rounded px-1 font-medium text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-brand-soft hover:text-primary focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/linha:opacity-100 group-focus-within/linha:opacity-100">
                  <Clock className="h-3 w-3" aria-hidden="true" />late check-out
                </button>
              )}
            </PopoverTrigger>
            {editorDoLate}
          </Popover>
        ) : selo}
      </span>
      {lancadoCentavos !== null && (
        <span className="mt-1 block text-2xs font-medium leading-4 text-info" data-testid="valor-lancado-na-grade"
          title="O total de hotel desta pessoa foi lançado à mão na grade — é ele que entra no custo do Espelho. Apague-o na grade para usar o calculado.">
          na grade: {brl(lancadoCentavos)}
        </span>
      )}
    </div>
  );
}
