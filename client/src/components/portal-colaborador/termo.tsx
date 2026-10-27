/**
 * Termo de uso da imagem e da localização (LGPD). Aparece no primeiro acesso
 * e sempre que o DP publicar uma versão nova. Sem aceitar, não há check-in
 * nem confirmação (o servidor responde 409 "termo_pendente").
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, FileCheck2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isApiError } from "@/lib/queryClient";
import { aceitarTermo, CHAVE_EU, mensagemDoErro } from "./api";
import { Aviso, BotaoPrincipal } from "./pecas";
import type { EuDoPortal } from "./tipos";

export function TelaDoTermo({ eu }: { eu: EuDoPortal }) {
  const queryClient = useQueryClient();
  const ids = { texto: useId(), caixa: useId(), dica: useId() };
  const caixaRef = useRef<HTMLDivElement>(null);
  const [leuAteOFim, setLeuAteOFim] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const versaoNova = !!eu.termo.versaoAceita && eu.termo.versaoAceita !== eu.termo.versao;
  const liberado = leuAteOFim || marcado;

  const conferirRolagem = useCallback(() => {
    const el = caixaRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) setLeuAteOFim(true);
  }, []);

  // Texto curto que cabe inteiro na caixa já conta como lido.
  useEffect(() => { conferirRolagem(); }, [conferirRolagem, eu.termo.texto]);

  async function aceitar() {
    setEnviando(true);
    setErro(null);
    try {
      const atualizado = await aceitarTermo(eu.termo.versao);
      queryClient.setQueryData(CHAVE_EU, atualizado);
    } catch (falha) {
      if (isApiError(falha) && falha.status === 409) {
        // O DP trocou o termo enquanto a pessoa lia: carrega a versão nova.
        setErro(mensagemDoErro(falha));
        setLeuAteOFim(false);
        setMarcado(false);
        await queryClient.invalidateQueries({ queryKey: CHAVE_EU });
      } else {
        setErro(mensagemDoErro(falha, "Não foi possível registrar o aceite. Tente de novo."));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <p className="m-0 text-sm font-medium text-muted-foreground">Olá, {eu.colaborador.primeiroNome}</p>
      <h1 className="m-0 mt-1 text-2xl font-bold leading-tight tracking-tight">
        {versaoNova ? "O termo mudou" : "Antes de começar"}
      </h1>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {versaoNova
          ? "Leia a versão nova sobre o uso da sua foto e da sua localização e aceite para continuar."
          : "Leia como usamos a sua foto e a sua localização nos check-ins. Sem o aceite, não dá para registrar presença."}
      </p>

      <div className="relative mt-5">
        <div
          ref={caixaRef}
          id={ids.texto}
          role="region"
          aria-label="Texto do termo"
          tabIndex={0}
          onScroll={conferirRolagem}
          className="max-h-[46dvh] min-h-[180px] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card px-4 py-4 text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-h-[380px]"
        >
          {eu.termo.texto}
        </div>
        {!leuAteOFim && (
          <div className="pointer-events-none absolute inset-x-px bottom-px flex h-14 items-end justify-center rounded-b-xl bg-gradient-to-t from-card via-card/90 to-transparent pb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-medium text-background">
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> Role até o fim
            </span>
          </div>
        )}
      </div>
      <p className="m-0 mt-2 text-xs text-muted-foreground">Versão {eu.termo.versao}</p>

      <label htmlFor={ids.caixa} className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:bg-muted/60">
        <Checkbox id={ids.caixa} checked={marcado} onCheckedChange={(v) => setMarcado(v === true)} className="h-5 w-5 rounded-[5px]" />
        <span className="text-[15px] font-medium leading-snug">Li o termo e concordo com o uso da minha foto e da minha localização.</span>
      </label>

      {erro && <Aviso role="alert" tom="erro" className="mt-4">{erro}</Aviso>}

      <BotaoPrincipal
        type="button"
        className="mt-5"
        onClick={aceitar}
        disabled={!liberado}
        carregando={enviando}
        textoCarregando="Registrando…"
        icone={FileCheck2}
        aria-describedby={!liberado ? ids.dica : undefined}
      >
        Li e aceito
      </BotaoPrincipal>
      {!liberado && (
        <p id={ids.dica} className="m-0 mt-2 text-center text-[13px] text-muted-foreground">
          Role o texto até o fim ou marque a caixa acima.
        </p>
      )}
    </div>
  );
}
