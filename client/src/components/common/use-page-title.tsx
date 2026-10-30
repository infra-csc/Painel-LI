import { useEffect } from "react";

/** Marca do app desde 30/10 (antes "Logística Interna"); assinatura "Operação de Eventos". */
export const APP_TITLE = "Trupp";
/** Sufixo da aba no padrão dos apps NORTE: "Página · Trupp". */
export const APP_TITLE_CURTO = "Trupp";

/**
 * Define `document.title` enquanto a página está montada.
 * Uso: `usePageTitle("Eventos")` → "Eventos · Trupp".
 * Passe `withSuffix=false` se já quiser o título completo.
 */
export function usePageTitle(title: string, withSuffix = true) {
  useEffect(() => {
    const prev = document.title;
    document.title = withSuffix && !title.includes(APP_TITLE_CURTO)
      ? `${title} · ${APP_TITLE_CURTO}`
      : title;
    return () => {
      document.title = prev;
    };
  }, [title, withSuffix]);
}

export default usePageTitle;
