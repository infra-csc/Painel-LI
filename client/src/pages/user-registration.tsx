/**
 * CADASTRO DE USUÁRIOS — redesenho 08/10.
 *
 * A casca das telas de Cadastros: barra de contexto de 56px grudada (título ·
 * como a pessoa entra · atalho para Usuários) e o formulário em três seções
 * com nome — Identificação, Perfil de acesso e Área — no desenho de linhas
 * de Valores padrão ("o que é" à esquerda, campos à direita quando cabe). O
 * perfil é um grupo de rádios de verdade que diz para quem ele é, quantas
 * telas abre e QUAIS (do mesmo modelo do menu lateral). À direita, o resumo da
 * conta que vai ser criada. O rodapé diz o que falta; o erro do servidor fica
 * no rodapé, ao lado do botão, e o e-mail repetido vai para o próprio campo.
 * Conta criada vira uma faixa na página com o próximo passo.
 *
 * Lógica intacta: mesmo schema, mesmo POST /api/users com o mesmo payload,
 * mesma invalidação de ["/api/users"], mesmo reset; os perfis oferecidos a
 * quem não é administrador são os mesmos (o servidor recusa os outros).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Mail, User, UserCog, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, getAvailableAreas } from "@/lib/role-utils";
import { normalizeRole } from "@shared/roles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { usePageTitle } from "@/components/common/use-page-title";
import { RequiredMark, OptionalMark } from "@/components/forms/required-mark";
import { PERFIS, perfilDe } from "@/components/user-registration/perfis";
import { EscolhaDePerfil } from "@/components/user-registration/escolha-de-perfil";
import { ResumoDoCadastro } from "@/components/user-registration/resumo-do-cadastro";
import {
  CadastroConcluido, EsqueletoDoCadastro, SemAcessoAoCadastro, type ContaCriada,
} from "@/components/user-registration/cadastro-estados";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  role: z.enum(["admin", "production", "function_area", "purchasing", "financial"], {
    required_error: "Selecione um perfil de acesso",
  }),
  area: z.string().optional(),
});

type FormData = z.infer<typeof schema>;


// Campo da família (Colaboradores): branco, borda fina, anel de foco da marca, erro em vermelho.
const CAMPO = "cad-campo w-full h-10 rounded-lg border border-input bg-card text-sm text-foreground outline-none placeholder:text-muted-foreground hover:border-slate-300 focus:border-primary focus:ring-[3px] focus:ring-primary/12 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:opacity-60";
const ROTULO = "block mb-1.5 text-xs font-medium text-slate-600";

/** Lista "a, b e c". */
function listaPorExtenso(itens: string[]) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export default function UserRegistration() {
  usePageTitle("Cadastro de usuários");
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [criado, setCriado] = useState<ContaCriada | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, setError, setFocus, clearErrors, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", area: "" },
  });

  const nameVal  = watch("name") || "";
  const emailVal = watch("email") || "";
  const roleVal  = watch("role");
  const areaVal  = watch("area") || "";

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal.trim());
  const selectedRole = perfilDe(roleVal);

  const mutation = useMutation({
    // apiRequest já lança em resposta não-ok (com .status e .body no erro).
    mutationFn: async (data: FormData) => {
      const r = await apiRequest("POST", "/api/users", data);
      return r.json();
    },
    onSuccess: (salvo: { name?: string; email?: string; role?: string } | null, enviado) => {
      // Sem isto a tela de Usuários continuava com a lista antiga até um F5.
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCriado({
        nome: salvo?.name || enviado.name,
        email: salvo?.email || enviado.email,
        perfil: perfilDe(salvo?.role || enviado.role),
      });
      reset();
    },
    onError: (e: unknown) => {
      // E-mail repetido é um problema do campo: a mensagem vai para ele.
      if (apiErrorStatus(e) === 409) {
        setError("email", { type: "server", message: "Já existe um usuário com este e-mail." }, { shouldFocus: true });
        return;
      }
      setErroServidor(apiErrorMessage(e, "Tente novamente."));
    },
  });

  // A faixa de sucesso é o primeiro bloco da página: volta ao topo e ela
  // recebe o foco (o leitor de tela anuncia; quem enviou lá embaixo a vê).
  useEffect(() => {
    if (!criado) return;
    document.getElementById("cad-concluido")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [criado]);

  const podeVerUsuarios = hasPermission(user, "canAccessAdminUsers");
  const permitido = hasPermission(user, "canCreateUsers");
  const ehAdmin = normalizeRole(user?.role) === "admin";

  const barra = (
    <PageHeader
      variant="bar"
      title="Cadastro de usuários"
      className="mx-0 mt-0 gap-x-3 max-sm:static"
      subtitle={<>
        <span className="sm:hidden">acesso pelo Portal Norte, sem senha</span>
        <span className="max-sm:hidden">a pessoa entra pelo Portal Norte com a conta Microsoft — sem senha</span>
      </>}
      actions={permitido && podeVerUsuarios ? (
        <Button asChild variant="outline" size="sm" className="pas-alvo h-[34px] rounded-lg max-sm:hidden">
          <Link href="/admin-users"><UserCog className="w-4 h-4" aria-hidden="true" />Usuários</Link>
        </Button>
      ) : undefined}
    />
  );

  const casca = (conteudo: ReactNode) => (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      {barra}
      <div className="px-[var(--page-gutter)] pt-5 pb-8">
        <div className="max-w-[1560px] mx-auto">{conteudo}</div>
      </div>
    </div>
  );

  if (authLoading) return casca(<EsqueletoDoCadastro />);

  // Espelha POST /api/users: admin, RH (financial) e Compras (purchasing).
  // Produção enxerga a lista de usuários, mas não cria — aviso em vez de 403.
  if (!permitido) {
    return casca(<SemAcessoAoCadastro logistica={normalizeRole(user?.role) === "production"} />);
  }

  // POST /api/users: quem não é admin só cria Logística Interna ou Área de Função (o servidor recusa o resto).
  const perfisOferecidos = PERFIS.filter((r) => ehAdmin || r.value === "production" || r.value === "function_area");

  const faltam = [
    nameVal.trim().length < 2 && "nome",
    !isEmailValid && "e-mail válido",
    !roleVal && "perfil",
  ].filter((x): x is string => !!x);
  const temAlgo = !!(nameVal || emailVal || roleVal || areaVal);

  const enviar = handleSubmit((d) => {
    if (mutation.isPending) return;
    setErroServidor(null);
    setCriado(null);
    mutation.mutate(d);
  });

  const limpar = () => {
    reset();
    clearErrors();
    setErroServidor(null);
  };

  const erroNome = errors.name?.message;
  const erroEmail = errors.email?.message;

  return casca(
    <div className="cad-pagina flex flex-col gap-4">
      {criado && (
        <CadastroConcluido
          conta={criado}
          podeVerUsuarios={podeVerUsuarios}
          onOutro={() => { setCriado(null); setFocus("name"); }}
          onFechar={() => setCriado(null)}
        />
      )}

      <div className="cad-grade">
        <form onSubmit={enviar} noValidate className="min-w-0" aria-label="Novo usuário" data-testid="cad-form">
          <div className="cad-cartao rounded-xl border border-border bg-card">

            {/* ── Identificação ── */}
            <section className="cad-secao" aria-labelledby="cad-sec-id">
              <div className="cad-secao-texto">
                <h2 id="cad-sec-id" className="cad-secao-titulo">Identificação</h2>
                <p className="cad-secao-ajuda">Como a pessoa aparece no sistema e o e-mail que a identifica no Portal Norte.</p>
              </div>
              <div className="cad-campos">
                <div>
                  <label htmlFor="user-name" className={ROTULO}>Nome completo<RequiredMark /></label>
                  <div className="relative">
                    <User className="cad-campo-icone" aria-hidden="true" />
                    <input
                      id="user-name"
                      placeholder="Ex.: Ana Silva"
                      autoComplete="off"
                      data-testid="input-name"
                      aria-required="true"
                      aria-invalid={!!erroNome}
                      aria-describedby={erroNome ? "user-name-erro" : undefined}
                      className={cn(CAMPO, "pl-9 pr-3")}
                      {...register("name")}
                    />
                  </div>
                  {erroNome && <p id="user-name-erro" role="alert" className="cad-erro">{erroNome}</p>}
                </div>

                <div>
                  <label htmlFor="user-email" className={ROTULO}>E-mail corporativo<RequiredMark /></label>
                  <div className="relative">
                    <Mail className={cn("cad-campo-icone", emailVal && isEmailValid && !erroEmail && "text-success-strong")} aria-hidden="true" />
                    <input
                      id="user-email"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="ana.silva@empresa.com"
                      data-testid="input-email"
                      aria-required="true"
                      aria-invalid={!!erroEmail}
                      aria-describedby={erroEmail ? "user-email-erro" : "user-email-ajuda"}
                      className={cn(CAMPO, "pl-9 pr-3")}
                      {...register("email")}
                    />
                  </div>
                  {erroEmail
                    ? <p id="user-email-erro" role="alert" className="cad-erro">{erroEmail}</p>
                    : <p id="user-email-ajuda" className="cad-ajuda">O mesmo da conta Microsoft da pessoa.</p>}
                </div>
              </div>
            </section>

            {/* ── Perfil de acesso ── */}
            <section className="cad-secao" aria-labelledby="cad-perfil-titulo">
              <div className="cad-secao-texto">
                <h2 id="cad-perfil-titulo" className="cad-secao-titulo">Perfil de acesso<RequiredMark /></h2>
                <p className="cad-secao-ajuda">Define o menu e o que a pessoa pode fazer em cada tela.</p>
              </div>
              <EscolhaDePerfil
                perfis={perfisOferecidos}
                valor={roleVal}
                registro={register("role")}
                // Rádio desmarcado chega ao zod como null (e não undefined): a única
                // falha possível do perfil é "nenhum escolhido" — a frase é a do schema.
                erro={errors.role ? "Selecione um perfil de acesso" : undefined}
                restrito={!ehAdmin}
              />
            </section>

            {/* ── Área ── */}
            <section className="cad-secao" aria-labelledby="cad-sec-area">
              <div className="cad-secao-texto">
                <h2 id="cad-sec-area" className="cad-secao-titulo">Área<OptionalMark /></h2>
                <p className="cad-secao-ajuda">A equipe a que a pessoa responde. Aparece na lista de Usuários.</p>
              </div>
              <div className="cad-area">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <label htmlFor="user-area" className="text-xs font-medium text-slate-600">Área específica</label>
                  <span className={cn("text-2xs tabular-nums", areaVal.length >= 72 ? "text-warning" : "text-muted-foreground")} aria-live="polite">{areaVal.length}/80</span>
                </div>
                {/* Input com sugestões (datalist) das áreas conhecidas — aceita valor livre */}
                <input
                  id="user-area"
                  list="user-area-options"
                  placeholder="Ex.: Técnica, Cenografia, Logística Interna…"
                  data-testid="input-area"
                  aria-describedby="user-area-ajuda"
                  maxLength={80}
                  autoComplete="off"
                  className={cn(CAMPO, "px-3 cad-campo-area")}
                  {...register("area")}
                />
                <datalist id="user-area-options">
                  {getAvailableAreas().map((a) => <option key={a} value={a} />)}
                </datalist>
                <p id="user-area-ajuda" className="cad-ajuda">Escolha uma sugestão ou escreva outra.</p>
              </div>
            </section>

            {/* ── Rodapé: o que falta, o erro do servidor e as ações ── */}
            <div className="cad-rodape">
              <div className="min-w-0 flex-1" aria-live="polite">
                {mutation.isPending ? (
                  <p className="m-0 text-xs text-muted-foreground">Criando a conta…</p>
                ) : erroServidor ? (
                  <p role="alert" className="pas-entra m-0 flex items-start gap-1.5 text-xs leading-relaxed text-danger" data-testid="cad-erro-servidor">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    <span><b className="font-semibold">Não foi possível criar o usuário.</b> {erroServidor}</span>
                  </p>
                ) : faltam.length > 0 ? (
                  <p className="m-0 text-xs text-muted-foreground" data-testid="cad-faltam">
                    Falta {listaPorExtenso(faltam)}.
                  </p>
                ) : (
                  <p className="pas-entra m-0 text-xs font-medium text-success" data-testid="cad-pronto">Tudo pronto para criar a conta.</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 max-sm:w-full">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={limpar}
                  data-testid="button-clear"
                  disabled={mutation.isPending || !temAlgo}
                  className="pas-alvo h-9 rounded-lg text-muted-foreground hover:text-foreground max-sm:flex-1"
                >
                  Limpar
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  aria-busy={mutation.isPending || undefined}
                  data-testid="button-submit"
                  className="cad-enviar pas-alvo h-9 rounded-lg px-4 font-semibold disabled:aria-busy:opacity-100 max-sm:flex-[2]"
                >
                  {mutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Criando…</>
                    : <><UserPlus className="w-4 h-4" aria-hidden="true" />Criar usuário</>}
                </Button>
              </div>
            </div>
          </div>
        </form>

        <aside className="cad-lateral" aria-label="Resumo do cadastro">
          <ResumoDoCadastro
            nome={nameVal}
            email={emailVal}
            emailValido={isEmailValid}
            perfil={selectedRole}
            area={areaVal}
          />
        </aside>
      </div>
    </div>,
  );
}
