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
        className={`w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 transition-colors ${
          vaga.id === valor ? "bg-blue-50" : "hover:bg-blue-50/60"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-slate-400 tabular-nums shrink-0">#{vaga.numero}</span>
          <span className="text-[13px] text-slate-800 truncate flex-1">{vaga.nome || "Não escalado"}</span>
          {sugerida && (
            <span className="text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5 shrink-0">
              provável
            </span>
          )}
          {usada && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">
              já usada
            </span>
          )}
          {vaga.id === valor && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
        </span>
        <span className="block text-[11px] text-slate-400 truncate">
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
          className="h-8 min-w-[320px] max-w-[460px] flex items-center justify-between gap-2 px-3 border border-slate-200 rounded-lg bg-white text-[12px] text-slate-700 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="escolher-vaga"
        >
          <span className={`truncate ${escolhida ? "" : "text-slate-400"}`}>
            {escolhida ? `#${escolhida.numero} · ${escolhida.nome}` : "Escolha a vaga…"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="p-0 w-[460px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-[60]">
        <div className="flex items-center gap-2 bg-slate-50 border-b border-slate-100 px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, número da vaga ou evento…"
            className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
            data-testid="buscar-vaga"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {total === 0 ? (
            <p className="px-4 py-6 text-[13px] text-slate-400 text-center">Nenhuma vaga encontrada.</p>
          ) : (
            <>
              {sugestoes.length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/80">
                    Parecidas com {passageiro}
                  </p>
                  {sugestoes.map((v) => <Item key={v.id} vaga={v} sugerida />)}
                  {visiveis.length > 0 && (
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/80">
                      Demais vagas
                    </p>
                  )}
                </>
              )}
              {visiveis.map((v) => <Item key={v.id} vaga={v} />)}
              {demais.length > visiveis.length && (
                <p className="px-3 py-2 text-[11px] text-slate-400 text-center border-t border-slate-100">
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
