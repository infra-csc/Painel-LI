/**
 * Escolha da vaga no lote de vouchers (28/08).
 *
 * Antes era uma lista solta com centenas de vagas — "não dá pra ir descendo",
 * nas palavras do dono. Agora: busca por nome, número da vaga ou evento, com
 * as vagas mais parecidas com o passageiro do voucher no topo, já rotuladas
 * como sugestão.
 */
import { useMemo, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ordenarPorSemelhanca, chaveNome } from "./voucher-match";

export interface VagaOpcao {
  id: string;
  nome: string;
  numero: string;
  evento: string;
  destino?: string;
}

/** Quantas linhas a lista mostra por vez — o resto vem ao refinar a busca. */
const LIMITE_VISIVEL = 40;
/** A partir daqui, o nome é parecido o bastante para virar sugestão. */
const LIMIAR_SUGESTAO = 0.34;

export default function VagaCombobox({
  vagas, valor, onChange, passageiro, idsJaUsados, disabled,
}: {
  vagas: VagaOpcao[];
  valor: string | null;
  onChange: (id: string) => void;
  /** Passageiro lido no voucher — define quais vagas sobem para o topo. */
  passageiro?: string;
  /** Vagas já escolhidas em outras linhas do lote (marcadas, para não repetir). */
  idsJaUsados?: Set<string>;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const escolhida = vagas.find((v) => v.id === valor) ?? null;

  const { sugestoes, demais } = useMemo(() => {
    const termo = chaveNome(busca);
    const numero = termo.replace(/#/g, "").trim();
    const filtradas = termo
      ? vagas.filter((v) =>
          chaveNome(v.nome).includes(termo) ||
          v.numero.includes(numero) ||
          chaveNome(v.evento).includes(termo) ||
          chaveNome(v.destino ?? "").includes(termo))
      : vagas;

    const ordenadas = ordenarPorSemelhanca(passageiro, filtradas);
    return {
      sugestoes: ordenadas.filter((o) => o.score >= LIMIAR_SUGESTAO).slice(0, 5).map((o) => o.vaga),
      demais: ordenadas.filter((o) => o.score < LIMIAR_SUGESTAO).map((o) => o.vaga),
    };
  }, [vagas, busca, passageiro]);

  const total = sugestoes.length + demais.length;
  const visiveis = demais.slice(0, Math.max(0, LIMITE_VISIVEL - sugestoes.length));

  const Item = ({ vaga, sugerida }: { vaga: VagaOpcao; sugerida?: boolean }) => {
    const usada = idsJaUsados?.has(vaga.id) && vaga.id !== valor;
    return (
      <button
        type="button"
        onClick={() => { onChange(vaga.id); setAberto(false); setBusca(""); }}
        className={`w-full text-left px-3 py-2 border-b border-border last:border-0 transition-colors ${
          vaga.id === valor ? "bg-brand-soft" : "hover:bg-brand-soft/60"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground tabular-nums shrink-0">#{vaga.numero}</span>
          <span className="text-sm text-foreground truncate flex-1">{vaga.nome || "Não escalado"}</span>
          {sugerida && (
            <span className="text-2xs font-bold text-success bg-success-soft rounded-full px-1.5 py-0.5 shrink-0">
              provável
            </span>
          )}
          {usada && (
            <span className="text-2xs font-bold text-warning bg-warning-soft rounded-full px-1.5 py-0.5 shrink-0">
              já usada
            </span>
          )}
          {vaga.id === valor && <Check className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />}
        </span>
        <span className="block text-2xs text-muted-foreground truncate">
          {vaga.evento}{vaga.destino ? ` · ${vaga.destino}` : ""}
        </span>
      </button>
    );
  };

  return (
    <Popover open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="h-8 min-w-[320px] max-w-[460px] flex items-center justify-between gap-2 px-3 border border-border rounded-lg bg-card text-xs text-slate-700 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="escolher-vaga"
        >
          <span className={`truncate ${escolhida ? "" : "text-muted-foreground"}`}>
            {escolhida ? `#${escolhida.numero} · ${escolhida.nome}` : "Escolha a vaga…"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="p-0 w-[460px] bg-card border border-border rounded-xl shadow-2 overflow-hidden z-[60]">
        <div className="flex items-center gap-2 bg-surface-muted border-b border-border px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, número da vaga ou evento…"
            className="w-full text-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm placeholder:text-muted-foreground text-slate-700"
            data-testid="buscar-vaga"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {total === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhuma vaga encontrada.</p>
          ) : (
            <>
              {sugestoes.length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground bg-surface-muted/80">
                    Parecidas com {passageiro}
                  </p>
                  {sugestoes.map((v) => <Item key={v.id} vaga={v} sugerida />)}
                  {visiveis.length > 0 && (
                    <p className="px-3 py-1.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground bg-surface-muted/80">
                      Demais vagas
                    </p>
                  )}
                </>
              )}
              {visiveis.map((v) => <Item key={v.id} vaga={v} />)}
              {demais.length > visiveis.length && (
                <p className="px-3 py-2 text-2xs text-muted-foreground text-center border-t border-border">
                  Mostrando {sugestoes.length + visiveis.length} de {total} — digite para refinar.
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
