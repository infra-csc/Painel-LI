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
  avisos: string[];
}

export function useVoucherFill({ colaborador, onPreencher }: {
  /** Nome de quem está escalado nesta vaga — confere com o voucher. */
  colaborador?: string;
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

      const quantos = Object.keys(leitura.campos).length;
      if (quantos === 0) {
        toast({ title: "Anexado", description: "Não consegui extrair campos deste arquivo." });
        return;
      }
      onPreencher(leitura.campos);
      toast({
        title: "Anexado e preenchido pelo voucher",
        description: leitura.avisos.length
          ? `${leitura.avisos.join(" ")} Confira antes de registrar.`
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
