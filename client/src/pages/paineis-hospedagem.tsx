/**
 * Painéis (30/10) — Painel de hospedagem: fora do prazo, registradas × não
 * registradas por evento futuro e comparação de hotéis (room nights). O
 * conteúdo mora em client/src/components/paineis/hospedagem/.
 */
import { usePageTitle } from "@/components/common/use-page-title";
import PainelDeHospedagem from "@/components/paineis/hospedagem/painel-de-hospedagem";

export default function PaineisHospedagemPage() {
  usePageTitle("Painel de hospedagem");
  return <PainelDeHospedagem />;
}
