// Extraído de system-settings.tsx em 25/09 (modularização); redesenho 08/10.
//
// Campos do formulário de Valores padrão (monetário com "R$", percentual com
// "%") e as peças de composição da tela (grupo e linha de ajuste). Folhas de
// apresentação, reutilizadas por todas as seções.
//
// 08/10 — o campo diz o próprio estado:
//  - parado, o número aparece em pt-BR ("1.257,63"); focado, vira texto de
//    edição ("1257,63"). O valor do formulário só muda quando a pessoa digita;
//  - alterado e ainda não salvo: borda âmbar, "antes R$ 465,00" e o botão de
//    desfazer só aquele campo (volta ao valor carregado do servidor);
//  - digitado igual ao salvo ("465,00" no lugar de "465.00"): ao sair do campo
//    ele volta a contar como não alterado — antes entrava na conta da barra;
//  - erro: borda vermelha, mensagem logo abaixo, `aria-invalid` no input.
import { useState, type ReactNode } from "react";
import { useFormContext, type Control, type ControllerRenderProps, type FieldPath } from "react-hook-form";
import { RotateCcw } from "lucide-react";
import { FormField } from "@/components/ui/form";
import { cn, parseBrNumber } from "@/lib/utils";
import type { FormValues } from "./settings-schema";
import { normalizeDecimal } from "./settings-utils";
import { numeroParaEditar, numeroParaLer, valorParaLer } from "./settings-secoes";

type AnyFieldProps = ControllerRenderProps<FormValues, FieldPath<FormValues>>;

export interface SettingsFieldProps {
  control: Control<FormValues>;
  name: FieldPath<FormValues>;
  label: string;
  /** Mantido por compatibilidade; o rótulo agora tem cor única. */
  labelClass?: string;
  /** Linha de apoio abaixo do campo (some quando há alteração ou erro). */
  hint?: ReactNode;
  /** Nome completo para leitor de tela quando o rótulo visível é curto ("2 dias"). */
  rotuloAcessivel?: string;
  /** Rótulo só para leitor de tela (a grade já mostra o cabeçalho da coluna). */
  rotuloOculto?: boolean;
}

function CampoNumerico({
  control, name, label, hint, rotuloOculto, rotuloAcessivel, tipo,
}: SettingsFieldProps & { tipo: "moeda" | "percentual" }) {
  const { formState, resetField } = useFormContext<FormValues>();
  const [focado, setFocado] = useState(false);
  const salvo = (formState.defaultValues as Partial<FormValues> | undefined)?.[name];
  return (
    <FormField control={control} name={name} render={({ field, fieldState }) => {
      const f = field as AnyFieldProps;
      const alterado = fieldState.isDirty;
      const erro = fieldState.error?.message;
      const idApoio = `${name}-apoio`;
      const idErro = `${name}-erro`;
      const valorExibido = focado
        ? numeroParaEditar(f.value)
        : tipo === "moeda" ? numeroParaLer(f.value) : String(f.value ?? "");
      return (
        <div className="cfg-campo-bloco min-w-0" data-alterado={alterado || undefined} data-erro={erro ? true : undefined}>
          <label htmlFor={name} className={cn("cfg-rotulo", rotuloOculto && "cfg-rotulo-grade")} title={label}>
            {label}
          </label>
          <div className={cn("cfg-campo", alterado && "cfg-campo-alterado", erro && "cfg-campo-erro")}>
            {tipo === "moeda" && <span className="cfg-campo-unidade" aria-hidden="true">R$</span>}
            <input
              type="text"
              inputMode={tipo === "moeda" ? "decimal" : "numeric"}
              id={name}
              name={f.name}
              ref={f.ref}
              value={valorExibido}
              autoComplete="off"
              aria-label={rotuloAcessivel}
              aria-invalid={erro ? true : undefined}
              aria-describedby={[erro ? idErro : null, alterado || hint ? idApoio : null].filter(Boolean).join(" ") || undefined}
              onFocus={() => setFocado(true)}
              onBlur={() => {
                setFocado(false);
                f.onBlur();
                // Mesmo número do salvo, só escrito diferente: não é alteração.
                if (alterado && salvo !== undefined && String(f.value).trim() !== "" &&
                    parseBrNumber(String(f.value)) === parseBrNumber(String(salvo))) {
                  resetField(name);
                }
              }}
              onChange={e => f.onChange(normalizeDecimal(e.target.value))}
              className="cfg-campo-input"
            />
            {tipo === "percentual" && <span className="cfg-campo-unidade cfg-campo-sufixo" aria-hidden="true">%</span>}
          </div>
          {erro ? (
            <p id={idErro} className="cfg-apoio text-danger" role="alert">{erro}</p>
          ) : alterado ? (
            <p id={idApoio} className="cfg-apoio cfg-apoio-alterado">
              <span className="truncate">antes <span className="tabular-nums">{valorParaLer(name, salvo as string | undefined)}</span></span>
              <button
                type="button"
                onClick={() => resetField(name)}
                className="cfg-desfazer"
                aria-label={`Desfazer a alteração de ${label}: voltar para ${valorParaLer(name, salvo as string | undefined)}`}
                title="Desfazer"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
              </button>
            </p>
          ) : hint ? (
            <p id={idApoio} className="cfg-apoio text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      );
    }} />
  );
}

// Campo monetário com <label htmlFor> apontando para o input (a11y).
export function MoneyField(props: SettingsFieldProps) {
  return <CampoNumerico {...props} tipo="moeda" />;
}

// Percentual inteiro (0..100) com sufixo "%". NÃO é monetário.
export function PercentField(props: SettingsFieldProps) {
  return <CampoNumerico {...props} tipo="percentual" />;
}

/** Selo "N alteradas" (seção/grupo com alteração não salva). */
export function SeloAlteradas({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn("cfg-selo pas-entra inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-warning-soft text-2xs font-semibold text-warning whitespace-nowrap", className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-warning-strong" aria-hidden="true" />
      {n} {n === 1 ? "alterada" : "alteradas"}
    </span>
  );
}

export interface GrupoDeAjustesProps {
  id: string;
  titulo: string;
  descricao?: ReactNode;
  /** Alterações não salvas dentro do grupo. */
  alteradas?: number;
  /** Ação/infos à direita do título. */
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Um grupo da tela: título (h2) + o que ele controla e, abaixo, as linhas de
 * ajuste separadas por filetes. Sem ícone colorido nem sombra — o título e a
 * ordem dizem o que é.
 */
export function GrupoDeAjustes({ id, titulo, descricao, alteradas = 0, extra, children, className, ...rest }: GrupoDeAjustesProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={cn("cfg-grupo rounded-xl border border-border bg-card", className)} data-testid={rest["data-testid"]}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pt-4 pb-3.5 border-b border-border max-sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 id={`${id}-titulo`} className="m-0 text-[15px] font-semibold leading-6 text-foreground">{titulo}</h2>
            <SeloAlteradas n={alteradas} />
          </div>
          {descricao && <p className="m-0 mt-0.5 max-w-[760px] text-xs leading-5 text-muted-foreground">{descricao}</p>}
        </div>
        {extra}
      </header>
      {children}
    </section>
  );
}

export interface LinhaDeAjusteProps {
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  /** Conteúdo abaixo dos campos (total calculado, nota). */
  rodape?: ReactNode;
  /** Quantas colunas de campo no máximo (a grade encolhe sozinha). */
  colunas?: 2 | 3 | 4;
  className?: string;
}

/**
 * Linha de ajuste: à esquerda o que é e onde vale, à direita os campos.
 * Na largura estreita (medida pelo grupo, não pela janela) empilha.
 */
export function LinhaDeAjuste({ titulo, descricao, children, rodape, colunas = 3, className }: LinhaDeAjusteProps) {
  return (
    <div className={cn("cfg-linha", className)}>
      <div className="cfg-linha-texto">
        <h3 className="m-0 text-sm font-medium leading-5 text-foreground">{titulo}</h3>
        {descricao && <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">{descricao}</p>}
      </div>
      <div className="min-w-0">
        <div className={cn("cfg-campos", `cfg-campos-${colunas}`)}>{children}</div>
        {rodape}
      </div>
    </div>
  );
}
