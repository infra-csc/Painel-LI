import { useEffect } from "react";

export const APP_TITLE = "Logística Interna";

/**
 * Define `document.title` enquanto a página está montada.
 * Uso: `usePageTitle("Eventos")` → "Eventos — Logística Interna".
 * Passe `withSuffix=false` se já quiser o título completo.
 */
export function usePageTitle(title: string, withSuffix = true) {
  useEffect(() => {
    const prev = document.title;
    document.title = withSuffix && !title.includes(APP_TITLE)
      ? `${title} — ${APP_TITLE}`
      : title;
    return () => {
      document.title = prev;
    };
  }, [title, withSuffix]);
}

export default usePageTitle;
