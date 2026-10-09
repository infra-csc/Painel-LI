/**
 * Cadastro de usuários — escolha do perfil de acesso (redesenho 08/10).
 *
 * Rádios de verdade (uma parada de Tab, setas trocam, o react-hook-form foca
 * aqui quando falta o perfil) desenhados como linhas: ícone, nome, para quem
 * é e quantas telas abre. Logo abaixo, o menu que o perfil escolhido enxerga,
 * tirado da mesma fonte do menu lateral.
 */
import type { UseFormRegisterReturn } from "react-hook-form";
import { Check, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { telasDoPerfil, totalDeTelas, type Perfil } from "./perfis";
import { ListaDeTelas } from "./lista-de-telas";

export function EscolhaDePerfil({ perfis, valor, registro, erro, restrito }: {
  perfis: Perfil[];
  valor: string | undefined;
  registro: UseFormRegisterReturn;
  erro?: string;
  /** Quem cadastra não é administrador: só parte dos perfis aparece. */
  restrito: boolean;
}) {
  const escolhido = perfis.find((p) => p.value === valor);
  const telas = telasDoPerfil(escolhido?.value);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-labelledby="cad-perfil-titulo"
        aria-describedby={erro ? "cad-perfil-erro" : undefined}
        aria-invalid={!!erro || undefined}
        className={cn("cad-perfis rounded-lg border bg-card", erro ? "border-danger/50" : "border-border")}
        data-testid="cad-perfis"
      >
        {perfis.map((p) => {
          const marcado = valor === p.value;
          const n = totalDeTelas(telasDoPerfil(p.value));
          return (
            <label key={p.value} className={cn("cad-perfil", marcado && "cad-perfil-marcado")} data-testid={`cad-perfil-${p.value}`}>
              <input type="radio" value={p.value} className="cad-perfil-radio" {...registro} />
              <span className={cn("cad-perfil-icone", marcado ? "bg-primary text-primary-foreground" : "bg-brand-soft text-primary")} aria-hidden="true">
                <p.icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-5 text-foreground">{p.label}</span>
                <span className="block text-xs leading-[18px] text-muted-foreground">{p.resumo}</span>
              </span>
              <span className="cad-perfil-telas shrink-0 text-2xs tabular-nums text-muted-foreground">{n} telas</span>
              <span className={cn("cad-perfil-marca", marcado && "cad-perfil-marca-on")} aria-hidden="true">
                {marcado && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>

      {erro && <p id="cad-perfil-erro" role="alert" className="m-0 -mt-1 text-xs font-medium text-danger">{erro}</p>}

      {restrito && (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Administrador, Compras / Viagem e RH só são cadastrados por um administrador.
        </p>
      )}

      {/* O que o perfil escolhido enxerga — a resposta para "o que essa pessoa vai ver?". */}
      <div className="cad-telas rounded-lg bg-surface-muted px-3.5 py-3" aria-live="polite" data-testid="cad-telas">
        <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LayoutList className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          {escolhido ? <>O que {escolhido.label} vê no menu</> : "Telas liberadas"}
          {escolhido && <span className="font-normal text-muted-foreground">· {totalDeTelas(telas)} telas</span>}
        </p>
        {escolhido ? (
          <ListaDeTelas key={escolhido.value} grupos={telas} className="pas-entra mt-2" />
        ) : (
          <p className="m-0 mt-1 text-xs text-muted-foreground">Escolha um perfil para ver as telas que ele libera. Depois, só um administrador troca o perfil, em Usuários.</p>
        )}
      </div>
    </div>
  );
}
