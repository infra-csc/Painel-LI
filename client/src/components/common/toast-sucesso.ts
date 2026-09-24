/**
 * Toast de sucesso de uma VAGA (23/09).
 *
 * Escalação, Passagens e Hospedagem abriam um modal bloqueante "Sucesso" + OK
 * com #vaga, evento, colaborador e função. A pessoa tinha de clicar para
 * seguir. Agora é um toast `variant="success"` com título descritivo
 * ("Escalação confirmada", "Passagem registrada") e as mesmas informações
 * numa linha só — o que já era mostrado continua sendo mostrado.
 */
import { toast } from "@/hooks/use-toast";

export interface ResumoDaVaga {
  inclusionNumber: number | null;
  eventName: string;
  collaboratorName: string;
  functionName: string;
}

/** "#123 · Evento · Colaborador · Função" — pula o que estiver vazio ou "—". */
export function resumoDaVaga(info: ResumoDaVaga): string {
  return [
    info.inclusionNumber != null ? `#${info.inclusionNumber}` : "",
    info.eventName,
    info.collaboratorName,
    info.functionName,
  ].filter((parte) => parte && parte !== "—").join(" · ");
}

export function toastSucessoDaVaga(title: string, info: ResumoDaVaga, complemento?: string) {
  const resumo = resumoDaVaga(info);
  const description = [complemento, resumo].filter(Boolean).join(" ");
  return toast({ variant: "success", title, description: description || undefined });
}
