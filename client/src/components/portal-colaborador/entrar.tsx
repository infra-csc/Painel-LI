/**
 * Entrar (CPF + senha) e Primeiro acesso / esqueci a senha (CPF + código de 6
 * dígitos + senha nova). As mensagens de erro vêm do servidor como estão — ele
 * nunca diz se o CPF tem cadastro.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Clock, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { isApiError } from "@/lib/queryClient";
import { entrar, mensagemDoErro, primeiroAcesso } from "./api";
import { codigoDeSeisDigitos, mascararCpf, regrasDaSenha, soDigitos } from "./formatos";
import { Aviso, BotaoPrincipal, BotaoTexto, CampoDeSenha, CampoDoPortal, MarcaDoPortal } from "./pecas";
import type { EuDoPortal } from "./tipos";

/** Moldura das telas sem sessão: coluna única no celular, cartão centralizado do tablet em diante. */
export function MolduraPublica({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background md:items-center md:justify-center md:py-12">
      <main id="conteudo" className="casca-surgir w-full px-5 pb-10 pt-8 md:max-w-[440px] md:rounded-2xl md:border md:border-border md:bg-card md:px-9 md:py-9 md:shadow-2">
        {children}
      </main>
      {rodape && <p className="m-0 px-5 pb-8 text-center text-xs leading-relaxed text-muted-foreground md:mt-5 md:max-w-[440px] md:pb-0">{rodape}</p>}
    </div>
  );
}

function Cabecalho({ titulo, descricao, acima }: { titulo: string; descricao: ReactNode; acima?: ReactNode }) {
  return (
    <div className="mb-7">
      {acima}
      <div className="mb-6 flex items-center gap-2.5">
        <MarcaDoPortal tamanho={36} />
        <p className="m-0 text-sm font-semibold tracking-tight text-primary">Portal do colaborador</p>
      </div>
      <h1 className="m-0 text-[26px] font-bold leading-tight tracking-tight text-foreground">{titulo}</h1>
      <p className="m-0 mt-2 text-[15px] leading-relaxed text-muted-foreground">{descricao}</p>
    </div>
  );
}

function Campo({ id, rotulo, erro, ajuda, children }: { id: string; rotulo: string; erro?: string | null; ajuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">{rotulo}</label>
      {children}
      {erro ? <p id={`${id}-erro`} className="m-0 text-[13px] font-medium text-danger">{erro}</p> : ajuda}
    </div>
  );
}

const RODAPE = "Seus dados ficam protegidos. Dúvidas sobre o acesso? Fale com o DP ou com o produtor do evento.";

// ── Entrar ──────────────────────────────────────────────────────────────────

export function TelaEntrar({ aoEntrar, sessaoExpirada }: { aoEntrar: (eu: EuDoPortal) => void; sessaoExpirada?: boolean }) {
  const [, navegar] = useLocation();
  const ids = { cpf: useId(), senha: useId(), erro: useId() };
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erroCpf, setErroCpf] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<{ texto: string; bloqueado: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cpfRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const semCpf = soDigitos(cpf).length !== 11 ? "Digite os 11 números do CPF." : null;
    const semSenha = !senha ? "Digite a sua senha." : null;
    setErroCpf(semCpf);
    setErroSenha(semSenha);
    setErro(null);
    if (semCpf) return cpfRef.current?.focus();
    if (semSenha) return senhaRef.current?.focus();
    setEnviando(true);
    try {
      aoEntrar(await entrar(soDigitos(cpf), senha));
    } catch (falha) {
      setErro({ texto: mensagemDoErro(falha, "Não foi possível entrar agora. Tente de novo."), bloqueado: isApiError(falha) && falha.status === 429 });
      setSenha("");
      senhaRef.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraPublica rodape={RODAPE}>
      <Cabecalho titulo="Entrar" descricao="Registre a sua presença no evento e confirme os dias trabalhados." />

      {sessaoExpirada && !erro && (
        <Aviso role="status" tom="atencao" icone={Clock} titulo="Sua sessão terminou" className="mb-5">
          Entre de novo para continuar de onde parou.
        </Aviso>
      )}
      {erro && (
        <Aviso id={ids.erro} role="alert" tom="erro" titulo={erro.bloqueado ? "Muitas tentativas" : "Não foi possível entrar"} className="mb-5">
          {erro.texto}
          {erro.bloqueado && " Aguarde alguns minutos e tente de novo."}
        </Aviso>
      )}

      <form onSubmit={enviar} noValidate className="space-y-5">
        <Campo id={ids.cpf} rotulo="CPF" erro={erroCpf}>
          <CampoDoPortal
            ref={cpfRef}
            id={ids.cpf}
            name="cpf"
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => { setCpf(mascararCpf(e.target.value)); setErroCpf(null); }}
            invalido={!!erroCpf}
            aria-describedby={erroCpf ? `${ids.cpf}-erro` : undefined}
          />
        </Campo>
        <Campo id={ids.senha} rotulo="Senha" erro={erroSenha}>
          <CampoDeSenha
            ref={senhaRef}
            id={ids.senha}
            name="senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => { setSenha(e.target.value); setErroSenha(null); }}
            invalido={!!erroSenha || !!erro}
            aria-describedby={erroSenha ? `${ids.senha}-erro` : erro ? ids.erro : undefined}
          />
        </Campo>
        <BotaoPrincipal type="submit" carregando={enviando} textoCarregando="Entrando…" icone={LogIn}>Entrar</BotaoPrincipal>
      </form>

      <div className="mt-6 border-t border-border pt-5 text-center">
        <p className="m-0 text-sm text-muted-foreground">É a primeira vez ou esqueceu a senha?</p>
        <BotaoTexto onClick={() => navegar("/primeiro-acesso")} className="mt-1">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Primeiro acesso ou esqueci a senha
        </BotaoTexto>
      </div>
    </MolduraPublica>
  );
}

// ── Primeiro acesso / esqueci a senha ───────────────────────────────────────

export function TelaPrimeiroAcesso({ aoEntrar }: { aoEntrar: (eu: EuDoPortal) => void }) {
  const [, navegar] = useLocation();
  const ids = { cpf: useId(), codigo: useId(), senha: useId(), repetir: useId(), regras: useId(), erro: useId() };
  const [cpf, setCpf] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erros, setErros] = useState<Partial<Record<"cpf" | "codigo" | "senha" | "repetir", string>>>({});
  const [erro, setErro] = useState<{ texto: string; bloqueado: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const refs = { cpf: useRef<HTMLInputElement>(null), codigo: useRef<HTMLInputElement>(null), senha: useRef<HTMLInputElement>(null), repetir: useRef<HTMLInputElement>(null) };
  const regras = regrasDaSenha(senha);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const novos: typeof erros = {};
    if (soDigitos(cpf).length !== 11) novos.cpf = "Digite os 11 números do CPF.";
    if (codigo.length !== 6) novos.codigo = "O código tem 6 números.";
    if (!regras.every((r) => r.ok)) novos.senha = "A senha ainda não segue a regra abaixo.";
    else if (repetir !== senha) novos.repetir = "As duas senhas não são iguais.";
    setErros(novos);
    setErro(null);
    const primeiro = (["cpf", "codigo", "senha", "repetir"] as const).find((k) => novos[k]);
    if (primeiro) return refs[primeiro].current?.focus();
    setEnviando(true);
    try {
      const eu = await primeiroAcesso(soDigitos(cpf), codigo, senha);
      navegar("/", { replace: true });
      aoEntrar(eu);
    } catch (falha) {
      setErro({ texto: mensagemDoErro(falha, "Não foi possível criar a senha agora. Tente de novo."), bloqueado: isApiError(falha) && falha.status === 429 });
    } finally {
      setEnviando(false);
    }
  }

  const limpar = (k: keyof typeof erros) => setErros((x) => ({ ...x, [k]: undefined }));

  return (
    <MolduraPublica rodape={RODAPE}>
      <Cabecalho
        acima={(
          <BotaoTexto onClick={() => navegar("/")} className="-ml-2 mb-4 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar para entrar
          </BotaoTexto>
        )}
        titulo="Criar senha"
        descricao="Na primeira vez, ou se esqueceu a senha, use o código de acesso para criar uma senha nova."
      />

      <Aviso tom="info" icone={ShieldCheck} titulo="Onde conseguir o código" className="mb-6">
        Peça ao DP ou ao produtor do evento. São 6 números, valem por 72 horas e servem uma vez só.
      </Aviso>

      {erro && (
        <Aviso id={ids.erro} role="alert" tom="erro" titulo={erro.bloqueado ? "Muitas tentativas" : "Não foi possível criar a senha"} className="mb-5">
          {erro.texto}
          {erro.bloqueado && " Aguarde alguns minutos e tente de novo."}
        </Aviso>
      )}

      <form onSubmit={enviar} noValidate className="space-y-5">
        <Campo id={ids.cpf} rotulo="CPF" erro={erros.cpf}>
          <CampoDoPortal
            ref={refs.cpf} id={ids.cpf} name="cpf" inputMode="numeric" autoComplete="username" placeholder="000.000.000-00"
            value={cpf} onChange={(e) => { setCpf(mascararCpf(e.target.value)); limpar("cpf"); }}
            invalido={!!erros.cpf} aria-describedby={erros.cpf ? `${ids.cpf}-erro` : undefined}
          />
        </Campo>
        <Campo id={ids.codigo} rotulo="Código de acesso" erro={erros.codigo}>
          <CampoDoPortal
            ref={refs.codigo} id={ids.codigo} name="codigo" inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
            value={codigo}
            onChange={(e) => { setCodigo(codigoDeSeisDigitos(e.target.value)); limpar("codigo"); }}
            onPaste={(e) => {
              // Colar o texto inteiro ("Seu código: 123 456") fica só com os 6 números.
              const colado = e.clipboardData.getData("text");
              if (colado) { e.preventDefault(); setCodigo(codigoDeSeisDigitos(colado)); limpar("codigo"); }
            }}
            invalido={!!erros.codigo} aria-describedby={erros.codigo ? `${ids.codigo}-erro` : undefined}
            className="text-center font-mono text-xl tracking-[0.45em] md:text-xl placeholder:tracking-[0.45em]"
          />
        </Campo>
        <Campo
          id={ids.senha}
          rotulo="Senha nova"
          erro={erros.senha}
          ajuda={null}
        >
          <CampoDeSenha
            ref={refs.senha} id={ids.senha} name="nova-senha" autoComplete="new-password"
            value={senha} onChange={(e) => { setSenha(e.target.value); limpar("senha"); }}
            invalido={!!erros.senha} aria-describedby={`${erros.senha ? `${ids.senha}-erro ` : ""}${ids.regras}`}
          />
          <ul id={ids.regras} aria-label="Regra da senha" className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
            {regras.map((r) => (
              <li key={r.id} className={cn("flex items-center gap-1.5 text-[13px] font-medium transition-colors", r.ok ? "text-success" : "text-muted-foreground")}>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border transition-colors", r.ok ? "border-success-strong bg-success-strong text-white" : "border-border bg-card")} aria-hidden="true">
                  {r.ok && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                {r.texto}
                <span className="sr-only">{r.ok ? " (ok)" : " (falta)"}</span>
              </li>
            ))}
          </ul>
        </Campo>
        <Campo id={ids.repetir} rotulo="Repita a senha nova" erro={erros.repetir}>
          <CampoDeSenha
            ref={refs.repetir} id={ids.repetir} name="repetir-senha" autoComplete="new-password"
            value={repetir} onChange={(e) => { setRepetir(e.target.value); limpar("repetir"); }}
            invalido={!!erros.repetir} aria-describedby={erros.repetir ? `${ids.repetir}-erro` : undefined}
          />
        </Campo>
        <BotaoPrincipal type="submit" carregando={enviando} textoCarregando="Criando a senha…" icone={KeyRound}>Criar senha e entrar</BotaoPrincipal>
      </form>
    </MolduraPublica>
  );
}
