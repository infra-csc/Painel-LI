// Extraído de system-settings.tsx em 25/09 (modularização): histórico local
// (localStorage) e "salvo em" da tela Valores padrão. Isolado para que o
// orquestrador do formulário só precise de `history`/`setHistory` e do
// `lastSaved`, sem conhecer as chaves de armazenamento.
import { useEffect, useState } from "react";
import { HISTORY_KEY, LAST_SAVED_KEY, type HistoryEntry } from "./settings-utils";

export interface LastSavedInfo {
  timestamp: string;
  user: string;
}

export function useSettingsHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastSaved, setLastSaved] = useState<LastSavedInfo | null>(null);

  useEffect(() => {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
      const ls = localStorage.getItem(LAST_SAVED_KEY);
      if (ls) setLastSaved(JSON.parse(ls));
    } catch {}
  }, []);

  return { history, setHistory, lastSaved, setLastSaved };
}

export type SettingsHistoryState = ReturnType<typeof useSettingsHistory>;
