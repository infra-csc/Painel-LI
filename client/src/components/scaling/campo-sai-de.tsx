/**
 * Campo "Sai de" do novo colaborador (14/09) — usado no pedido de troca, na
 * transferência e na aprovação (Escalação e Hospedagem/Passagem).
 * (25/09 — extraído de swap-request-panel.tsx)
 */
import { MapPin } from "lucide-react";
import { RequiredMark } from "@/components/forms/required-mark";
import { isCityFromSP } from "./scaling-utils";
import { SAI_DE_SP, cidadeDeSaida, validarSaiDe } from "@shared/swap-sai-de";

/** Estado inicial do "Sai de" a partir de uma cidade (a do colaborador ou a já pedida). */
export function saiDeInicial(cidade: string | null | undefined): { saiDeSP: boolean; cidade: string } {
  const c = String(cidade ?? "").trim();
  if (!c) return { saiDeSP: false, cidade: "" };
  return isCityFromSP(c) ? { saiDeSP: true, cidade: SAI_DE_SP } : { saiDeSP: false, cidade: c };
}

/**
 * De onde o NOVO colaborador sai — o mesmo par "São Paulo - SP | Outra cidade"
 * do modal da Escalação. Usado no pedido de troca e na aprovação (Escalação e
 * Hospedagem/Passagem): aprovada a troca, a vaga passa a sair desta cidade.
 */
export function CampoSaiDe({
  id, saiDeSP, cidade, onChange, forcarErro = false, travado = false,
  rotulo = "Novo colaborador sai de",
  dicaTravado = "Escolha o novo colaborador — a cidade dele entra aqui e dá para corrigir.",
}: {
  /** Rótulo do campo (na permuta são dois, um por colaborador). */
  rotulo?: string;
  /** Dica enquanto o campo está travado. */
  dicaTravado?: string;
  id: string;
  saiDeSP: boolean;
  cidade: string;
  onChange: (saiDeSP: boolean, cidade: string) => void;
  /** Mostra o erro mesmo sem o usuário ter mexido (depois de tentar enviar/aprovar). */
  forcarErro?: boolean;
  /**
   * Ainda sem novo colaborador (14/09): o campo aparece, mas travado e dizendo
   * o que falta — escondido, ninguém sabia que o pedido pedia o "Sai de".
   */
  travado?: boolean;
}) {
  const erro = validarSaiDe(cidadeDeSaida(saiDeSP, cidade));
  const mostrarErro = !travado && !!erro && forcarErro;
  // 07/10: controle segmentado, o mesmo do modal da vaga (eram dois botões
  // cheios em azul, que liam como duas ações e não como uma escolha).
  const botao = (on: boolean) =>
    `esc-alvo flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${on && !travado ? "bg-card text-primary shadow-1" : "text-slate-600 hover:text-foreground"}`;
  return (
    <div className="space-y-1.5" data-testid={id}>
      <p id={`${id}-rotulo`} className="flex items-center gap-1 text-xs font-medium text-slate-600">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> {rotulo}<RequiredMark />
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className={`flex gap-0.5 rounded-lg border border-border bg-muted p-0.5 ${travado ? "opacity-60" : ""}`}>
        <button type="button" role="radio" aria-checked={!travado && saiDeSP} disabled={travado} onClick={() => onChange(true, SAI_DE_SP)} className={botao(saiDeSP)} data-testid={`${id}-sp`}>
          São Paulo - SP
        </button>
        <button type="button" role="radio" aria-checked={!travado && !saiDeSP} disabled={travado} onClick={() => onChange(false, saiDeSP ? "" : cidade)} className={botao(!saiDeSP)} data-testid={`${id}-outra`}>
          Outra cidade
        </button>
      </div>
      {!travado && !saiDeSP && (
        <input
          type="text"
          value={cidade}
          maxLength={120}
          aria-label="Cidade de onde o novo colaborador sai"
          aria-invalid={mostrarErro || undefined}
          onChange={(e) => onChange(false, e.target.value)}
          placeholder="Ex: Rio de Janeiro - RJ"
          data-testid={`${id}-cidade`}
          className={`w-full h-9 px-3 text-sm border rounded-lg bg-card transition-[border-color,box-shadow] focus:outline-none focus:ring-[3px] focus:ring-primary/12 focus:border-primary ${mostrarErro ? "border-danger/50" : "border-border"}`}
        />
      )}
      <p className={`text-2xs leading-snug ${mostrarErro ? "text-danger-strong" : "text-muted-foreground"}`}>
        {travado
          ? dicaTravado
          : mostrarErro ? erro : "Aprovada a troca, a vaga passa a sair desta cidade — é a origem da passagem."}
      </p>
    </div>
  );
}
