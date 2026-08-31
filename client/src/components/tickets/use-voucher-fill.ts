/**
 * Ler o voucher que acabou de ser anexado e preencher a passagem (28/08).
 *
 * Pedido do dono: "não ter dois pra subir — preencher com o PDF e anexar junto
 * o comprovante". Então não existe mais um botão só para ler: o MESMO anexo
 * que vira comprovante alimenta os campos.
 *
 * Trava mantida: se o passageiro do PDF não parece ser o colaborador da vaga,
 * nada é preenchido. O arquivo continua anexado (pode ser proposital), mas os
 * campos não são sobrescritos com dados de outra pessoa.
 */
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { pontuarSemelhanca } from "./voucher-match";

/** Abaixo disto, tratamos como pessoa diferente e não preenchemos nada. */
const LIMIAR_MESMA_PESSOA = 0.34;

interface Leitura {
  arquivo: string;
  tipo: "passagem" | "hospedagem" | "desconhecido";
  campos: Record<string, string>;
  pessoa?: string;
  trechoUnico?: boolean;
  avisos: string[];
}

/** Campos de cada trecho — usados para redirecionar um voucher só de volta. */
const CAMPOS_IDA = ["departureAirport", "destinationAirport", "departureCityOrigin", "departureCityDestination", "actualDepartureDate", "actualDepartureTime", "actualArrivalTime"] as const;
const PARA_VOLTA: Record<string, string> = {
  departureAirport: "returnOriginAirport",
  destinationAirport: "returnDestinationAirport",
  departureCityOrigin: "returnCityOrigin",
  departureCityDestination: "returnCityDestination",
  actualDepartureDate: "actualReturnDate",
  actualDepartureTime: "actualReturnTime",
  actualArrivalTime: "returnArrivalTime",
};

export function useVoucherFill({ colaborador, trecho, onPreencher }: {
  /** Nome de quem está escalado nesta vaga — confere com o voucher. */
  colaborador?: string;
  /** Recorte escolhido no formulário: decide onde um voucher de um trecho entra. */
  trecho?: "ida_volta" | "so_ida" | "so_volta";
  onPreencher: (campos: Record<string, string>) => void;
}) {
  const { toast } = useToast();
  const [lendo, setLendo] = useState(false);

  const lerArquivo = async (arquivo: File) => {
    if (arquivo.type !== "application/pdf") return; // imagem/outro anexo: só guarda
    setLendo(true);
    try {
      const fd = new FormData();
      fd.append("files", arquivo);
      const r = await fetch("/api/vouchers/ler", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) {
        throw new Error("O servidor não respondeu a leitura — atualize a página e tente de novo.");
      }
      const { leituras } = (await r.json()) as { leituras: Leitura[] };
      const leitura = leituras?.[0];
      if (!leitura) throw new Error("Não veio nada do arquivo.");

      if (leitura.tipo === "hospedagem") {
        toast({
          title: "Anexado, mas é voucher de hotel",
          description: "O arquivo ficou anexado; os campos de passagem não foram preenchidos.",
        });
        return;
      }
      if (leitura.tipo !== "passagem") {
        toast({
          title: "Anexado, mas não reconheci o voucher",
          description: leitura.avisos[0] ?? "Preencha os campos normalmente.",
        });
        return;
      }
      if (colaborador && leitura.pessoa && pontuarSemelhanca(leitura.pessoa, colaborador) < LIMIAR_MESMA_PESSOA) {
        toast({
          title: "Este voucher é de outra pessoa",
          description: `O PDF está no nome de ${leitura.pessoa}, e esta vaga é de ${colaborador}. Anexei o arquivo, mas não preenchi nada.`,
          variant: "destructive",
        });
        return;
      }

      let campos = leitura.campos;
      const avisos = [...leitura.avisos];

      // Voucher com um trecho só + formulário em "só volta": o que o leitor
      // chamou de ida é, na verdade, a volta deste bilhete. É o caso da ida
      // emitida por uma agência e a volta por outra.
      if (leitura.trechoUnico && trecho === "so_volta") {
        const redirecionado: Record<string, string> = {};
        for (const [k, valor] of Object.entries(campos)) {
          if ((CAMPOS_IDA as readonly string[]).includes(k)) {
            redirecionado[PARA_VOLTA[k]] = valor;
          } else {
            redirecionado[k] = valor;
          }
        }
        campos = redirecionado;
        avisos.push("Preenchi como VOLTA, seguindo o recorte escolhido neste bilhete.");
      }

      const quantos = Object.keys(campos).length;
      if (quantos === 0) {
        toast({ title: "Anexado", description: "Não consegui extrair campos deste arquivo." });
        return;
      }
      onPreencher(campos);
      toast({
        title: "Anexado e preenchido pelo voucher",
        description: avisos.length
          ? `${avisos.join(" ")} Confira antes de registrar.`
          : "Confira os dados antes de registrar.",
      });
    } catch (e) {
      toast({
        title: "Anexado, mas não consegui ler",
        description: (e as Error)?.message || "Preencha os campos à mão.",
        variant: "destructive",
      });
    } finally {
      setLendo(false);
    }
  };

  return { lerArquivo, lendo };
}
