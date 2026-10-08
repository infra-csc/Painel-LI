/**
 * As telas que um perfil enxerga, por grupo do menu (redesenho 08/10) — usada
 * no Cadastro de usuários (perfil escolhido) e na confirmação do "Ver como
 * usuário" (o que o admin vai ver). Grupo numa coluna, telas na outra.
 */
import type { GrupoDeTelas } from "./perfis";

export function ListaDeTelas({ grupos, className }: { grupos: GrupoDeTelas[]; className?: string }) {
  return (
    <dl className={`cad-telas-grade m-0 ${className ?? ""}`}>
      {grupos.map((g) => (
        <div key={g.titulo} className="contents">
          <dt className="pt-px text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{g.titulo}</dt>
          <dd className="m-0 text-xs leading-[18px] text-slate-700">{g.telas.join(" · ")}</dd>
        </div>
      ))}
    </dl>
  );
}
