/**
 * Portal do colaborador — /colaborador (27/10, Fase 1 do Módulo de Honorários).
 *
 * Ata de 22/10: "cada colaborador acessa o app com CPF e senha; check-in e
 * check-out diários com selfie". Quem usa: freela ou produtor da casa, no
 * celular, na arena. Sessão própria (server/colaborador-sessao.ts), fora do
 * menu e do login internos.
 *
 * A rota é aninhada (`nest` no App.tsx); aqui dentro os caminhos são relativos:
 *   /                       Entrar → Termo (LGPD) → Meus eventos
 *   /primeiro-acesso        CPF + código de 6 dígitos + senha nova
 *   /evento/:id             os dias, check-in/check-out, valores, confirmação
 *   /evento/:id/confirmar   a confirmação final (dias, CNPJ, contestação)
 *
 * Peças em client/src/components/portal-colaborador/.
 */
import { useCallback, useEffect, useState } from "react";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, SearchX, WifiOff } from "lucide-react";
import { deveTentarDeNovo } from "@/lib/queryClient";
import { usePageTitle } from "@/components/common/use-page-title";
import {
  buscarEu, buscarPrestacoes, CHAVE_DO_PORTAL, CHAVE_EU, CHAVE_PRESTACOES, ehErroDeRede, EVENTO_SESSAO_EXPIRADA, mensagemDoErro, sair,
} from "@/components/portal-colaborador/api";
import { TelaEntrar, TelaPrimeiroAcesso, MolduraPublica } from "@/components/portal-colaborador/entrar";
import { TelaDoTermo } from "@/components/portal-colaborador/termo";
import { TelaMeusEventos } from "@/components/portal-colaborador/meus-eventos";
import { TelaDoEvento, VoltarPara } from "@/components/portal-colaborador/evento";
import { TelaDeConfirmacao } from "@/components/portal-colaborador/confirmar";
import { ProvedorDeMarcacao } from "@/components/portal-colaborador/marcacao";
import { Aviso, BotaoSecundario, CascaDoPortal, Carregando } from "@/components/portal-colaborador/pecas";
import type { EuDoPortal, PrestacoesDoPortal } from "@/components/portal-colaborador/tipos";

const titulo = (t: string) => `${t} · Portal do colaborador`;

function Titulo({ texto }: { texto: string }) {
  usePageTitle(titulo(texto), false);
  return null;
}

/** Esqueleto da lista enquanto as prestações chegam (sinal fraco demora). */
function EsqueletoDaLista() {
  return (
    <div role="status" aria-label="Carregando os seus eventos" className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-7 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="space-y-2.5">
        {[0, 1].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}

function ErroAoCarregar({ erro, aoTentar, tentando }: { erro: unknown; aoTentar: () => void; tentando: boolean }) {
  const rede = ehErroDeRede(erro);
  return (
    <div className="pt-6">
      <Aviso
        role="alert"
        tom={rede ? "atencao" : "erro"}
        icone={rede ? WifiOff : undefined}
        titulo={rede ? "Sem conexão" : "Não foi possível carregar"}
      >
        {rede ? "Não conseguimos falar com o servidor. Confira o sinal e tente de novo." : mensagemDoErro(erro)}
      </Aviso>
      <BotaoSecundario className="mt-4" icone={RefreshCw} onClick={aoTentar} disabled={tentando}>
        {tentando ? "Tentando…" : "Tentar de novo"}
      </BotaoSecundario>
    </div>
  );
}

function NaoEncontrado() {
  return (
    <div>
      <Titulo texto="Evento não encontrado" />
      <VoltarPara texto="Meus eventos" para="/" />
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <SearchX className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <p className="m-0 mt-3 text-base font-semibold">Evento não encontrado</p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">Ele pode ter saído da sua lista. Volte para Meus eventos.</p>
      </div>
    </div>
  );
}

function RotaDoEvento({ dados, confirmar }: { dados: PrestacoesDoPortal; confirmar?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const p = dados.prestacoes.find((x) => x.id === id);
  if (!p) return <NaoEncontrado />;
  return confirmar ? (
    <><Titulo texto={`Confirmar · ${p.evento.nome}`} /><TelaDeConfirmacao key={p.id} p={p} cnpjs={dados.cnpjs} /></>
  ) : (
    <><Titulo texto={p.evento.nome} /><TelaDoEvento p={p} hoje={dados.hoje} /></>
  );
}

function AreaLogada({ eu }: { eu: EuDoPortal }) {
  const consulta = useQuery({
    queryKey: CHAVE_PRESTACOES,
    queryFn: buscarPrestacoes,
    staleTime: 30_000,
    retry: deveTentarDeNovo,
  });
  const [local] = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [local]);

  if (consulta.isPending) return <><Titulo texto="Meus eventos" /><EsqueletoDaLista /></>;
  if (consulta.isError && !consulta.data) {
    return <ErroAoCarregar erro={consulta.error} aoTentar={() => void consulta.refetch()} tentando={consulta.isFetching} />;
  }
  const dados = consulta.data!;
  return (
    <ProvedorDeMarcacao eu={eu}>
      <Switch>
        <Route path="/">
          <Titulo texto="Meus eventos" />
          <TelaMeusEventos eu={eu} dados={dados} />
        </Route>
        <Route path="/evento/:id/confirmar"><RotaDoEvento dados={dados} confirmar /></Route>
        <Route path="/evento/:id"><RotaDoEvento dados={dados} /></Route>
        <Route><Redirect to="/" replace /></Route>
      </Switch>
    </ProvedorDeMarcacao>
  );
}

export default function PortalDoColaborador() {
  const queryClient = useQueryClient();
  const [, navegar] = useLocation();
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [erroAoSair, setErroAoSair] = useState<string | null>(null);
  const eu = useQuery({ queryKey: CHAVE_EU, queryFn: buscarEu, staleTime: 5 * 60_000, retry: deveTentarDeNovo });

  // 401 em qualquer chamada: a sessão acabou (inatividade, DP desativou) → volta para Entrar com aviso.
  useEffect(() => {
    const aoExpirar = () => {
      if (!queryClient.getQueryData(CHAVE_EU)) return;
      setSessaoExpirada(true);
      queryClient.removeQueries({ queryKey: CHAVE_PRESTACOES });
      queryClient.setQueryData(CHAVE_EU, null);
      navegar("/", { replace: true });
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, [queryClient, navegar]);

  const aoEntrar = useCallback((dados: EuDoPortal) => {
    setSessaoExpirada(false);
    queryClient.removeQueries({ queryKey: CHAVE_PRESTACOES });
    queryClient.setQueryData(CHAVE_EU, dados);
  }, [queryClient]);

  async function aoSair() {
    setSaindo(true);
    setErroAoSair(null);
    try {
      await sair();
    } catch (falha) {
      if (ehErroDeRede(falha)) {
        setErroAoSair("Sem conexão: não deu para sair agora. Tente de novo quando o sinal voltar.");
        setSaindo(false);
        return;
      }
    }
    queryClient.removeQueries({ queryKey: CHAVE_DO_PORTAL });
    queryClient.setQueryData(CHAVE_EU, null);
    setSessaoExpirada(false);
    setSaindo(false);
    navegar("/", { replace: true });
  }

  if (eu.isPending) {
    return <div className="min-h-dvh bg-background"><Titulo texto="Entrar" /><Carregando /></div>;
  }

  if (eu.isError && eu.data === undefined) {
    return (
      <MolduraPublica>
        <Titulo texto="Sem conexão" />
        <ErroAoCarregar erro={eu.error} aoTentar={() => void eu.refetch()} tentando={eu.isFetching} />
      </MolduraPublica>
    );
  }

  if (!eu.data) {
    return (
      <Switch>
        <Route path="/primeiro-acesso">
          <Titulo texto="Criar senha" />
          <TelaPrimeiroAcesso aoEntrar={aoEntrar} />
        </Route>
        <Route path="/">
          <Titulo texto="Entrar" />
          <TelaEntrar aoEntrar={aoEntrar} sessaoExpirada={sessaoExpirada} />
        </Route>
        {/* Link de um evento sem sessão: entra e volta para o início. */}
        <Route><Redirect to="/" replace /></Route>
      </Switch>
    );
  }

  return (
    <CascaDoPortal nome={eu.data.colaborador.nome} aoSair={() => void aoSair()} saindo={saindo}>
      {erroAoSair && <Aviso role="alert" tom="atencao" icone={WifiOff} className="mb-4">{erroAoSair}</Aviso>}
      {eu.data.termo.aceito ? (
        <AreaLogada eu={eu.data} />
      ) : (
        <><Titulo texto="Termo de uso" /><TelaDoTermo eu={eu.data} /></>
      )}
    </CascaDoPortal>
  );
}
