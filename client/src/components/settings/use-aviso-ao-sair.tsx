// Valores padrão — aviso ao sair com alterações não salvas (08/10).
//
// Dois caminhos de saída:
//  - fechar/recarregar a aba ou digitar outro endereço: `beforeunload` (o
//    navegador mostra o aviso padrão dele — o texto não é customizável);
//  - link interno do app (menu lateral, atalhos): o clique num <a> do mesmo
//    site é interceptado na captura, ANTES do <Link> do wouter, e abre o
//    "Sair sem salvar?". Confirmando, navega pelo próprio wouter.
// Clique com Ctrl/⌘/Shift/botão do meio (nova aba/janela), link com `target`
// ou `download` e âncora da mesma página passam direto. O "voltar" do
// navegador não é interceptado (o wouter não oferece bloqueio de histórico).
import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

/** Destino interno do clique (caminho + busca), ou null quando o clique deve seguir normal. */
export function destinoInterno(e: MouseEvent, origem: string, caminhoAtual: string): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const alvo = e.target as Element | null;
  const link = alvo?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  let url: URL;
  try { url = new URL(link.href, origem); } catch { return null; }
  if (url.origin !== origem) return null;
  if (url.pathname === caminhoAtual) return null; // mesma tela (âncora/consulta)
  return url.pathname + url.search;
}

export function useAvisoAoSair(sujo: boolean) {
  const [location, navegar] = useLocation();
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Navegadores antigos só mostram o aviso com returnValue preenchido.
      e.returnValue = "";
    };
    const aoClicar = (e: MouseEvent) => {
      const para = destinoInterno(e, window.location.origin, location);
      if (!para) return;
      e.preventDefault();
      e.stopPropagation();
      setDestino(para);
    };
    window.addEventListener("beforeunload", aoSair);
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo, location]);

  const sair = useCallback(() => {
    const para = destino;
    setDestino(null);
    if (para) navegar(para);
  }, [destino, navegar]);

  const Dialogo = (
    <ConfirmDialog
      open={destino !== null}
      onOpenChange={o => { if (!o) setDestino(null); }}
      tone="danger"
      icon={LogOut}
      title="Sair sem salvar?"
      description="As alterações não salvas dos valores padrão serão perdidas."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      onConfirm={sair}
      testId="cfg-confirmar-saida"
      confirmTestId="cfg-confirmar-saida-sim"
      className="max-w-[420px]"
    />
  );

  return { Dialogo } as const;
}
