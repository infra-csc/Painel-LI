/**
 * Painéis (30/10) — a última visita à Atividade recente, POR USUÁRIO, no
 * localStorage (máquina compartilhada não mistura o "novo" de um com o de
 * outro). Serve só ao destaque "novo desde a sua última visita": perder o
 * valor (aba anônima, armazenamento bloqueado) só faz tudo parecer novo.
 */
import { useCallback, useEffect, useState } from "react";

export const chaveDaUltimaVisita = (userId?: string | null) => `paineis:atividade:ultima-visita:${userId || "anonimo"}`;

export function lerUltimaVisita(userId?: string | null): string | null {
  try {
    const v = window.localStorage.getItem(chaveDaUltimaVisita(userId));
    return v && !Number.isNaN(new Date(v).getTime()) ? v : null;
  } catch {
    return null;
  }
}

export function gravarUltimaVisita(userId: string | null | undefined, iso: string): void {
  try {
    window.localStorage.setItem(chaveDaUltimaVisita(userId), iso);
  } catch {
    /* armazenamento bloqueado: o destaque só não persiste */
  }
}

/**
 * A marca da visita ANTERIOR fica fixa enquanto a pessoa está na tela (o que
 * era novo continua destacado até ela sair); ao sair — desmontar, fechar ou
 * esconder a aba — grava o agora. "Marcar tudo como visto" grava na hora.
 */
export function useUltimaVisita(userId: string | null | undefined) {
  const [marca, setMarca] = useState<string | null>(() => lerUltimaVisita(userId));

  useEffect(() => {
    const sair = () => gravarUltimaVisita(userId, new Date().toISOString());
    const aoEsconder = () => { if (document.visibilityState === "hidden") sair(); };
    window.addEventListener("beforeunload", sair);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("beforeunload", sair);
      document.removeEventListener("visibilitychange", aoEsconder);
      sair();
    };
  }, [userId]);

  const marcarTudoComoVisto = useCallback(() => {
    const agora = new Date().toISOString();
    gravarUltimaVisita(userId, agora);
    setMarca(agora);
  }, [userId]);

  return { ultimaVisita: marca, marcarTudoComoVisto };
}
