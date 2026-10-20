/**
 * Valores DENTRO de cada quarto da aba Quartos (20/10):
 *  - `ValoresDoQuarto`: o rodapé do bloco — a conta das noites ("1 noite
 *    Individual · 1 × R$ 180,00"), o total do quarto, a diária própria (com
 *    "voltar ao padrão") e o valor pago ao hotel por este quarto, opcional,
 *    com a diferença;
 *  - `ValorDaPessoa`: o valor de cada ocupante na linha dele e o late
 *    check-out (marcar, valor sugerido igual à diária, editar, tirar).
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
import type { CustoDaPessoaNoQuarto, CustoDoQuarto } from "@shared/custo-dos-quartos";
import { LIMITE_DA_DIARIA_CENTAVOS, LIMITE_DO_VALOR_PAGO_CENTAVOS, rotuloDoApartamento } from "@shared/custo-dos-quartos";
import { CampoDeDinheiro, COR_DO_APARTAMENTO, leituraDaDiferenca, type ValoresDoHotelMutacoes } from "./valores-do-hotel";
import { brl } from "./mirror-shared";

const noitesTxt = (n: number) => `${n} ${n === 1 ? "noite" : "noites"}`;

/** Rodapé de valores de um quarto. */
export function ValoresDoQuarto({ quarto, canEdit, mutacoes }: {
  quarto: CustoDoQuarto;
  canEdit: boolean;
  mutacoes: ValoresDoHotelMutacoes;
}) {
  const [editandoDiaria, setEditandoDiaria] = useState(false);
  const salvar = (campos: { diariaPropriaCentavos?: number | null; valorPagoCentavos?: number | null }) =>
    mutacoes.quarto.mutateAsync({ id: quarto.id, campos });
  const dif = quarto.diferencaCentavos === null ? null
    : leituraDaDiferenca(quarto.diferencaCentavos, quarto.totalCentavos > 0 ? quarto.diferencaCentavos / quarto.totalCentavos : null);

  // A conta, trecho a trecho: "2 noites · Duplo · 2 × R$ 138,00".
  const conta = (
    <ul className="esp-qv-conta" aria-label="Conta das noites" data-testid={`quarto-conta-${quarto.id}`}>
      {quarto.trechos.map((t) => (
        <li key={t.de} className="esp-qv-trecho" data-sem-tarifa={t.tarifaCentavos === null || undefined}>
          <i className="esp-trecho-ponto" style={{ background: COR_DO_APARTAMENTO[t.tipo] }} aria-hidden="true" />
          <span className="tabular-nums text-muted-foreground">{noitesTxt(t.noites)}</span>
          <span className="font-medium text-foreground">{rotuloDoApartamento(t.tipo)}</span>
          {t.tarifaCentavos === null ? (
            <span className="font-medium text-warning">sem tarifa</span>
          ) : (
            <span className="tabular-nums text-muted-foreground">
              {t.pessoas} × {brl(t.tarifaCentavos)}
              {quarto.trechos.length > 1 && <span className="text-foreground"> = {brl(t.totalCentavos)}</span>}
            </span>
          )}
          {t.acimaDoTriplo && (
            <span className="inline-flex items-center gap-1 font-medium text-warning" title="O máximo é 3 por quarto — usei a tarifa do Triplo">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />{t.pessoas} pessoas
            </span>
          )}
        </li>
      ))}
      {quarto.lateCheckoutCentavos > 0 && (
        <li className="esp-qv-trecho">
          <Clock className="h-3 w-3 text-warning-strong" aria-hidden="true" />
          <span className="text-muted-foreground">late check-out</span>
          <span className="tabular-nums text-foreground">{brl(quarto.lateCheckoutCentavos)}</span>
        </li>
      )}
    </ul>
  );

  // Diária própria: "tarifa do evento" com o lápis; própria = valor + "voltar ao padrão".
  const diaria = canEdit ? (
    quarto.usaDiariaPropria || editandoDiaria ? (
      <span className="esp-qv-campo" data-testid={`quarto-diaria-${quarto.id}`}>
        <span className="esp-qv-rotulo">Diária deste quarto</span>
        <CampoDeDinheiro valor={quarto.diariaPropriaCentavos} rotulo="Diária própria deste quarto, por pessoa por noite" limite={LIMITE_DA_DIARIA_CENTAVOS}
          autoFocus={editandoDiaria && !quarto.usaDiariaPropria} testid={`quarto-diaria-campo-${quarto.id}`} placeholder="por pessoa"
          aoSalvar={(v) => salvar({ diariaPropriaCentavos: v })} aoTerminar={() => setEditandoDiaria(false)} />
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
    <span className="esp-qv-campo"><span className="esp-qv-rotulo">Diária deste quarto</span><span className="tabular-nums text-foreground">{brl(quarto.diariaPropriaCentavos)}</span></span>
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
      <div className="esp-qv-linha">
        {conta}
        <span className="esp-qv-total">
          <span className="esp-qv-rotulo">{quarto.usaDiariaPropria ? "Total · diária própria" : "Total do quarto"}</span>
          <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`quarto-total-${quarto.id}`}>{brl(quarto.totalCentavos)}</span>
          {!quarto.completo && <span className="text-2xs font-medium text-warning">parcial · {noitesTxt(quarto.noitesSemTarifa)} sem tarifa</span>}
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
  const sugestao = pessoa.ultimaDiariaCentavos;
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
                : late.sugerido ? `Igual à diária da última noite (${brl(sugestao)}). Escreva outro valor se o hotel cobrar diferente.` : `A diária da última noite é ${brl(sugestao)} — apague para voltar a ela.`}
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
          title={lancadoCentavos !== null ? "Calculado — no custo do Espelho vale o total lançado na grade" : undefined}>
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
