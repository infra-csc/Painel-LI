/**
 * Lista de colaboradores (25/09 — extraída de pages/collaborator-management.tsx):
 * consulta, filtros na URL, paginação e os contadores (resumo da barra, faixa
 * de situação e seletor de tipo).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Collaborator } from "@shared/schema";
import { campo, useUrlState } from "@/lib/use-url-state";
import { PAGE_SIZE } from "./collaborator-shared";

export function useCollaboratorsList() {
  // Busca, status, tipo e página na URL (23/09): abrir um colaborador em outra
  // tela e voltar devolvia a lista zerada e na página 1.
  const [urlState, setUrlState] = useUrlState({
    q: campo.texto(""),
    status: campo.texto("all"),
    type: campo.texto("all"),
    pagina: campo.numero(1),
  });
  const filters = useMemo(
    () => ({ status: urlState.status, type: urlState.type, search: urlState.q }),
    [urlState.status, urlState.type, urlState.q],
  );
  const page = urlState.pagina;
  const setPage = (p: number) => setUrlState({ pagina: p });

  const { data: collaborators, isLoading, isError, error, refetch } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"] });

  // Os três critérios separados (07/10) — a MESMA regra de antes, só dividida:
  // a lista usa os três juntos e os contadores da faixa de situação / do
  // seletor de tipo usam "todos menos o próprio", para o número ao lado da
  // opção ser o que a lista mostra ao escolhê-la.
  const criterios = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    return {
      // "Inativo" na prática é active === false (a rota /inactivate não mexe em
      // `status`); o valor legado "inativo" em status continua valendo.
      status: (c: Collaborator, status = filters.status) => status === "all"
        ? true
        : status === "inativo"
          ? (c.status === "inativo" || c.active === false)
          : c.status === status,
      type: (c: Collaborator, type = filters.type) => type === "all" || c.type === type,
      search: (c: Collaborator) => {
        // Documento ausente para quem não vê dados pessoais (`c.officialDocument.includes`
        // derrubava a tela inteira com TypeError para production/function_area).
        const documento = c.officialDocument ?? "";
        return !q
          || c.fullName.toLowerCase().includes(q)
          || documento.includes(q)
          // Busca por documento formatado ("123.456") também precisa casar.
          || (!!qDigits && documento.replace(/\D/g, "").includes(qDigits));
      },
    };
  }, [filters]);

  const filtered = useMemo(() => {
    if (!collaborators) return [];
    return collaborators.filter(c => criterios.status(c) && criterios.type(c) && criterios.search(c));
  }, [collaborators, criterios]);

  /** Quantos a lista mostraria em cada situação, com o tipo e a busca atuais. */
  const porStatus = useMemo(() => {
    const base = (collaborators ?? []).filter(c => criterios.type(c) && criterios.search(c));
    const n = (s: string) => base.filter(c => criterios.status(c, s)).length;
    return { pendente: n("pendente"), aprovado: n("aprovado"), rejeitado: n("rejeitado"), inativo: n("inativo") };
  }, [collaborators, criterios]);

  /** Quantos a lista mostraria em cada tipo, com a situação e a busca atuais. */
  const porTipo = useMemo(() => {
    const base = (collaborators ?? []).filter(c => criterios.status(c) && criterios.search(c));
    const n = (t: string) => base.filter(c => criterios.type(c, t)).length;
    return { all: base.length, casa: n("casa"), freela: n("freela"), local: n("local") } as Record<string, number>;
  }, [collaborators, criterios]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Inativar/filtrar podia encolher a lista e deixar `page` fora do intervalo →
  // tabela vazia com o rodapé dizendo que havia registros.
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const setFilter = (key: string, val: string) => setUrlState({ [key === "search" ? "q" : key]: val, pagina: 1 });
  const clearFilters = () => setUrlState({ status: "all", type: "all", q: "", pagina: 1 });
  const hasFilters = filters.status !== "all" || filters.type !== "all" || !!filters.search;

  const counts = useMemo(() => {
    let pendente = 0, aprovado = 0, freela = 0, casa = 0, local = 0;
    for (const c of collaborators ?? []) {
      if (c.status === "pendente") pendente++;
      else if (c.status === "aprovado") aprovado++;
      if (c.type === "freela") freela++;
      else if (c.type === "casa") casa++;
      else if (c.type === "local") local++;
    }
    return {
      totalCount: collaborators?.length ?? 0,
      pendingCount: pendente, approvedCount: aprovado,
      freelaCount: freela, casaCount: casa, localCount: local,
    };
  }, [collaborators]);

  return {
    collaborators, isLoading, isError, error, refetch,
    filters, setFilter, clearFilters, hasFilters, filtered, paginated, currentPage, totalPages, setPage, counts,
    porStatus, porTipo,
  };
}

export type CollaboratorsList = ReturnType<typeof useCollaboratorsList>;
