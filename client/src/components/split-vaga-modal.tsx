/**
 * Reexport de compatibilidade (25/09): o modal "Dividir escalação" mudou para
 * `components/scaling/split-vaga/` (hook de estado + passos separados). Este
 * caminho fica porque `components/budget/actual-dialogs.tsx` importa daqui.
 */
export { SplitVagaModal } from "@/components/scaling/split-vaga/modal";
export type { SplitVagaModalProps, SplitPayload } from "@/components/scaling/split-vaga/modal";
