/**
 * FAIXA DE AVISO DO SISTEMA (âmbar, dispensável) — só a casca.
 *
 * NÃO HÁ FONTE DE DADOS para isto hoje (nenhuma rota /api devolve avisos de
 * manutenção), então ela nasce DESLIGADA: `SYSTEM_NOTICE = null`.
 *
 * COMO LIGAR (aviso fixo, digitado à mão):
 *   export const SYSTEM_NOTICE: SystemNotice | null = {
 *     id: "manutencao-2026-09-01",           // troque o id a cada aviso novo:
 *     title: "Manutenção programada",        // é ele que faz a faixa reaparecer
 *     text: "hoje às 22h o painel fica indisponível por cerca de 20 minutos.",
 *   };
 * Quem dispensa não vê mais AQUELE id (localStorage). Quando existir endpoint,
 * troque a constante por uma consulta e mantenha o resto igual.
 */
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

export interface SystemNotice {
  id: string;
  title: string;
  text: string;
}

export const SYSTEM_NOTICE: SystemNotice | null = null;

const DISMISSED_KEY = "shell:notice-dismissed";

export default function SystemNoticeBar() {
  const notice = SYSTEM_NOTICE;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!notice) return;
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === notice.id);
    } catch {
      setDismissed(false);
    }
  }, [notice]);

  if (!notice || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, notice.id); } catch { /* modo privado */ }
  };

  return (
    <div role="status" className="casca-surgir flex items-start sm:items-center gap-3 px-4 lg:px-5 py-2.5 bg-warning-soft border-b border-warning/20 text-[13px] text-warning">
      <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-md bg-warning/10">
        <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="m-0 flex-1 min-w-0 leading-snug pt-0.5 sm:pt-0">
        <span className="font-semibold">{notice.title}</span>
        <span className="text-warning/90"> — {notice.text}</span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar aviso"
        className="inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-md border-0 bg-transparent text-warning cursor-pointer transition-colors hover:bg-warning/10 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
