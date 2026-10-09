/**
 * Campo "Sai de" do novo colaborador (14/09) — usado no pedido de troca, na
 * transferência e na aprovação (Escalação e Hospedagem/Passagem).
 * (25/09 — extraído de swap-request-panel.tsx)
 *
 * 09/10 — também OPCIONAL (`opcional`), na Logística sugerida da Sugestão de
 * escala e nos pedidos de inclusão/ajuste da Validação: ganha a opção
 * "A definir" (vazio vale) e a Escalação troca por pessoa depois.
 */
import { useState } from "react";
import { MapPin } from "lucide-react";
import { RequiredMark } from "@/components/forms/required-mark";
import { cn } from "@/lib/utils";
import { isCityFromSP } from "./scaling-utils";
import { SAI_DE_SP, cidadeDeSaida, validarSaiDe, validarSaiDeOpcional } from "@shared/swap-sai-de";

/** Estado inicial do "Sai de" a partir de uma cidade (a do colaborador ou a já pedida). */
export function saiDeInicial(cidade: string | null | undefined): { saiDeSP: boolean; cidade: string } {
  const c = String(cidade ?? "").trim();
  if (!c) return { saiDeSP: false, cidade: "" };
  return isCityFromSP(c) ? { saiDeSP: true, cidade: SAI_DE_SP } : { saiDeSP: false, cidade: c };
}

type Escolha = "definir" | "sp" | "outra";

/**
 * De onde o NOVO colaborador sai — o mesmo par "São Paulo - SP | Outra cidade"
 * do modal da Escalação. Usado no pedido de troca e na aprovação (Escalação e
 * Hospedagem/Passagem): aprovada a troca, a vaga passa a sair desta cidade.
 */
export function CampoSaiDe({
  id, saiDeSP, cidade, onChange, forcarErro = false, travado = false,
  rotulo = "Novo colaborador sai de",
  dicaTravado = "Escolha o novo colaborador — a cidade dele entra aqui e dá para corrigir.",
  opcional = false, ajuda, rotuloCidade = "Cidade de onde o novo colaborador sai",
  classeRotulo, classeCidade, desabilitado = false,
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
  /**
   * Opcional (09/10 — Sugestão e pedidos da Validação): sem marca de
   * obrigatório, com a opção "A definir" (cidade vazia) e o erro só quando a
   * cidade digitada não serve (`validarSaiDeOpcional`).
   */
  opcional?: boolean;
  /** Texto de ajuda sob o campo (o padrão é o da troca). */
  ajuda?: string;
  /** Nome acessível da caixa de texto da cidade. */
  rotuloCidade?: string;
  /** Classes do rótulo e da caixa de texto — para casar com os campos vizinhos de cada tela. */
  classeRotulo?: string;
  classeCidade?: string;
  /** Somente leitura (envio em andamento, evento encerrado…). */
  desabilitado?: boolean;
}) {
  // "Outra cidade" escolhida com a caixa ainda vazia: no opcional, cidade vazia
  // também é "A definir", então quem diz qual dos dois está marcado é este estado.
  const [outraAberta, setOutraAberta] = useState(false);
  const [tocado, setTocado] = useState(false);
  const escolha: Escolha = saiDeSP ? "sp" : !opcional || cidade.trim() !== "" || outraAberta ? "outra" : "definir";
  const erro = opcional ? validarSaiDeOpcional(cidadeDeSaida(saiDeSP, cidade)) : validarSaiDe(cidadeDeSaida(saiDeSP, cidade));
  const mostrarErro = !travado && !!erro && (forcarErro || (opcional && tocado));
  const travar = travado || desabilitado;
  // 07/10: controle segmentado, o mesmo do modal da vaga (eram dois botões
  // cheios em azul, que liam como duas ações e não como uma escolha).
  const botao = (on: boolean) =>
    `esc-alvo flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${on && !travado ? "bg-card text-primary shadow-1" : "text-slate-600 hover:text-foreground"}`;
  const opcoes: { valor: Escolha; texto: string; aoEscolher: () => void }[] = [
    ...(opcional ? [{ valor: "definir" as const, texto: "A definir", aoEscolher: () => { setOutraAberta(false); setTocado(false); onChange(false, ""); } }] : []),
    { valor: "sp", texto: "São Paulo - SP", aoEscolher: () => { setOutraAberta(false); onChange(true, SAI_DE_SP); } },
    { valor: "outra", texto: "Outra cidade", aoEscolher: () => { setOutraAberta(true); onChange(false, saiDeSP ? "" : cidade); } },
  ];
  const ajudaPadrao = "Aprovada a troca, a vaga passa a sair desta cidade — é a origem da passagem.";
  return (
    <div className="space-y-1.5" data-testid={id}>
      <p id={`${id}-rotulo`} className={cn("flex items-center gap-1 text-xs font-medium text-slate-600", classeRotulo)}>
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> {rotulo}{!opcional && <RequiredMark />}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className={`flex gap-0.5 rounded-lg border border-border bg-muted p-0.5 ${travado ? "opacity-60" : ""}`}>
        {opcoes.map((o) => (
          <button key={o.valor} type="button" role="radio" aria-checked={!travado && escolha === o.valor} disabled={travar}
            onClick={o.aoEscolher} className={botao(escolha === o.valor)} data-testid={`${id}-${o.valor}`}>
            {o.texto}
          </button>
        ))}
      </div>
      {!travado && escolha === "outra" && (
        <input
          type="text"
          value={cidade}
          maxLength={120}
          disabled={desabilitado}
          aria-label={rotuloCidade}
          aria-invalid={mostrarErro || undefined}
          aria-describedby={`${id}-ajuda`}
          onChange={(e) => onChange(false, e.target.value)}
          onBlur={() => setTocado(true)}
          placeholder="Ex: Rio de Janeiro - RJ"
          data-testid={`${id}-cidade`}
          className={cn(
            "w-full h-9 px-3 text-sm border rounded-lg bg-card transition-[border-color,box-shadow] focus:outline-none focus:ring-[3px] focus:ring-primary/12 focus:border-primary disabled:opacity-60",
            mostrarErro ? "border-danger/50" : "border-border",
            classeCidade,
          )}
        />
      )}
      <p id={`${id}-ajuda`} className={`text-2xs leading-snug ${mostrarErro ? "text-danger-strong" : "text-muted-foreground"}`}>
        {travado
          ? dicaTravado
          : mostrarErro ? erro : (ajuda ?? ajudaPadrao)}
      </p>
    </div>
  );
}
