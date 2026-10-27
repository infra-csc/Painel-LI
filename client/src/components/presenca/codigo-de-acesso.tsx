/**
 * Código de primeiro acesso ao portal do colaborador (27/10) — DP, admin e
 * produção. Seis dígitos, válidos por 72 h: com o CPF e o código, a pessoa
 * cria (ou troca) a senha em /colaborador. Serve também para "esqueci a
 * senha" e destrava quem foi bloqueado por tentativas.
 *
 * O código aparece UMA vez (o servidor guarda só o hash): o diálogo mostra o
 * número grande, a validade, "Copiar código" e o texto pronto para o
 * WhatsApp. Fechou, sumiu — gerar de novo invalida o anterior.
 *
 * Usado na Presença no evento e na ficha do colaborador (Colaboradores).
 */
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, MessageCircle, RotateCw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { codigoEmGrupos, dataHoraBr, mensagemDoCodigo } from "./presenca-utils";
import { useGerarCodigoDeAcesso } from "./use-presenca";
import { VALIDADE_DO_CODIGO_HORAS } from "@shared/presenca";

export interface AlvoDoCodigo {
  collaboratorId: string;
  nome: string;
  /** O que já se sabe do acesso (a Presença manda; a ficha do colaborador não sabe). */
  temSenha?: boolean;
  codigoValidoAte?: string | null;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sem permissão de área de transferência (http, navegador antigo): seleção manual.
    try {
      const t = document.createElement("textarea");
      t.value = texto; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(t);
      return ok;
    } catch {
      return false;
    }
  }
}

function BotaoCopiar({ texto, rotulo, icone: Icone, testid, principal }: { texto: string; rotulo: string; icone: typeof Copy; testid: string; principal?: boolean }) {
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  useEffect(() => { if (!copiado) return; const t = setTimeout(() => setCopiado(null), 2200); return () => clearTimeout(t); }, [copiado]);
  return (
    <Button type="button" variant={principal ? "default" : "outline"} onClick={async () => setCopiado((await copiar(texto)) ? "sim" : "falhou")} data-testid={testid}
      className={cn("rounded-lg gap-1.5", copiado === "sim" && !principal && "border-success/40 text-success")} aria-live="polite">
      {copiado === "sim" ? <Check className="w-4 h-4" aria-hidden="true" /> : <Icone className="w-4 h-4" aria-hidden="true" />}
      {copiado === "sim" ? "Copiado" : copiado === "falhou" ? "Selecione e copie" : rotulo}
    </Button>
  );
}

export function DialogoCodigoDeAcesso({ alvo, onClose }: { alvo: AlvoDoCodigo | null; onClose: () => void }) {
  const gerar = useGerarCodigoDeAcesso();
  const aberto = !!alvo;
  // Ao abrir para outra pessoa, o resultado anterior some.
  const { reset } = gerar;
  const idDoAlvo = alvo?.collaboratorId;
  useEffect(() => { if (idDoAlvo) reset(); }, [idDoAlvo, reset]);
  const r = gerar.data;
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  const mensagem = r ? mensagemDoCodigo(r.codigo, r.validoAte, origem) : "";

  const fechar = () => { if (!gerar.isPending) { gerar.reset(); onClose(); } };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="prs-dialogo max-w-[480px] gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()} data-testid="prs-dialogo-codigo">
        <DialogHeader className="space-y-1 border-b border-border px-6 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />Código de acesso ao portal
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            {alvo && <><span className="font-medium text-foreground">{alvo.nome}</span> · app de honorários do colaborador (/colaborador)</>}
          </DialogDescription>
        </DialogHeader>

        <div className="prs-dialogo-corpo px-6 py-5">
          {!r ? (
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p className="m-0">
                Gera um código de <strong>6 dígitos</strong>, válido por <strong>{VALIDADE_DO_CODIGO_HORAS} horas</strong>. Com o CPF e o código, a pessoa
                {alvo?.temSenha ? " troca a senha (serve para quem esqueceu)" : " cria a senha e entra no app"}.
              </p>
              <ul className="m-0 space-y-1.5 pl-0 list-none text-xs text-slate-600">
                <li className="flex gap-2"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />O código aparece uma vez só, nesta janela. Mande para a pessoa antes de fechar.</li>
                <li className="flex gap-2"><RotateCw className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {alvo?.codigoValidoAte ? `Já existe um código válido até ${dataHoraBr(alvo.codigoValidoAte)} — gerar outro cancela aquele.` : "Gerar outro depois cancela este."}
                </li>
                {alvo?.temSenha && <li className="flex gap-2"><KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />A pessoa já tem senha: a senha atual continua valendo até ela usar o código.</li>}
              </ul>
              {gerar.isError && (
                <p role="alert" className="m-0 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="prs-codigo-erro">
                  {apiErrorMessage(gerar.error, "Não foi possível gerar o código.")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 prs-entra">
              <div className="rounded-xl border border-primary/25 bg-brand-soft px-4 py-4 text-center">
                <p className="m-0 text-2xs font-semibold uppercase tracking-[0.08em] text-primary">Código</p>
                <p className="m-0 mt-1 font-mono text-[34px] font-semibold leading-10 tracking-[0.12em] text-foreground tabular-nums select-all" data-testid="prs-codigo-gerado">
                  {codigoEmGrupos(r.codigo)}
                </p>
                <p className="m-0 mt-1 text-xs text-slate-600">
                  vale até <span className="font-medium tabular-nums text-foreground">{dataHoraBr(r.validoAte)}</span> · CPF <span className="tabular-nums">{r.colaborador.cpf}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-slate-600"><MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />Mensagem pronta para o WhatsApp</p>
                <p className="m-0 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm leading-6 text-foreground select-all" data-testid="prs-codigo-mensagem">{mensagem}</p>
              </div>
              <p className="m-0 text-2xs text-muted-foreground">Ao fechar esta janela o código não aparece mais.</p>
            </div>
          )}
        </div>

        <DialogFooter className="prs-rodape gap-2 border-t border-border bg-surface-muted/60 px-6 py-3 sm:gap-2">
          {!r ? (
            <>
              <Button type="button" variant="outline" onClick={fechar} disabled={gerar.isPending}>Cancelar</Button>
              <Button type="button" onClick={() => alvo && gerar.mutate(alvo.collaboratorId)} disabled={gerar.isPending} data-testid="prs-gerar-codigo">
                {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                {gerar.isPending ? "Gerando…" : gerar.isError ? "Tentar de novo" : "Gerar código"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={fechar} className="sm:mr-auto">Fechar</Button>
              <BotaoCopiar texto={r.codigo} rotulo="Copiar código" icone={Copy} testid="prs-copiar-codigo" />
              <BotaoCopiar texto={mensagem} rotulo="Copiar mensagem" icone={MessageCircle} testid="prs-copiar-mensagem" principal />
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão + diálogo, para quem só precisa do atalho (ficha do colaborador). */
export function BotaoGerarCodigo({ alvo, className }: { alvo: AlvoDoCodigo; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)} className={cn("h-9 rounded-lg px-3 text-sm font-medium gap-1.5", className)} data-testid="col-ficha-codigo">
        <KeyRound className="w-4 h-4" aria-hidden="true" />Gerar código de acesso
      </Button>
      <DialogoCodigoDeAcesso alvo={aberto ? alvo : null} onClose={() => setAberto(false)} />
    </>
  );
}
