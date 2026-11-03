/**
 * Check-in e check-out com selfie.
 *
 * O fluxo mora num PROVEDOR na raiz do portal (não no botão): depois do envio
 * a lista recarrega e o botão "Fazer check-in" some — se o diálogo morasse no
 * botão, a confirmação "registrado às 07:55" sumiria junto.
 *
 * Passos: botão → câmera frontal do celular (`capture="user"`) → foto reduzida
 * no navegador → prévia (enquanto isso, o GPS) → enviar → hora do servidor.
 * Falhou a rede? A foto continua guardada e "Tentar de novo" reenvia a mesma.
 *
 * Localização (29/10, decisão do dono): no modo "exigir" — o padrão — sem
 * localização o app NÃO avança: o envio fica bloqueado com a explicação do
 * motivo (negada / tempo / GPS desligado) e "Tentar de novo" pede de novo.
 * Nos modos "registrar" e "nao_registrar" o comportamento antigo segue.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ImageOff, Loader2, MapPin, MapPinOff, RefreshCw, Send, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { exigeLocalizacao, pedeLocalizacao } from "@shared/presenca";
import { isApiError } from "@/lib/queryClient";
import { CHAVE_EU, CHAVE_PRESTACOES, codigoDoErro, ehErroDeRede, enviarMarcacao, mensagemDoErro } from "./api";
import { obterLocalizacao, prepararFoto, type ResultadoDaLocalizacao } from "./captura";
import { dataCurta, diaDaSemanaCurto, ROTULO_DA_MARCACAO } from "./formatos";
import { Aviso, BotaoPrincipal, BotaoSecundario, BotaoTexto } from "./pecas";
import type { EuDoPortal, TipoDeMarcacao } from "./tipos";

export interface AlvoDaMarcacao {
  actualId: string;
  dia: string;
  tipo: TipoDeMarcacao;
  evento: string;
}

type Etapa =
  | { nome: "preparando" }
  | { nome: "previa" }
  | { nome: "enviando" }
  | { nome: "sucesso"; hora: string }
  | { nome: "erro"; texto: string; rede: boolean; reenviar: boolean; novaFoto: boolean };

type MotivoSemLocalizacao = Extract<ResultadoDaLocalizacao, { ok: false }>["motivo"];
type EstadoDaLocalizacao =
  | { nome: "desligada" | "buscando" | "pronta" }
  | { nome: "sem"; motivo: MotivoSemLocalizacao };

/** O que dizer (e o que fazer) quando a localização é obrigatória e não veio. */
export function textoDaLocalizacaoObrigatoria(motivo: MotivoSemLocalizacao): string {
  switch (motivo) {
    case "negada":
      return "A localização está bloqueada para este site. Nas configurações do navegador do celular, permita a localização para este site e toque em “Tentar de novo”.";
    case "tempo":
      return "Não deu tempo de pegar a localização. Confira se o GPS do celular está ligado, vá para um lugar com sinal melhor e toque em “Tentar de novo”.";
    case "sem_suporte":
      return "Este navegador não informa a localização. Abra o app no Chrome ou no Safari do celular e tente de novo.";
    default:
      return "O celular não conseguiu achar a localização. Ligue a localização (GPS) do celular, permita para este site nas configurações do navegador e toque em “Tentar de novo”.";
  }
}

interface ContextoDaMarcacao {
  /** Abre a câmera (chame DENTRO do clique: o navegador só abre a câmera com gesto do usuário). */
  comFoto: (alvo: AlvoDaMarcacao) => void;
  /** Sem selfie (só quando o DP desligou a selfie obrigatória). */
  semFoto: (alvo: AlvoDaMarcacao) => void;
  selfieObrigatoria: boolean;
}

const Contexto = createContext<ContextoDaMarcacao | null>(null);

export function useMarcacao(): ContextoDaMarcacao {
  const c = useContext(Contexto);
  if (!c) throw new Error("useMarcacao fora do ProvedorDeMarcacao");
  return c;
}

export function ProvedorDeMarcacao({ eu, children }: { eu: EuDoPortal; children: ReactNode }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = useState<AlvoDaMarcacao | null>(null);
  const alvoPendente = useRef<AlvoDaMarcacao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>({ nome: "preparando" });
  const [foto, setFoto] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [local, setLocal] = useState<EstadoDaLocalizacao>({ nome: "desligada" });
  const pedidoDeLocal = useRef<Promise<ResultadoDaLocalizacao> | null>(null);
  const modoDeLocal = eu.configuracao.localizacao;
  const pedirLocal = pedeLocalizacao(modoDeLocal);
  const exigirLocal = exigeLocalizacao(modoDeLocal);

  // URL da prévia: criada a cada foto nova e liberada depois.
  useEffect(() => {
    if (!foto) { setPrevia(null); return; }
    const url = URL.createObjectURL(foto);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const pedirLocalizacao = useCallback(() => {
    if (!pedirLocal) { setLocal({ nome: "desligada" }); pedidoDeLocal.current = null; return; }
    // Já tem uma localização boa desta abertura: não pergunta de novo.
    if (pedidoDeLocal.current) return;
    setLocal({ nome: "buscando" });
    const pedido = obterLocalizacao();
    pedidoDeLocal.current = pedido;
    void pedido.then((r) => {
      if (pedidoDeLocal.current !== pedido) return; // pedido antigo: já veio outro (ou fechou)
      if (!r.ok) pedidoDeLocal.current = null; // falhou: a próxima foto / "Tentar de novo" pede de novo
      setLocal(r.ok ? { nome: "pronta" } : { nome: "sem", motivo: r.motivo });
    });
  }, [pedirLocal]);

  /** "Tentar de novo" da localização: pede outra vez (a foto continua guardada). */
  const tentarLocalizacaoDeNovo = useCallback(() => {
    pedidoDeLocal.current = null;
    pedirLocalizacao();
  }, [pedirLocalizacao]);

  const abrirCamera = useCallback((novo: AlvoDaMarcacao) => {
    alvoPendente.current = novo;
    const input = inputRef.current;
    if (!input) return;
    input.value = ""; // permite escolher a "mesma" foto de novo
    input.click();
  }, []);

  const comFoto = useCallback((novo: AlvoDaMarcacao) => abrirCamera(novo), [abrirCamera]);

  const semFoto = useCallback((novo: AlvoDaMarcacao) => {
    pedidoDeLocal.current = null;
    setAlvo(novo);
    setFoto(null);
    setEtapa({ nome: "previa" });
    setAberto(true);
    pedirLocalizacao();
  }, [pedirLocalizacao]);

  async function aoEscolherArquivo(arquivo: File | undefined) {
    const novo = alvoPendente.current;
    if (!arquivo || !novo) return; // cancelou a câmera
    if (!aberto || alvo?.actualId !== novo.actualId || alvo?.dia !== novo.dia || alvo?.tipo !== novo.tipo) pedidoDeLocal.current = null;
    setAlvo(novo);
    setAberto(true);
    setEtapa({ nome: "preparando" });
    pedirLocalizacao();
    try {
      setFoto(await prepararFoto(arquivo));
      setEtapa({ nome: "previa" });
    } catch (falha) {
      setFoto(null);
      setEtapa({ nome: "erro", texto: falha instanceof Error ? falha.message : "Não consegui ler essa foto. Tire outra.", rede: false, reenviar: false, novaFoto: true });
    }
  }

  async function enviar() {
    if (!alvo) return;
    setEtapa({ nome: "enviando" });
    const r = pedidoDeLocal.current ? await pedidoDeLocal.current : null;
    // Exigida e sem ela: não envia nada — volta para a prévia com o aviso e o botão de tentar de novo.
    if (exigirLocal && !(r && r.ok)) {
      setLocal({ nome: "sem", motivo: r && !r.ok ? r.motivo : "indisponivel" });
      setEtapa({ nome: "previa" });
      return;
    }
    const localizacao = r && r.ok ? { lat: r.lat, lng: r.lng, precisao: r.precisao } : null;
    try {
      const resposta = await enviarMarcacao({ actualId: alvo.actualId, dia: alvo.dia, tipo: alvo.tipo, foto, localizacao });
      const marcada = alvo.tipo === "entrada" ? resposta.entrada : resposta.saida;
      setEtapa({ nome: "sucesso", hora: marcada?.hora ?? "" });
      void queryClient.invalidateQueries({ queryKey: CHAVE_PRESTACOES });
    } catch (falha) {
      const rede = ehErroDeRede(falha);
      const status = isApiError(falha) ? falha.status : 0;
      if (codigoDoErro(falha) === "localizacao_obrigatoria") {
        // O servidor recusou por falta de localização (a tela já devia ter bloqueado): mesmo bloqueio.
        setLocal({ nome: "sem", motivo: "negada" });
        setEtapa({ nome: "previa" });
        // Tela aberta antes da mudança ainda acha que a localização é opcional.
        void queryClient.invalidateQueries({ queryKey: CHAVE_EU });
        return;
      }
      if (codigoDoErro(falha) === "termo_pendente") void queryClient.invalidateQueries({ queryKey: CHAVE_EU });
      if (status === 409) void queryClient.invalidateQueries({ queryKey: CHAVE_PRESTACOES });
      setEtapa({
        nome: "erro",
        texto: rede ? "A foto continua aqui. Quando o sinal melhorar, toque em “Tentar de novo”." : mensagemDoErro(falha),
        rede,
        reenviar: rede || status >= 500,
        novaFoto: status === 413 || status === 415 || codigoDoErro(falha) === "selfie_obrigatoria",
      });
    }
  }

  const travado = etapa.nome === "enviando" || etapa.nome === "preparando";
  function fechar() {
    if (travado) return;
    setAberto(false);
    pedidoDeLocal.current = null;
  }
  // Ao fechar de vez, solta a foto da memória.
  useEffect(() => { if (!aberto) { const t = setTimeout(() => setFoto(null), 250); return () => clearTimeout(t); } }, [aberto]);

  const valor = useMemo<ContextoDaMarcacao>(() => ({ comFoto, semFoto, selfieObrigatoria: eu.configuracao.selfieObrigatoria }), [comFoto, semFoto, eu.configuracao.selfieObrigatoria]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="portal-camera"
        onChange={(e) => void aoEscolherArquivo(e.target.files?.[0])}
      />
      <DialogoDaMarcacao
        aberto={aberto}
        aoFechar={fechar}
        travado={travado}
        alvo={alvo}
        etapa={etapa}
        previa={previa}
        temFoto={!!foto}
        local={local}
        exigirLocal={exigirLocal}
        aoTentarLocal={tentarLocalizacaoDeNovo}
        aoEnviar={() => void enviar()}
        aoTirarOutra={() => alvo && abrirCamera(alvo)}
      />
    </Contexto.Provider>
  );
}

function LinhaDaLocalizacao({ local, exigirLocal }: { local: EstadoDaLocalizacao; exigirLocal: boolean }) {
  if (local.nome === "desligada") return null;
  if (exigirLocal && local.nome === "sem") return null; // o bloqueio abaixo explica
  if (local.nome === "buscando") {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Pegando a localização…
      </p>
    );
  }
  if (local.nome === "pronta") {
    return (
      <p className="m-0 flex items-center gap-2 text-sm font-medium text-success">
        <MapPin className="h-4 w-4" aria-hidden="true" /> Localização pronta
      </p>
    );
  }
  return (
    <p className="m-0 flex items-start gap-2 text-sm text-muted-foreground">
      <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Sem localização — tudo bem, o produtor confere.</span>
    </p>
  );
}

function DialogoDaMarcacao({ aberto, aoFechar, travado, alvo, etapa, previa, temFoto, local, exigirLocal, aoTentarLocal, aoEnviar, aoTirarOutra }: {
  aberto: boolean; aoFechar: () => void; travado: boolean; alvo: AlvoDaMarcacao | null; etapa: Etapa;
  previa: string | null; temFoto: boolean; local: EstadoDaLocalizacao; exigirLocal: boolean;
  aoTentarLocal: () => void; aoEnviar: () => void; aoTirarOutra: () => void;
}) {
  // Localização exigida e não veio: nada de enviar — só tentar de novo.
  const semLocalObrigatoria = exigirLocal && local.nome === "sem" && etapa.nome === "previa";
  const rotulo = alvo ? ROTULO_DA_MARCACAO[alvo.tipo] : ROTULO_DA_MARCACAO.entrada;
  const quando = alvo ? `${diaDaSemanaCurto(alvo.dia)}, ${dataCurta(alvo.dia)}` : "";
  const titulo = etapa.nome === "sucesso" ? rotulo.feito
    : etapa.nome === "erro" ? (etapa.rede ? "Sem conexão" : `Não deu para registrar o ${rotulo.nome}`)
      : temFoto || etapa.nome === "preparando" ? "Confira a foto" : `Registrar ${rotulo.nome}`;

  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content

          onEscapeKeyDown={(e) => { if (travado) e.preventDefault(); }}
          onInteractOutside={(e) => { if (travado) e.preventDefault(); }}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background outline-none md:bg-card",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=open]:fade-in-0 motion-reduce:animate-none",
            "md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[92dvh] md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-hidden md:rounded-2xl md:border md:border-border md:shadow-3",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <div className="min-w-0 flex-1 py-1">
              <DialogPrimitive.Title className="m-0 text-[17px] font-semibold leading-tight">{titulo}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="m-0 mt-0.5 truncate text-[13px] text-muted-foreground">
                {alvo ? `${rotulo.nome[0].toUpperCase()}${rotulo.nome.slice(1)} · ${quando} · ${alvo.evento}` : ""}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              disabled={travado}
              className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 [&>*]:flex-1">
            {etapa.nome === "sucesso" ? (
              <div role="status" aria-live="polite" className="flex min-h-full flex-col items-center justify-center px-2 pb-6 pt-6 text-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-soft ring-8 ring-success-soft/50">
                  <CheckCircle2 className="h-11 w-11 text-success-strong" aria-hidden="true" />
                </span>
                <p className="m-0 mt-6 text-lg font-semibold">{rotulo.feito}</p>
                {etapa.hora && <p className="m-0 mt-1 text-[44px] font-bold leading-none tracking-tight tabular-nums">{etapa.hora}</p>}
                <p className="m-0 mt-3 text-[15px] text-muted-foreground">
                  {alvo?.tipo === "saida" ? "Obrigado pelo dia de trabalho!" : "Bom trabalho! Na saída, faça o check-out."}
                </p>
                {local.nome === "sem" && !exigirLocal && (
                  <p className="m-0 mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPinOff className="h-4 w-4" aria-hidden="true" /> Sem localização — tudo bem, o produtor confere.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-2xl bg-muted md:max-w-[300px]">
                  {previa ? (
                    <img src={previa} alt="Prévia da sua selfie" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      {etapa.nome === "preparando" ? (
                        <><Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="text-sm">Preparando a foto…</span></>
                      ) : (
                        <><ImageOff className="h-7 w-7" aria-hidden="true" /><span className="text-sm">{etapa.nome === "erro" && etapa.novaFoto ? "Sem foto" : "Registro sem foto"}</span></>
                      )}
                    </div>
                  )}
                  {etapa.nome === "enviando" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/45 text-white backdrop-blur-[1px]">
                      <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      <span className="text-sm font-medium">Enviando…</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-center"><LinhaDaLocalizacao local={local} exigirLocal={exigirLocal} /></div>
                {semLocalObrigatoria && local.nome === "sem" && (
                  <Aviso role="alert" tom="atencao" icone={MapPinOff} titulo="Precisamos da sua localização" id="portal-sem-localizacao">
                    {textoDaLocalizacaoObrigatoria(local.motivo)}
                  </Aviso>
                )}
                {etapa.nome === "erro" && (
                  <Aviso role="alert" tom={etapa.rede ? "atencao" : "erro"} icone={etapa.rede ? WifiOff : undefined} titulo={etapa.rede ? "Não conseguimos falar com o servidor" : undefined}>
                    {etapa.texto}
                  </Aviso>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {etapa.nome === "sucesso" ? (
              <BotaoPrincipal type="button" onClick={aoFechar} autoFocus>Pronto</BotaoPrincipal>
            ) : etapa.nome === "erro" ? (
              etapa.reenviar ? (
                <>
                  <BotaoPrincipal type="button" onClick={aoEnviar} icone={RefreshCw}>Tentar de novo</BotaoPrincipal>
                  {temFoto && <BotaoSecundario onClick={aoTirarOutra} icone={Camera}>Tirar outra foto</BotaoSecundario>}
                </>
              ) : etapa.novaFoto ? (
                <BotaoPrincipal type="button" onClick={aoTirarOutra} icone={Camera}>Tirar outra foto</BotaoPrincipal>
              ) : (
                <BotaoPrincipal type="button" onClick={aoFechar}>Fechar</BotaoPrincipal>
              )
            ) : semLocalObrigatoria ? (
              <>
                <BotaoPrincipal type="button" onClick={aoTentarLocal} icone={RefreshCw}>Tentar de novo</BotaoPrincipal>
                {temFoto && (
                  <BotaoTexto onClick={aoTirarOutra} className="w-full text-muted-foreground hover:text-foreground">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Tirar outra foto
                  </BotaoTexto>
                )}
              </>
            ) : (
              <>
                <BotaoPrincipal
                  type="button"
                  onClick={aoEnviar}
                  disabled={etapa.nome === "preparando"}
                  carregando={etapa.nome === "enviando"}
                  textoCarregando="Enviando…"
                  icone={Send}
                >
                  Enviar {rotulo.nome}
                </BotaoPrincipal>
                {temFoto && (
                  <BotaoTexto onClick={aoTirarOutra} disabled={travado} className="w-full text-muted-foreground hover:text-foreground">
                    <Camera className="h-4 w-4" aria-hidden="true" /> Tirar outra foto
                  </BotaoTexto>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** O botão grande de check-in/check-out de um dia. */
export function BotaoDeMarcacao({ alvo, className }: { alvo: AlvoDaMarcacao; className?: string }) {
  const { comFoto, semFoto, selfieObrigatoria } = useMarcacao();
  const rotulo = ROTULO_DA_MARCACAO[alvo.tipo];
  return (
    <div className={className}>
      <BotaoPrincipal type="button" onClick={() => comFoto(alvo)} icone={Camera}>{rotulo.botao}</BotaoPrincipal>
      {!selfieObrigatoria ? (
        <BotaoTexto onClick={() => semFoto(alvo)} className="mt-1 w-full text-muted-foreground hover:text-foreground">
          Registrar sem foto
        </BotaoTexto>
      ) : (
        <p className="m-0 mt-2 text-center text-[13px] text-muted-foreground">Abre a câmera da frente para uma selfie.</p>
      )}
    </div>
  );
}
