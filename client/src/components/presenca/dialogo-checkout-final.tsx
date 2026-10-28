/**
 * Check-out final (27/10) — o produtor (ou o DP) fecha a prestação e manda
 * para o DP. Ata de 22/10: "o produtor responsável faz o check-out final,
 * marca as divergências, o sistema recalcula o valor final, que o produtor
 * pode editar". Decisão do dono (26/10): produção ajusta até ±10% sobre o
 * calculado; DP e admin sem limite.
 *
 * O diálogo mostra a memória de cálculo do servidor, o valor calculado, o
 * campo do valor final com a faixa permitida (e o ajuste em % ao vivo), o
 * CNPJ (o confirmado pelo colaborador ou outro digitado) e a justificativa
 * quando o colaborador não confirmou. Os 409 do servidor viram explicação:
 * dias pendentes (listados), fora do limite (o intervalo em R$),
 * justificativa obrigatória.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCheck, Loader2, Lock, Send, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CnpjInput } from "@/components/ui/cnpj-input";
import { CurrencyInput } from "@/components/common/currency-input";
import { SeloContratoAtivo } from "@/components/contratos/pecas";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { cnpjValido } from "@shared/cnpj";
import { codigoDoErro, dentroDaFaixa, diaComSemana, listaDeDias, reais, seloDoCnpj, textoDoAjuste } from "./presenca-utils";
import type { PrestacaoDaPresenca } from "./tipos";
import type { useAcoesDaPresenca } from "./use-presenca";

export interface AlvoDoCheckout {
  prestacao: PrestacaoDaPresenca;
  nome: string;
}

export const JUSTIFICATIVA_MINIMA = 5;

type OrigemDoCnpj = "confirmado" | "outro";

export function DialogoCheckoutFinal({ alvo, hoje, checkoutFinal, onClose }: {
  alvo: AlvoDoCheckout | null;
  /** "Hoje" do servidor (Brasília): separa dia que passou sem registro de dia que ainda vem. */
  hoje: string;
  checkoutFinal: ReturnType<typeof useAcoesDaPresenca>["checkoutFinal"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const p = alvo?.prestacao;
  const [valor, setValor] = useState(0);
  const [origem, setOrigem] = useState<OrigemDoCnpj>("confirmado");
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; dias?: string[] } | null>(null);

  useEffect(() => {
    if (!alvo) return;
    const pr = alvo.prestacao;
    setValor(pr.calculo.valorCalculado ?? 0);
    setOrigem(pr.confirmacao?.cnpj ? "confirmado" : "outro");
    setCnpj(""); setRazao(""); setJustificativa(""); setTentou(false); setErro(null);
    // Só ao abrir para OUTRA prestação: a prestação viva (recarga a cada minuto,
    // ocorrência lançada) chega como objeto novo e não pode zerar o formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.prestacao.actualId]);

  if (!p || !alvo) return null;

  const calculado = p.calculo.valorCalculado ?? 0;
  const limite = p.limiteDoAjuste;
  const naFaixa = dentroDaFaixa(valor, limite);
  const pendentes = erro?.dias?.length ? erro.dias : p.diasPendentes;
  const semConfirmacao = !p.confirmacao;
  const justificativaOk = !semConfirmacao || justificativa.trim().length >= JUSTIFICATIVA_MINIMA;
  const cnpjDigitado = origem === "outro" && cnpj.replace(/\D/g, "").length > 0;
  const cnpjOk = !cnpjDigitado || cnpjValido(cnpj);
  const enviando = checkoutFinal.isPending;
  const bloqueado = pendentes.length > 0;
  const passados = pendentes.filter((d) => d < hoje);
  const futuros = pendentes.filter((d) => d > hoje);
  const fraseDoQueVem = [pendentes.includes(hoje) ? "hoje ainda não tem entrada" : null, futuros.length ? `ainda faltam ${listaDeDias(futuros)}` : null]
    .filter(Boolean).join(" e ").replace(/^./, (c) => c.toUpperCase());
  const pctLimite = limite?.pct ?? null;

  const enviar = () => {
    setTentou(true);
    if (bloqueado || !naFaixa || !justificativaOk || !cnpjOk) return;
    setErro(null);
    checkoutFinal.mutate({
      actualId: p.actualId,
      corpo: {
        valorFinal: valor,
        cnpj: cnpjDigitado ? cnpj : null,
        razaoSocial: cnpjDigitado ? razao.trim() || null : null,
        justificativa: semConfirmacao ? justificativa.trim() : null,
      },
    }, {
      onSuccess: () => {
        toast({ variant: "success", title: "Check-out final feito", description: `${alvo.nome} · ${reais(valor)} — enviado ao DP para a conferência.` });
        onClose();
      },
      onError: (e) => {
        const c = codigoDoErro(e);
        if (c.codigo === "dias_pendentes") setErro({ mensagem: apiErrorMessage(e, "Há dias sem presença."), dias: c.diasPendentes });
        else if (c.codigo === "fora_do_limite" && c.minimo != null && c.maximo != null) setErro({ mensagem: `O ajuste passa do seu limite: o valor final tem que ficar entre ${reais(c.minimo)} e ${reais(c.maximo)}. Acima disso, só o DP.` });
        else setErro({ mensagem: apiErrorMessage(e, "Não foi possível fazer o check-out final.") });
      },
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose(); }}>
      <DialogContent className="prs-dialogo max-w-[640px] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="prs-dialogo-checkout">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <Send className="h-4 w-4 text-primary" aria-hidden="true" />Check-out final
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            <span className="font-medium text-foreground">{alvo.nome}</span>
            {p.funcao.nome ? ` · ${p.funcao.nome}` : ""} · {p.calculo.diasPagos.length} {p.calculo.diasPagos.length === 1 ? "dia pago" : "dias pagos"}.
            {" "}Confere o valor, informa o CNPJ e envia ao DP — depois disso só o DP mexe.
          </DialogDescription>
        </DialogHeader>

        <div className="prs-dialogo-corpo space-y-5 px-6 py-5">
          {bloqueado && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-danger" data-testid="prs-checkout-pendentes">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 text-xs leading-5">
                <p className="m-0 font-semibold">Ainda não dá para fechar: {pendentes.length === 1 ? "1 dia sem presença" : `${pendentes.length} dias sem presença`}</p>
                {passados.length > 0 && <p className="m-0">Sem registro em {listaDeDias(passados)}: registre a falta ou corrija o horário.</p>}
                {fraseDoQueVem && <p className="m-0">{fraseDoQueVem} — o check-out final vem depois do último dia.</p>}
                <ul className="m-0 mt-1.5 flex flex-wrap gap-1.5 p-0 list-none">
                  {pendentes.map((d) => (
                    <li key={d} className="rounded-md bg-card/70 px-1.5 py-0.5 text-2xs font-medium tabular-nums">
                      {diaComSemana(d)} · {d < hoje ? "sem registro" : d === hoje ? "hoje" : "ainda não chegou"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── Memória de cálculo ── */}
          <section aria-labelledby="prs-memoria-titulo" className="space-y-2">
            <h3 id="prs-memoria-titulo" className="prs-legenda">Memória de cálculo</h3>
            <ol className="prs-memoria">
              {p.calculo.linhas.map((l, i) => (
                <li key={i} className={cn(i === p.calculo.linhas.length - 1 && "prs-memoria-total")}>{l}</li>
              ))}
            </ol>
          </section>

          {/* ── Valor final ── */}
          <section aria-labelledby="prs-valor-titulo" className="space-y-2">
            <h3 id="prs-valor-titulo" className="prs-legenda">Valor final</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 min-w-0">
                <p className="m-0 block text-xs font-medium leading-4 text-slate-600">Calculado</p>
                <p className="m-0 flex items-center h-11 px-3 rounded-lg bg-muted text-base font-semibold tabular-nums text-foreground" data-testid="prs-valor-calculado">{reais(calculado)}</p>
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="prs-valor-final" className="block text-xs font-medium leading-4 text-slate-600">Valor final (R$)</Label>
                <CurrencyInput id="prs-valor-final" value={valor} onChange={setValor}
                  className={cn("h-11 text-base font-semibold tabular-nums", !naFaixa && "border-danger focus-visible:ring-danger/30")}
                  aria-label="Valor final em reais" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-live="polite">
              {limite ? (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 text-slate-600">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Seu limite: ±{pctLimite?.toLocaleString("pt-BR")}% — de <span className="tabular-nums">{reais(limite.minimo)}</span> a <span className="tabular-nums">{reais(limite.maximo)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-600"><Unlock className="w-3.5 h-3.5" aria-hidden="true" />DP: sem limite de ajuste</span>
              )}
              <span className={cn("tabular-nums", valor === calculado ? "text-muted-foreground" : naFaixa ? "font-medium text-warning" : "font-medium text-danger")} data-testid="prs-ajuste">
                Ajuste: {textoDoAjuste(calculado, valor)}
              </span>
              {valor !== calculado && (
                <button type="button" onClick={() => setValor(calculado)} className="text-xs font-medium text-primary hover:underline">Usar o calculado</button>
              )}
            </div>
            {!naFaixa && limite && (
              <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="prs-fora-do-limite">
                Fora do seu limite: o valor final tem que ficar entre {reais(limite.minimo)} e {reais(limite.maximo)}. Um ajuste maior, só o DP faz.
              </p>
            )}
          </section>

          {/* ── CNPJ ── */}
          <section aria-labelledby="prs-cnpj-titulo" className="space-y-2">
            <h3 id="prs-cnpj-titulo" className="prs-legenda">CNPJ que emite a nota</h3>
            <div role="radiogroup" aria-labelledby="prs-cnpj-titulo" className="space-y-2">
              {p.confirmacao?.cnpj && (
                <label className={cn("prs-opcao", origem === "confirmado" && "prs-opcao-on")}>
                  <input type="radio" name="prs-cnpj-origem" checked={origem === "confirmado"} onChange={() => setOrigem("confirmado")} className="mt-0.5 accent-[var(--primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                      <span className="tabular-nums">{p.confirmacao.cnpj}</span>
                      {p.cnpj.origem === "confirmacao" && <SeloContratoAtivo situacao={seloDoCnpj(p.cnpj.situacao)} mostrarQuandoAtivo />}
                      {p.cnpj.origem === "confirmacao" && p.cnpj.situacao !== "contrato_ativo" && <span className="text-2xs font-normal text-muted-foreground">{p.cnpj.rotulo}</span>}
                    </span>
                    <span className="block text-2xs text-muted-foreground">{p.confirmacao.razaoSocial ? `${p.confirmacao.razaoSocial} · ` : ""}confirmado {p.confirmacao.por === "representante" ? "pelo representante" : "pelo colaborador"}</span>
                  </span>
                </label>
              )}
              <label className={cn("prs-opcao", origem === "outro" && "prs-opcao-on")}>
                <input type="radio" name="prs-cnpj-origem" checked={origem === "outro"} onChange={() => setOrigem("outro")} className="mt-0.5 accent-[var(--primary)]" />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{p.confirmacao?.cnpj ? "Informar outro CNPJ" : "Informar o CNPJ"}</span>
              </label>
            </div>
            {origem === "outro" && (
              <div className="grid gap-3 sm:grid-cols-[200px_1fr] pl-1">
                <div className="space-y-1.5">
                  <Label htmlFor="prs-ck-cnpj" className="sr-only">CNPJ</Label>
                  <CnpjInput id="prs-ck-cnpj" value={cnpj} onChange={setCnpj} className="tabular-nums" aria-invalid={tentou && !cnpjOk} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prs-ck-razao" className="sr-only">Razão social</Label>
                  <Input id="prs-ck-razao" value={razao} onChange={(e) => setRazao(e.target.value)} maxLength={200} placeholder="Razão social (opcional)" className="h-10 rounded-lg" />
                </div>
                {tentou && !cnpjOk && <p role="alert" className="m-0 sm:col-span-2 text-xs font-medium text-danger">CNPJ inválido — confira os 14 dígitos.</p>}
                {!cnpjDigitado && <p className="m-0 sm:col-span-2 text-2xs text-muted-foreground">Sem CNPJ, a prestação vai assim mesmo e o DP vê "CNPJ não informado".</p>}
              </div>
            )}
          </section>

          {/* ── Confirmação do colaborador ── */}
          {semConfirmacao ? (
            <section aria-labelledby="prs-just-titulo" className="space-y-1.5">
              <h3 id="prs-just-titulo" className="prs-legenda">Sem a confirmação do colaborador</h3>
              <Label htmlFor="prs-ck-justificativa" className="text-xs font-normal text-slate-600">O colaborador ainda não confirmou os dias. Escreva por que enviar assim mesmo — fica nas observações da prestação.</Label>
              <Textarea id="prs-ck-justificativa" rows={2} maxLength={2000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                className={cn("rounded-lg text-sm", tentou && !justificativaOk && "border-danger")} aria-invalid={tentou && !justificativaOk}
                placeholder="Ex.: sem celular no evento; dias conferidos com o líder da equipe." data-testid="prs-ck-justificativa" />
              {tentou && !justificativaOk && <p role="alert" className="m-0 text-xs font-medium text-danger">Escreva a justificativa (pelo menos {JUSTIFICATIVA_MINIMA} caracteres).</p>}
            </section>
          ) : (
            <p className="m-0 flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft/60 px-3 py-2 text-xs text-success">
              <CheckCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Confirmado {p.confirmacao!.por === "representante" ? "pelo representante" : "pelo colaborador"}: {p.confirmacao!.dias.length} {p.confirmacao!.dias.length === 1 ? "dia" : "dias"}.
              {p.confirmacao!.contestacao ? " Tem contestação — leia antes de enviar." : ""}
            </p>
          )}
          {p.confirmacao?.contestacao && (
            <blockquote className="m-0 rounded-lg border-l-[3px] border-warning-strong bg-warning-soft/50 px-3 py-2 text-xs italic text-slate-700">“{p.confirmacao.contestacao}”</blockquote>
          )}

          {erro && !erro.dias?.length && <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="prs-checkout-erro">{erro.mensagem}</p>}
        </div>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={enviar} disabled={enviando || bloqueado || !naFaixa}
            title={bloqueado ? "Há dias sem presença" : !naFaixa ? "O valor final está fora do seu limite" : undefined} data-testid="prs-enviar-checkout">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {enviando ? "Enviando…" : `Enviar ao DP · ${reais(valor)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
