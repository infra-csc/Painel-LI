/**
 * Quem divide quarto com quem (28/08) — regra pura, sem banco, para poder ser
 * testada com casos reais.
 *
 * A regra antiga exigia check-in E check-out IDÊNTICOS. Conferindo com a
 * planilha de um evento real (Corrida Vale — Itabira), três dos oito quartos
 * duplos tinham datas diferentes: a equipe divide quarto pelas NOITES EM
 * COMUM, não por períodos iguais. Com a regra antiga, essas seis pessoas
 * viravam seis quartos individuais — o mais caro por pessoa que existe.
 *
 * Decisões do dono (28/08):
 * - basta haver noite em comum para dividir;
 * - sem gênero cadastrado, ainda assim pareia — mas só entre pessoas da MESMA
 *   FUNÇÃO, que é o critério prático de quem já divide quarto no evento;
 * - com gênero nos dois lados, ele manda: ninguém divide com outro gênero.
 */

export interface RoomCandidate {
  collaboratorId: string;
  /** "YYYY-MM-DD" — entrada e saída previstas desta pessoa. */
  checkIn: string | null;
  checkOut: string | null;
  hotelName: string | null;
  /** "male" | "female" | "unknown" | null */
  gender: string | null;
  functionId: string | null;
  functionName: string | null;
}

export interface RoomPairingConfig {
  allowTripleRoom: boolean;
  requireSameGenderForSharedRoom: boolean;
  /** Prioriza juntar gente da mesma função (pedido do dono). */
  sameFunctionPriority: boolean;
}

export interface SuggestedRoom {
  roomType: "single" | "double" | "triple";
  genderRule: "male" | "female" | "none";
  hotelName: string | null;
  /** Período em que o quarto fica ocupado: da primeira entrada à última saída. */
  checkIn: string | null;
  checkOut: string | null;
  members: string[];
  /** Noites que os ocupantes realmente dividem (1 quando é quarto individual). */
  sharedNights: number;
  /** Datas diferentes entre os ocupantes — a tela avisa para conferirem. */
  partialOverlap: boolean;
}

const conhecido = (g: string | null | undefined): boolean =>
  !!g && g !== "unknown" && g !== "";

/** Noites em comum entre dois períodos. Sem data em algum lado, devolve 0. */
export function noitesEmComum(a: RoomCandidate, b: RoomCandidate): number {
  if (!a.checkIn || !a.checkOut || !b.checkIn || !b.checkOut) return 0;
  const inicio = a.checkIn > b.checkIn ? a.checkIn : b.checkIn;
  const fim = a.checkOut < b.checkOut ? a.checkOut : b.checkOut;
  if (fim <= inicio) return 0;
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000;
  return Number.isFinite(dias) ? Math.max(0, Math.round(dias)) : 0;
}

/** Noites que a pessoa fica no hotel. Sem data, 0. */
export function noitesDaPessoa(a: RoomCandidate): number {
  if (!a.checkIn || !a.checkOut) return 0;
  const dias = (Date.parse(a.checkOut) - Date.parse(a.checkIn)) / 86400000;
  return Number.isFinite(dias) ? Math.max(0, Math.round(dias)) : 0;
}

/**
 * Noites que alguém dos dois passaria SOZINHO no quarto (02/10). Zero quando
 * as datas são iguais. É o critério que faltava: o dono viu "quinta com
 * sexta" num duplo enquanto havia outro "sexta" sobrando — os dois pares
 * dividiam 2 noites, empatavam, e o desempate era a ordem da lista.
 */
export function noitesSemDividir(a: RoomCandidate, b: RoomCandidate): number {
  return noitesDaPessoa(a) + noitesDaPessoa(b) - 2 * noitesEmComum(a, b);
}

/** Duas pessoas podem dividir o mesmo quarto? */
export function podemDividir(a: RoomCandidate, b: RoomCandidate, config: RoomPairingConfig): boolean {
  if ((a.hotelName || "") !== (b.hotelName || "")) return false;
  if (noitesEmComum(a, b) < 1) return false;

  if (!config.requireSameGenderForSharedRoom) return true;
  if (conhecido(a.gender) && conhecido(b.gender)) return a.gender === b.gender;

  // Falta o gênero de alguém: só junta quem faz a mesma coisa no evento.
  return !!a.functionId && a.functionId === b.functionId;
}

/**
 * Função de cenotécnica (09/10): nome sem acento/caixa contendo "cenotecnica".
 * "Sup Ceno" NÃO entra — o supervisor não divide o triplo da equipe.
 */
export function ehCenotecnica(nomeDaFuncao: string | null | undefined): boolean {
  if (!nomeDaFuncao) return false;
  return nomeDaFuncao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("cenotecnica");
}

/**
 * Quantas pessoas cabem num quarto com estes ocupantes. Triplo com a chave
 * global ligada, ou — mesmo com ela desligada — quando TODOS são de
 * cenotécnica (pedido do dono, 09/10). Nunca mais de 3.
 */
export function capacidadeDoQuarto(funcoes: (string | null | undefined)[], allowTripleRoom: boolean): 2 | 3 {
  if (allowTripleRoom) return 3;
  return funcoes.length > 0 && funcoes.every(ehCenotecnica) ? 3 : 2;
}

/** Tipo do quarto pelo número de ocupantes (1 single, 2 duplo, 3 triplo). */
export function tipoPorOcupantes(n: number): "single" | "double" | "triple" {
  return n <= 1 ? "single" : n === 2 ? "double" : "triple";
}

/**
 * Por que estes ocupantes NÃO podem ficar num mesmo quarto (null = podem).
 * Usado pelo "Mover" — a sugestão já monta dentro do limite.
 */
export function motivoDeLotacao(funcoes: (string | null | undefined)[], allowTripleRoom: boolean): string | null {
  const n = funcoes.length;
  if (n >= 4) return "Um quarto comporta no máximo 3 pessoas.";
  if (n === 3 && capacidadeDoQuarto(funcoes, allowTripleRoom) < 3) {
    return "Quarto triplo só para a equipe de cenotécnica — os três ocupantes precisam ser de cenotécnica.";
  }
  return null;
}

/**
 * Noites que TODOS os ocupantes passam juntos — o cruzamento dos períodos
 * (09/10). Antes era o menor par com o primeiro ocupante, que num triplo
 * contava noites que o segundo e o terceiro não dividiam.
 */
export function noitesEmComumDeTodos(periodos: { checkIn: string | null; checkOut: string | null }[]): number {
  if (periodos.length === 0 || periodos.some((p) => !p.checkIn || !p.checkOut)) return 0;
  const inicio = periodos.map((p) => p.checkIn as string).reduce((x, y) => (x > y ? x : y));
  const fim = periodos.map((p) => p.checkOut as string).reduce((x, y) => (x < y ? x : y));
  if (fim <= inicio) return 0;
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000;
  return Number.isFinite(dias) ? Math.max(0, Math.round(dias)) : 0;
}

/** Começo da observação automática — a tela reconhece e recalcula ao vivo. */
export const PREFIXO_DATAS_DIFERENTES = "Datas diferentes entre os ocupantes";

/**
 * Observação do quarto quando os ocupantes têm datas diferentes — a mesma
 * frase no recálculo (gravada em `notes`) e na tela (calculada com as datas
 * que as linhas mostram). Null quando as datas são iguais ou é individual.
 */
export function observacaoDeDatas(periodos: { checkIn: string | null; checkOut: string | null }[]): string | null {
  if (periodos.length < 2) return null;
  const [p0] = periodos;
  if (periodos.every((p) => p.checkIn === p0.checkIn && p.checkOut === p0.checkOut)) return null;
  const n = noitesEmComumDeTodos(periodos);
  return `${PREFIXO_DATAS_DIFERENTES} — ${n} ${n === 1 ? "noite" : "noites"} em comum. Confirme entrada/saída com o hotel.`;
}

/**
 * Fechar este triplo deixaria exatamente UMA pessoa que poderia dividir com o
 * dono do quarto sem ninguém para dividir? Então é melhor parar no duplo.
 */
function deixariaAlguemSozinho(
  candidatos: RoomCandidate[], i: number, usados: Set<string>, noQuarto: RoomCandidate[], a: RoomCandidate, config: RoomPairingConfig,
): boolean {
  const ocupados = new Set(noQuarto.map((m) => m.collaboratorId));
  const restantes = candidatos.slice(i + 1).filter((x) => !usados.has(x.collaboratorId) && !ocupados.has(x.collaboratorId));
  const doGrupo = restantes.filter((x) => podemDividir(a, x, config));
  if (doGrupo.length !== 1) return false;
  const [sobra] = doGrupo;
  return !restantes.some((y) => y !== sobra && podemDividir(sobra, y, config));
}

/**
 * Monta os quartos. Quem não encontra parceiro fica em individual — o que é
 * um resultado legítimo, não uma falha.
 *
 * Cenotécnica (09/10): fecha triplo quando os três são de cenotécnica, mesmo
 * com a chave global desligada — mas sem deixar alguém sozinho por causa
 * disso: 3 → 3, 4 → 2+2, 5 → 3+2, 6 → 3+3, 7 → 3+2+2.
 */
export function sugerirQuartos(candidatos: RoomCandidate[], config: RoomPairingConfig): SuggestedRoom[] {
  const usados = new Set<string>();
  const quartos: SuggestedRoom[] = [];

  for (let i = 0; i < candidatos.length; i++) {
    const a = candidatos[i];
    if (usados.has(a.collaboratorId)) continue;

    const parceiros = candidatos
      .slice(i + 1)
      .filter((b) => !usados.has(b.collaboratorId) && podemDividir(a, b, config))
      .sort((x, y) => {
        // 1º mesmas datas — "quinta com quinta e sexta com sexta" (dono,
        // 02/10): quem deixa menos noites sem dividir; 2º mesma função;
        // 3º quem divide mais noites.
        const sx = noitesSemDividir(a, x);
        const sy = noitesSemDividir(a, y);
        if (sx !== sy) return sx - sy;
        if (config.sameFunctionPriority) {
          const xf = x.functionId && x.functionId === a.functionId ? 0 : 1;
          const yf = y.functionId && y.functionId === a.functionId ? 0 : 1;
          if (xf !== yf) return xf - yf;
        }
        return noitesEmComum(a, y) - noitesEmComum(a, x);
      });

    const membros = [a];
    for (const p of parceiros) {
      if (membros.length >= 3) break;
      // Um triplo só fecha se TODOS se aceitam entre si.
      if (!membros.every((m) => m === a || podemDividir(m, p, config))) continue;
      if (membros.length === 2) {
        const funcoes = [...membros, p].map((m) => m.functionName);
        if (capacidadeDoQuarto(funcoes, config.allowTripleRoom) < 3) continue;
        // Triplo de cenotécnica não deixa UMA pessoa do grupo sem par: nesse
        // caso ficam dois duplos (4 → 2+2, e não 3+1).
        if (funcoes.every(ehCenotecnica) && deixariaAlguemSozinho(candidatos, i, usados, [...membros, p], a, config)) break;
      }
      membros.push(p);
      usados.add(p.collaboratorId);
    }
    usados.add(a.collaboratorId);

    const entradas = membros.map((m) => m.checkIn).filter((d): d is string => !!d);
    const saidas = membros.map((m) => m.checkOut).filter((d): d is string => !!d);
    const generoDoQuarto = membros.find((m) => conhecido(m.gender))?.gender;

    quartos.push({
      roomType: tipoPorOcupantes(membros.length),
      genderRule: generoDoQuarto === "male" ? "male" : generoDoQuarto === "female" ? "female" : "none",
      hotelName: a.hotelName,
      checkIn: entradas.length ? entradas.reduce((x, y) => (x < y ? x : y)) : null,
      checkOut: saidas.length ? saidas.reduce((x, y) => (x > y ? x : y)) : null,
      members: membros.map((m) => m.collaboratorId),
      // Noites que os ocupantes passam JUNTOS — num triplo, o cruzamento dos três.
      sharedNights: membros.length > 1 ? noitesEmComumDeTodos(membros) : 1,
      partialOverlap: membros.length > 1 && membros.some((m) => m.checkIn !== a.checkIn || m.checkOut !== a.checkOut),
    });
  }

  return quartos;
}
