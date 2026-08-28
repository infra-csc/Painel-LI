/**
 * "Anexei o voucher, preenche pra mim" no modal de uma passagem só (pedido do
 * dono, 28/08) — o mesmo leitor do lote, aplicado a um registro.
 *
 * Trava importante: se o passageiro do voucher não parece ser o colaborador
 * desta vaga, os campos NÃO são preenchidos. Anexar o PDF da pessoa errada e
 * sobrescrever a passagem em silêncio seria pior do que não ter o recurso.
 */
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function VoucherFillButton({
  colaborador, onPreencher, disabled,
}: {
  /** Nome de quem está escalado nesta vaga — confere com o voucher. */
  colaborador?: string;
  onPreencher: (campos: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);

  const ler = async (arquivo: File) => {
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
          title: "Isso é um voucher de hotel",
          description: "Aqui só entram passagens — registre a hospedagem pela tela de Hospedagem.",
          variant: "destructive",
        });
        return;
      }
      if (leitura.tipo !== "passagem") {
        toast({
          title: "Não reconheci este voucher",
          description: leitura.avisos[0] ?? "Preencha os campos normalmente.",
          variant: "destructive",
        });
        return;
      }
      if (colaborador && leitura.pessoa && pontuarSemelhanca(leitura.pessoa, colaborador) < LIMIAR_MESMA_PESSOA) {
        toast({
          title: "Este voucher é de outra pessoa",
          description: `O PDF está no nome de ${leitura.pessoa}, e esta vaga é de ${colaborador}. Não preenchi nada.`,
          variant: "destructive",
        });
        return;
      }

      const quantos = Object.keys(leitura.campos).length;
      if (quantos === 0) {
        toast({ title: "Nada para preencher", description: "Não consegui extrair campos deste arquivo." });
        return;
      }
      onPreencher(leitura.campos);
      toast({
        title: "Preenchido pelo voucher",
        description: leitura.avisos.length
          ? `${leitura.avisos.join(" ")} Confira antes de registrar.`
          : "Confira os dados antes de registrar.",
      });
    } catch (e) {
      toast({
        title: "Não consegui ler o voucher",
        description: (e as Error)?.message || "Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) ler(f); }}
        data-testid="input-voucher-individual"
      />
      <Button
        type="button" variant="outline" size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || lendo}
        className="h-8 rounded-lg border-slate-200 bg-white text-xs hover:bg-brand-soft hover:text-primary"
        data-testid="preencher-por-voucher"
      >
        {lendo
          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Lendo…</>
          : <><FileUp className="w-3.5 h-3.5 mr-1.5" />Preencher pelo voucher (PDF)</>}
      </Button>
    </>
  );
}
