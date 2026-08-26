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
import { MI } from "./mi";

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
    <div role="status" className="flex flex-wrap items-center gap-2.5 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
      <MI name="campaign" size={16} className="text-amber-600" />
      <span><span className="font-semibold">{notice.title}</span> — {notice.text}</span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar aviso"
        className="inline-flex items-center justify-center w-6 h-6 rounded-md border-0 bg-transparent text-amber-700 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MI name="close" size={15} />
      </button>
    </div>
  );
}
