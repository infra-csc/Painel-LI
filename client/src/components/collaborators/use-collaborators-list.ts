/**
 * Lista de colaboradores (25/09 — extraída de pages/collaborator-management.tsx):
 * consulta, filtros na URL, paginação e os contadores dos cartões.
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

  const filtered = useMemo(() => {
    if (!collaborators) return [];
    const q = filters.search.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, "");
    return collaborators.filter(c => {
      // "Inativo" na prática é active === false (a rota /inactivate não mexe em
      // `status`); o valor legado "inativo" em status continua valendo.
      const statusMatch = filters.status === "all"
        ? true
        : filters.status === "inativo"
          ? (c.status === "inativo" || c.active === false)
          : c.status === filters.status;
      const typeMatch = filters.type === "all" || c.type === filters.type;
      // Documento ausente para quem não vê dados pessoais (`c.officialDocument.includes`
      // derrubava a tela inteira com TypeError para production/function_area).
      const documento = c.officialDocument ?? "";
      const searchMatch = !q
        || c.fullName.toLowerCase().includes(q)
        || documento.includes(q)
        // Busca por documento formatado ("123.456") também precisa casar.
        || (!!qDigits && documento.replace(/\D/g, "").includes(qDigits));
      return statusMatch && typeMatch && searchMatch;
    });
  }, [collaborators, filters]);

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
    let pendente = 0, aprovado = 0, freela = 0, casa = 0;
    for (const c of collaborators ?? []) {
      if (c.status === "pendente") pendente++;
      else if (c.status === "aprovado") aprovado++;
      if (c.type === "freela") freela++;
      else if (c.type === "casa") casa++;
    }
    return {
      totalCount: collaborators?.length ?? 0,
      pendingCount: pendente, approvedCount: aprovado,
      freelaCount: freela, casaCount: casa,
    };
  }, [collaborators]);

  return {
    collaborators, isLoading, isError, error, refetch,
    filters, setFilter, clearFilters, hasFilters, filtered, paginated, currentPage, totalPages, setPage, counts,
  };
}

export type CollaboratorsList = ReturnType<typeof useCollaboratorsList>;
