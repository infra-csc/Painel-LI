import { useEffect } from "react";

export const APP_TITLE = "Logística Interna";
/** Sufixo da aba no padrão dos apps NORTE: "Página · Logística". */
export const APP_TITLE_CURTO = "Logística";

/**
 * Define `document.title` enquanto a página está montada.
 * Uso: `usePageTitle("Eventos")` → "Eventos · Logística".
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
