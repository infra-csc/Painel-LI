/**
 * Índice da documentação (redesenho 08/10): lista lateral grudada quando há
 * largura útil, faixa de atalhos que rola de lado quando não há. A seção em
 * leitura acende nos dois; clicar leva à seção e grava a âncora na URL (o link
 * copiado abre no mesmo lugar).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ItemDoIndice { id: string; rotulo: string; curto?: string; grupo: string }

export const SECOES: ItemDoIndice[] = [
  { id: "como-funciona", rotulo: "Como o cálculo funciona", curto: "Visão geral", grupo: "Visão geral" },
  { id: "quem-recebe", rotulo: "Quem recebe o quê", grupo: "Visão geral" },
  { id: "diaria-casa", rotulo: "Time da Casa", curto: "Diária casa", grupo: "Diárias" },
  { id: "diaria-freela", rotulo: "Time Freela", curto: "Diária freela", grupo: "Diárias" },
  { id: "deflacao", rotulo: "Deflação por período", curto: "Deflação", grupo: "Diárias" },
  { id: "alimentacao", rotulo: "Alimentação", grupo: "Ajudas de custo" },
  { id: "mobilidade", rotulo: "Mobilidade", grupo: "Ajudas de custo" },
  { id: "dias-adicionais", rotulo: "Dias adicionais (freela)", curto: "Dias adicionais", grupo: "Ajudas de custo" },
  { id: "empreita", rotulo: "Cenotécnicos empreita", curto: "Empreita", grupo: "Pacotes fechados" },
  { id: "percurseiro", rotulo: "Percurseiro", grupo: "Pacotes fechados" },
];

const GRUPOS = Array.from(new Set(SECOES.map(s => s.grupo)));

const reduzMovimento = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Onde a leitura começa: o mesmo `scroll-margin-top` que o CSS dá às seções
 * (barra do app + barra da tela + faixa de atalhos, conforme a largura) —
 * uma medida só para o pulo do índice e para o acender da seção.
 */
function linhaDeLeitura(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).scrollMarginTop) || 120;
}

/** Seção em leitura: a última cujo topo já passou da linha de leitura. */
export function useSecaoAtiva(ids: string[], ativo: boolean): [string, (id: string) => void] {
  const [atual, setAtual] = useState(ids[0]);
  const travadoAte = useRef(0);

  useEffect(() => {
    if (!ativo) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      if (Date.now() < travadoAte.current) return;
      let escolhido = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= linhaDeLeitura(el) + 8) escolhido = id;
      }
      // No fim da página a última seção curta nunca alcança a linha.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) escolhido = ids[ids.length - 1];
      setAtual(escolhido);
    };
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [ids, ativo]);

  const irPara = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setAtual(id);
    // Enquanto a rolagem suave anda, o medidor não briga com o clique: trava
    // até a rolagem terminar (`scrollend`; sem ele, no máximo 1,5 s).
    travadoAte.current = Date.now() + (reduzMovimento() ? 0 : 1500);
    window.addEventListener("scrollend", () => {
      travadoAte.current = 0;
      window.dispatchEvent(new Event("scroll"));
    }, { once: true });
    el.scrollIntoView({ behavior: reduzMovimento() ? "auto" : "smooth", block: "start" });
    try { history.replaceState(history.state, "", `#${id}`); } catch { /* sem histórico (iframe/sandbox) */ }
    // Leitor de tela e teclado continuam a partir da seção escolhida.
    document.getElementById(`${id}-titulo`)?.focus({ preventScroll: true });
    // O título acende uma vez quando a rolagem chega (CSS: .rgc-chegou).
    el.classList.remove("rgc-chegou");
    window.setTimeout(() => {
      el.classList.add("rgc-chegou");
      window.setTimeout(() => el.classList.remove("rgc-chegou"), 1400);
    }, reduzMovimento() ? 0 : 350);
  }, []);

  return [atual, irPara];
}

/** Lista lateral (largura útil ≥ 1080px). */
export function IndiceLateral({ atual, onIr, rodape }: { atual: string; onIr: (id: string) => void; rodape?: React.ReactNode }) {
  return (
    <nav aria-label="Nesta página" className="rgc-indice" data-testid="rgc-indice">
      <p className="rgc-indice-titulo m-0">Nesta página</p>
      <ol className="m-0 p-0 list-none">
        {GRUPOS.map(g => (
          <li key={g} className="rgc-indice-grupo">
            <span className="rgc-indice-grupo-rotulo">{g}</span>
            <ol className="m-0 p-0 list-none">
              {SECOES.filter(s => s.grupo === g).map(s => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={e => { e.preventDefault(); onIr(s.id); }}
                    aria-current={atual === s.id ? "location" : undefined}
                    className={cn("rgc-indice-item", atual === s.id && "rgc-indice-ativo")}
                    data-testid={`rgc-indice-${s.id}`}
                  >
                    {s.rotulo}
                  </a>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {rodape}
    </nav>
  );
}

/** Faixa de atalhos (largura útil estreita): rola de lado e acompanha a leitura. */
export function IndiceEmFaixa({ atual, onIr }: { atual: string; onIr: (id: string) => void }) {
  const faixa = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const f = faixa.current;
    const chip = f?.querySelector<HTMLElement>(`[data-id="${atual}"]`);
    if (!f || !chip) return;
    const alvo = chip.offsetLeft - (f.clientWidth - chip.offsetWidth) / 2;
    // Sem rolagem suave aqui: no Chrome duas rolagens suaves ao mesmo tempo
    // (a da página indo para a seção e esta, de lado) cancelam uma à outra.
    f.scrollLeft = Math.max(0, alvo);
  }, [atual]);
  return (
    <nav aria-label="Nesta página" className="rgc-faixa" data-testid="rgc-faixa">
      <div ref={faixa} className="rgc-faixa-rolagem pas-rolagem-x">
        {SECOES.map(s => (
          <a
            key={s.id}
            data-id={s.id}
            href={`#${s.id}`}
            onClick={e => { e.preventDefault(); onIr(s.id); }}
            aria-current={atual === s.id ? "location" : undefined}
            className={cn("rgc-chip pas-alvo", atual === s.id && "rgc-chip-ativo")}
          >
            {s.curto ?? s.rotulo}
          </a>
        ))}
      </div>
    </nav>
  );
}
