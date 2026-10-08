// Valores padrão — índice da página (redesenho 08/10).
//
// A tela tem nove grupos e passa de três telas de altura: na largura larga um
// índice grudado à esquerda mostra onde se está, leva a cada grupo e marca com
// um ponto âmbar os que têm alteração não salva. Some na largura estreita (o
// painel de resumo já leva aos grupos principais).
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ancoraDaSecao, SECOES, type SecaoId } from "./settings-secoes";

export interface IndiceDaPaginaProps {
  alteradasPorSecao: Record<SecaoId, number>;
  onIrPara: (id: SecaoId) => void;
}

export function IndiceDaPagina({ alteradasPorSecao, onIrPara }: IndiceDaPaginaProps) {
  const [ativa, setAtiva] = useState<SecaoId>("diarias");

  // Seção ativa = a mais alta que cruzou a faixa de leitura (abaixo da barra).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visiveis = new Map<string, number>();
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) visiveis.set(e.target.id, e.boundingClientRect.top);
        else visiveis.delete(e.target.id);
      }
      const primeira = SECOES.find(s => visiveis.has(ancoraDaSecao(s.id)));
      if (primeira) setAtiva(primeira.id);
    }, { rootMargin: "-120px 0px -55% 0px" });
    for (const s of SECOES) {
      const el = document.getElementById(ancoraDaSecao(s.id));
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <nav aria-label="Grupos desta página" className="cfg-indice" data-testid="cfg-indice">
      <p className="m-0 mb-2 px-3 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nesta página</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
        {SECOES.map((s, i) => {
          const n = alteradasPorSecao[s.id];
          const separa = s.id === "empresas" || s.id === "legado";
          return (
            <li key={s.id} className={cn(separa && i > 0 && "mt-2 pt-2 border-t border-border")}>
              <a
                href={`#${ancoraDaSecao(s.id)}`}
                onClick={e => { e.preventDefault(); setAtiva(s.id); onIrPara(s.id); }}
                aria-current={ativa === s.id ? "location" : undefined}
                className={cn(
                  "cfg-indice-item flex items-center justify-between gap-2 h-8 px-3 rounded-md text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativa === s.id ? "bg-brand-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="truncate">{s.titulo}</span>
                {n > 0 && (
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold tabular-nums text-warning" title={`${n} ${n === 1 ? "alteração não salva" : "alterações não salvas"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />{n}
                    <span className="sr-only">{n === 1 ? "alteração não salva" : "alterações não salvas"}</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
