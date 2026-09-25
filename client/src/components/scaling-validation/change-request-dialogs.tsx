/**
 * Diálogos de pedido da Validação de Escala — ajuste, exclusão e inclusão.
 *
 * Desde 25/09 cada diálogo mora no seu arquivo (`adjust-request-dialog`,
 * `delete-request-dialog`, `include-request-dialog`) e o que é comum em
 * `change-request-shared`. Este arquivo continua o ponto de importação público
 * (tinha 676 linhas).
 */
export { AdjustRequestDialog, type AdjustableInclusion } from "./adjust-request-dialog";
export { DeleteRequestDialog } from "./delete-request-dialog";
export { IncludeRequestDialog } from "./include-request-dialog";
export { ApproverCommentBanner, type OnRequestSent } from "./change-request-shared";
