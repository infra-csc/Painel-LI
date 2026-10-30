/**
 * Painéis (30/10) — Visão geral: o que precisa de ação agora (passagens e
 * hotéis fora do prazo, escala e aprovação atrasadas, pedidos de ajuste e as
 * últimas inclusões). O conteúdo mora em client/src/components/paineis/visao-geral/.
 */
import { usePageTitle } from "@/components/common/use-page-title";
import VisaoGeral from "@/components/paineis/visao-geral/visao-geral";

export default function PaineisPage() {
  usePageTitle("Visão geral");
  return <VisaoGeral />;
}
