/**
 * Modal da vaga da Escalação aberto pela Aprovação de escala (23/10 — dono:
 * "tem que aparecer o modal da escalação aqui").
 *
 * É o MESMO modal da Escalação (abas, ‹ ›, permissões), montado com os mesmos
 * hooks: `useScalingData` para os dados e `useScalingModal` para o estado, as
 * mutations e salvar/confirmar. O que muda é de onde vêm as vagas:
 *  - a lista da navegação é a lista da aba da Aprovação (com os filtros dela);
 *  - as consultas da Escalação só correm depois da PRIMEIRA abertura — abrir a
 *    Aprovação continua custando só o que ela já custava;
 *  - a vaga que a lista não traz inteira (Fila de pedidos só tem o id) é
 *    buscada por id, na mesma chave que o detalhe do pedido já usa.
 *
 * Poder novo não existe aqui: o que o modal deixa editar é decidido pelas
 * regras dele (e a vaga em Validação de Escala abre só para leitura).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TeamInclusion } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { hasPermission } from "@/lib/role-utils";
import { DEFAULT_SCALING_FILTERS, useScalingData, type ScalingData } from "@/components/scaling/use-scaling-data";
import { useScalingModal } from "@/components/scaling/scaling-page/use-scaling-modal";
import { modalDataFromInclusion } from "@/components/scaling/scaling-utils";
import type { DetailsTab } from "@/components/scaling/inclusion-details-dialog";
import { APPROVAL_QUERY_KEYS, type StalledRow } from "../types";

/** Uma vaga da lista da aba: o id sempre; a vaga inteira quando a lista já a tem. */
export interface ItemDaVaga {
  id: string;
  vaga?: TeamInclusion | null;
}

/**
 * Linha de sugestão → vaga do modal. É o mesmo registro de `team_inclusions`
 * com campos a mais (canDecide, daysPending…); a única diferença de tipo é
 * `workDays`, que chega como texto nos dois casos (JSON).
 */
export const comoVaga = (row: StalledRow): TeamInclusion => row as unknown as TeamInclusion;

/** Itens da navegação a partir das linhas de sugestão da aba. */
export const itensDasSugestoes = (rows: StalledRow[]): ItemDaVaga[] => rows.map((r) => ({ id: r.id, vaga: comoVaga(r) }));

/** Mesma chave do detalhe do pedido (use-approval-vagas): o cache serve aos dois. */
const chaveDaVaga = (id: string) => [APPROVAL_QUERY_KEYS.teamInclusions, "uma", id] as const;

export function useVagaNaAprovacao(lista: ItemDaVaga[]) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  /** Todos os papéis que entram na Aprovação veem a Escalação — mas a trava fica aqui. */
  const podeVer = hasPermission(user, "canAccessScreen2");
  /** Liga as consultas da Escalação na primeira abertura e fica ligado (o cache segue vivo). */
  const [ativo, setAtivo] = useState(false);

  const data = useScalingData({ filters: DEFAULT_SCALING_FILTERS, sortConfig: null, user, enabled: ativo });
  const resolvidas = useMemo(() => lista.flatMap((i) => (i.vaga ? [i.vaga] : [])), [lista]);
  const modal = useScalingModal({ user, toast, data, visibleRows: resolvidas });

  /** Navegar para vaga com rascunho pede confirmação antes (mesma regra da Escalação). */
  const [descartePendente, setDescartePendente] = useState<ItemDaVaga | null>(null);
  /** Só a abertura mais recente vale: navegar rápido não deixa uma busca velha passar na frente. */
  const ultimaAbertura = useRef(0);

  const buscarVaga = useCallback(
    (item: ItemDaVaga): Promise<TeamInclusion> =>
      item.vaga
        ? Promise.resolve(item.vaga)
        : queryClient.fetchQuery<TeamInclusion>({
          queryKey: chaveDaVaga(item.id),
          queryFn: async () => (await apiRequest("GET", `${APPROVAL_QUERY_KEYS.teamInclusions}/${item.id}`)).json(),
          staleTime: 15_000,
        }),
    [queryClient],
  );

  const { openInclusion, setShowModal } = modal;
  const abrir = useCallback(async (item: ItemDaVaga, aba: DetailsTab = "resumo") => {
    if (!podeVer) return;
    setAtivo(true);
    const minha = ++ultimaAbertura.current;
    try {
      const vaga = await buscarVaga(item);
      if (minha !== ultimaAbertura.current) return;
      openInclusion(vaga, aba);
    } catch (err) {
      if (minha !== ultimaAbertura.current) return;
      toast({ title: "Não foi possível abrir a vaga", description: apiErrorMessage(err, "Tente de novo em instantes."), variant: "destructive" });
    }
  }, [podeVer, buscarVaga, openInclusion, toast]);

  const fechar = useCallback(() => setShowModal(false), [setShowModal]);

  const aberta = modal.showModal ? modal.selectedInclusion : null;
  /** Posição da vaga aberta na lista da aba — -1 quando ela saiu (decidida, filtrada). */
  const navIndex = aberta ? lista.findIndex((i) => i.id === aberta.id) : -1;
  const sujo = !!modal.selectedInclusion && JSON.stringify(modal.modalData) !== JSON.stringify(modalDataFromInclusion(modal.selectedInclusion));

  const navegar = (direcao: -1 | 1) => {
    if (navIndex < 0) return;
    const alvo = lista[navIndex + direcao];
    if (!alvo) return;
    if (sujo) { setDescartePendente(alvo); return; }
    void abrir(alvo);
  };
  const confirmarDescarte = () => {
    const alvo = descartePendente;
    setDescartePendente(null);
    if (alvo) void abrir(alvo);
  };

  /**
   * Depois de decidir pelo modal: a próxima vaga da lista (as decididas
   * puladas) ou, se era a última, a anterior; sem nenhuma, fecha. Vale só
   * quando a vaga aberta está entre as decididas — decidir outra vaga pela
   * linha não mexe no modal.
   */
  const depoisDeDecidir = (ids: string[]) => {
    if (!aberta || !ids.includes(aberta.id)) return;
    const fora = new Set(ids);
    const i = navIndex;
    const proxima = (i >= 0 ? lista.slice(i + 1) : lista).find((it) => !fora.has(it.id))
      ?? (i > 0 ? lista.slice(0, i).reverse().find((it) => !fora.has(it.id)) : undefined);
    if (proxima) void abrir(proxima);
    else fechar();
  };

  /**
   * Enquanto os colaboradores não chegam, o nome da vaga é "Carregando…" — e
   * não "Colaborador não encontrado", que afirmaria o que não se sabe.
   * Eventos e funções já estão no cache da própria Aprovação.
   */
  const dataDoModal: ScalingData = data.collaborators
    ? data
    : { ...data, getCollaboratorName: (id?: string | null) => (id ? "Carregando…" : "Não escalado") };

  return {
    user, modal, data: dataDoModal, lista, aberta, navIndex, abrir, fechar, navegar,
    descartePendente, setDescartePendente, confirmarDescarte, depoisDeDecidir,
    /** O modal foi aberto alguma vez — antes disso nada é montado. */
    montado: ativo,
    podeVer,
  };
}

export type VagaNaAprovacao = ReturnType<typeof useVagaNaAprovacao>;
