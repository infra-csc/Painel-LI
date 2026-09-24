/**
 * ESTADOS DE CONSULTA — carregando / erro / vazio / conteúdo em UM lugar.
 *
 * Criado em 23/09 (code review, Fase 1): seis telas do Financeiro tinham
 * dezenas de `useQuery` e NENHUM tratamento de erro — uma falha de rede virava
 * "Todos os itens estão em dia", "Nenhuma prestação disponível" ou uma tabela
 * desenhada com `undefined`. Regra desta casa: falha de rede NUNCA vira estado
 * vazio. Aqui o erro tem `role="alert"`, mensagem real do servidor
 * (`apiErrorMessage`) e botão "Tentar de novo" que refaz só o que falhou.
 *
 * Uso típico:
 *   <QueryState queries={[qEventos, qFuncoes]} isEmpty={itens.length === 0}
 *               empty={<EmptyState title="Nenhum item" />}>
 *     {...conteúdo...}
 *   </QueryState>
 *
 * `useQueriesState` serve quando a tela precisa só das flags (ex.: manter o
 * cabeçalho e trocar apenas o miolo).
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { useIsFetching, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiErrorMessage } from "@/lib/api-error";
import { ErrorState } from "./error-state";
import { LoadingState } from "./loading-state";

/** O mínimo que precisamos de um resultado de `useQuery` (qualquer tipo de dado). */
export interface QueryLike {
  isPending?: boolean;
  isLoading?: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
}

export interface QueriesState {
  /** Alguma consulta ainda sem dado e buscando (primeira carga). */
  isLoading: boolean;
  /** Alguma consulta falhou. */
  isError: boolean;
  /** Primeiro erro encontrado (para a mensagem). */
  error: unknown;
  /** Refaz SÓ as consultas que falharam. */
  retry: () => void;
}

const RETRY_LABEL = "Tentar de novo";
const DEFAULT_ERROR_TITLE = "Não foi possível carregar os dados";
const DEFAULT_ERROR_FALLBACK = "Verifique sua conexão e tente de novo. Nada do que você fez foi perdido.";

/** Consolida várias consultas em uma só leitura de carregando/erro. */
export function useQueriesState(queries: QueryLike[]): QueriesState {
  // `isPending && !isError` cobre consultas desabilitadas? Não: uma consulta
  // com `enabled: false` fica `isPending` para sempre sem buscar — por isso
  // olhamos `isLoading` (pending + fetching), que o v5 já expõe.
  const isLoading = queries.some((q) => q.isLoading === true);
  const isError = queries.some((q) => q.isError);
  const error = queries.find((q) => q.isError)?.error;
  const retry = useCallback(() => {
    for (const q of queries) if (q.isError) void q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lista nova a cada render; o conteúdo é o que importa
  }, [queries.map((q) => q.isError).join(","), queries.length]);
  return { isLoading, isError, error, retry };
}

export interface QueryErrorProps {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  /** Texto quando o servidor não mandou mensagem. */
  fallback?: string;
  className?: string;
}

/** Bloco de erro com a mensagem real da API e "Tentar de novo". `role="alert"` vem do ErrorState. */
export function QueryError({ error, onRetry, title = DEFAULT_ERROR_TITLE, fallback = DEFAULT_ERROR_FALLBACK, className }: QueryErrorProps) {
  return (
    <ErrorState
      title={title}
      description={apiErrorMessage(error, fallback)}
      onRetry={onRetry}
      retryLabel={RETRY_LABEL}
      className={className}
    />
  );
}

export interface QueryStateProps {
  /** Uma consulta… */
  query?: QueryLike;
  /** …ou várias (todas precisam estar prontas). */
  queries?: QueryLike[];
  /** O que mostrar enquanto carrega. Padrão: skeleton de linhas. */
  loading?: ReactNode;
  /** Quantidade de linhas do skeleton padrão. */
  loadingCount?: number;
  /** Quando `true` (e sem erro/carregando), mostra `empty` em vez do conteúdo. */
  isEmpty?: boolean;
  empty?: ReactNode;
  /** Título do bloco de erro. */
  errorTitle?: string;
  children?: ReactNode | (() => ReactNode);
}

/**
 * Decide o que renderizar na ordem certa: erro > carregando > vazio > conteúdo.
 * Erro vem ANTES de carregando de propósito: um refetch em andamento depois de
 * uma falha não pode esconder o aviso e voltar ao skeleton sem explicação.
 */
export function QueryState({ query, queries, loading, loadingCount = 5, isEmpty = false, empty, errorTitle, children }: QueryStateProps) {
  const list = useMemo(() => (queries ?? (query ? [query] : [])), [query, queries]);
  const state = useQueriesState(list);

  if (state.isError) return <QueryError error={state.error} onRetry={state.retry} title={errorTitle} />;
  if (state.isLoading) return <>{loading ?? <LoadingState count={loadingCount} />}</>;
  if (isEmpty) return <>{empty ?? null}</>;
  return <>{typeof children === "function" ? children() : children}</>;
}

/**
 * Estado de consultas que outro hook fez por nós (ex.: o sino e a página de
 * Pendências leem `useShellData`, que não expõe `isLoading`). Olha o cache pelo
 * PREFIXO das chaves; `useIsFetching` garante o re-render quando uma busca
 * começa ou termina. "Carregando" = buscando e ainda sem nenhum dado.
 */
export function useQueryKeysState(keys: readonly QueryKey[]): { isLoading: boolean; isError: boolean; error: unknown } {
  const client = useQueryClient();
  const fetching = useIsFetching();
  return useMemo(() => {
    let isLoading = false;
    let isError = false;
    let error: unknown;
    for (const key of keys) {
      for (const q of client.getQueryCache().findAll({ queryKey: key })) {
        if (q.state.fetchStatus === "fetching" && q.state.dataUpdatedAt === 0) isLoading = true;
        if (q.state.status === "error") { isError = true; error ??= q.state.error; }
      }
    }
    return { isLoading, isError, error };
    // `fetching` entra só para recalcular quando o número de buscas muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fetching, JSON.stringify(keys)]);
}

export default QueryState;
