/**
 * Painéis (30/10) — Atividade recente: as últimas inclusões, mudanças,
 * passagens, hotéis, pedidos de ajuste e trocas. O conteúdo mora em
 * client/src/components/paineis/atividade/.
 */
import { usePageTitle } from "@/components/common/use-page-title";
import AtividadeRecente from "@/components/paineis/atividade/atividade-recente";

export default function PaineisAtividadePage() {
  usePageTitle("Atividade recente");
  return <AtividadeRecente />;
}
