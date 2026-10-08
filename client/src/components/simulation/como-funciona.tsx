/**
 * Ver como usuário — o que acontece ao simular (redesenho 08/10). Três passos
 * numa faixa só: quem você passa a ver, o que fica travado e como voltar —
 * com a réplica do botão da faixa azul, para a pessoa reconhecer a saída
 * quando estiver lá dentro. Com uma simulação já ativa, vira o aviso de saída.
 */
import { Eye, LogOut, Lock, MousePointerClick } from "lucide-react";

export function ComoFunciona() {
  const passos = [
    {
      icone: MousePointerClick,
      titulo: "Escolha a pessoa",
      texto: "O menu, as telas e os dados passam a ser exatamente os que ela vê. A página recarrega na tela inicial dela.",
    },
    {
      icone: Lock,
      titulo: "Somente leitura",
      texto: "Nada pode ser salvo, aprovado ou enviado em nome dela. Início e fim ficam no Log de auditoria.",
    },
  ];
  return (
    <section aria-labelledby="sim-como-titulo" className="sim-como rounded-xl border border-border bg-card" data-testid="sim-como-funciona">
      <h2 id="sim-como-titulo" className="sr-only">Como funciona a simulação</h2>
      <ol className="sim-passos m-0 p-0 list-none">
        {passos.map((p, i) => (
          <li key={p.titulo} className="sim-passo">
            <span className="sim-passo-num" aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <p.icone className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />{p.titulo}
              </p>
              <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">{p.texto}</p>
            </div>
          </li>
        ))}
        <li className="sim-passo">
          <span className="sim-passo-num" aria-hidden="true">3</span>
          <div className="min-w-0">
            <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <LogOut className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />Para voltar a ser você
            </p>
            <p className="m-0 mt-0.5 text-xs leading-[18px] text-muted-foreground">
              Use o botão da faixa azul que fica no topo de todas as telas:
            </p>
            {/* Réplica (não clicável) da faixa global — reconhecer a saída antes de entrar. */}
            <div className="sim-replica mt-2" aria-hidden="true">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90">
                <Eye className="w-3 h-3" />Simulação
              </span>
              <span className="sim-replica-botao"><LogOut className="w-3 h-3" />Sair da simulação</span>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}

/** Já existe simulação ativa (ex.: o admin simula outro administrador e abre esta tela). */
export function JaSimulando({ nome }: { nome: string }) {
  return (
    <div role="status" className="pas-entra flex items-start gap-3 rounded-xl border border-warning-strong/40 bg-warning-soft px-4 py-3.5" data-testid="sim-ja-simulando">
      <span className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-card text-warning" aria-hidden="true">
        <Eye className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold text-foreground">Você já está vendo o sistema como {nome}</p>
        <p className="m-0 mt-0.5 text-xs leading-relaxed text-warning">
          Para escolher outra pessoa, saia primeiro pelo botão “Sair da simulação” na faixa azul do topo.
        </p>
      </div>
    </div>
  );
}
