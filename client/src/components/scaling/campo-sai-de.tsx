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
  const botao = (on: boolean) =>
    `flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${on && !travado ? "bg-primary text-primary-foreground border-primary" : "bg-card text-slate-600 border-border hover:border-slate-300"}`;
  return (
    <div className="space-y-1.5" data-testid={id}>
      <p id={`${id}-rotulo`} className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3 w-3" aria-hidden="true" /> {rotulo}<RequiredMark />
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex gap-1.5">
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
          className={`w-full px-3 py-2 text-sm border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${mostrarErro ? "border-danger/25" : "border-border"}`}
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
