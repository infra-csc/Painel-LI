/**
 * Painéis (30/10) — Painel de passagens: fora do prazo, emitidas × não
 * emitidas por evento futuro e comparação de preços. O conteúdo mora em
 * client/src/components/paineis/passagens/.
 */
import { usePageTitle } from "@/components/common/use-page-title";
import PainelDePassagens from "@/components/paineis/passagens/painel-de-passagens";

export default function PaineisPassagensPage() {
  usePageTitle("Painel de passagens");
  return <PainelDePassagens />;
}
