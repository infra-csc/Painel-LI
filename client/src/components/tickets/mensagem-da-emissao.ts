// Texto do toast do "Marcar como emitida" / "Desfazer emissão" (POST /api/tickets/emitidas).
//
// 22/10 (vaga #4401): desfazer numa passagem que era SÓ o carimbo apaga a
// linha e devolve a vaga para "Comprar" — a tela precisa dizer isso, senão
// quem clicou acha que a passagem continua lá.

export interface RespostaDaEmissao {
  ok: string[];
  pulados: { id: string; motivo: string }[];
  /** Vagas cuja linha de passagem era só o carimbo e foi apagada (desfazer). */
  removidas?: string[];
  /** Status novo das vagas que voltaram para "Comprar". */
  statusPorVaga?: Record<string, string>;
}

export const TEXTO_VAZIA_REMOVIDA = "A passagem vazia foi removida e a vaga voltou para Comprar";

const vagas = (n: number) => (n === 1 ? "1 vaga" : `${n} vagas`);

export function mensagemDaEmissao(res: RespostaDaEmissao, emitida: boolean): { title: string; description: string } {
  const n = res.ok?.length ?? 0;
  if (emitida) {
    return {
      title: `${n} passagem(ns) marcada(s) como emitida(s)`,
      description: "Se a área pedir ajuste de data depois disso e o aprovador aprovar, Compras recebe o aviso para remarcar. O preenchimento dos dados continua liberado.",
    };
  }
  const removidas = res.removidas ?? [];
  const status = res.statusPorVaga ?? {};
  const voltaram = removidas.filter((id) => !!status[id]).length;
  const soRemovidas = removidas.length - voltaram;
  const soCarimbo = Math.max(0, n - removidas.length);

  if (removidas.length === 0) {
    return { title: `${n} passagem(ns) voltaram para "não emitida"`, description: "As passagens voltaram para \"não emitida\"." };
  }
  if (n === 1) {
    return voltaram === 1
      ? { title: TEXTO_VAZIA_REMOVIDA, description: "Ela tinha só o carimbo de emitida, sem nenhum dado preenchido." }
      : { title: "A passagem vazia foi removida", description: "Ela tinha só o carimbo de emitida. O status da vaga não mudou: outra passagem ou o transporte terrestre ainda cobre a vaga." };
  }
  const partes: string[] = [];
  if (voltaram > 0) partes.push(`Em ${vagas(voltaram)}, a passagem vazia foi removida e a vaga voltou para Comprar.`);
  if (soRemovidas > 0) partes.push(`Em ${vagas(soRemovidas)}, a passagem vazia foi removida; o status não mudou.`);
  if (soCarimbo > 0) partes.push(`Em ${vagas(soCarimbo)}, só o carimbo saiu: os dados da passagem continuam.`);
  return { title: `${n} passagem(ns) voltaram para "não emitida"`, description: partes.join(" ") };
}
