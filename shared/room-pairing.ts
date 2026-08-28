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
 * Monta os quartos. Quem não encontra parceiro fica em individual — o que é
 * um resultado legítimo, não uma falha.
 */
export function sugerirQuartos(candidatos: RoomCandidate[], config: RoomPairingConfig): SuggestedRoom[] {
  const usados = new Set<string>();
  const quartos: SuggestedRoom[] = [];
  const maxPorQuarto = config.allowTripleRoom ? 3 : 2;

  for (let i = 0; i < candidatos.length; i++) {
    const a = candidatos[i];
    if (usados.has(a.collaboratorId)) continue;

    const parceiros = candidatos
      .slice(i + 1)
      .filter((b) => !usados.has(b.collaboratorId) && podemDividir(a, b, config))
      .sort((x, y) => {
        // Mesma função primeiro; depois quem divide mais noites.
        if (config.sameFunctionPriority) {
          const xf = x.functionId && x.functionId === a.functionId ? 0 : 1;
          const yf = y.functionId && y.functionId === a.functionId ? 0 : 1;
          if (xf !== yf) return xf - yf;
        }
        return noitesEmComum(a, y) - noitesEmComum(a, x);
      });

    const membros = [a];
    for (const p of parceiros) {
      if (membros.length >= maxPorQuarto) break;
      // Um triplo só fecha se TODOS se aceitam entre si.
      if (membros.every((m) => m === a || podemDividir(m, p, config))) {
        membros.push(p);
        usados.add(p.collaboratorId);
      }
    }
    usados.add(a.collaboratorId);

    const entradas = membros.map((m) => m.checkIn).filter((d): d is string => !!d);
    const saidas = membros.map((m) => m.checkOut).filter((d): d is string => !!d);
    const generoDoQuarto = membros.find((m) => conhecido(m.gender))?.gender;

    quartos.push({
      roomType: membros.length === 1 ? "single" : membros.length === 2 ? "double" : "triple",
      genderRule: generoDoQuarto === "male" ? "male" : generoDoQuarto === "female" ? "female" : "none",
      hotelName: a.hotelName,
      checkIn: entradas.length ? entradas.reduce((x, y) => (x < y ? x : y)) : null,
      checkOut: saidas.length ? saidas.reduce((x, y) => (x > y ? x : y)) : null,
      members: membros.map((m) => m.collaboratorId),
      sharedNights: membros.length > 1
        ? Math.min(...membros.slice(1).map((m) => noitesEmComum(membros[0], m)))
        : 1,
      partialOverlap: membros.length > 1 && membros.some((m) => m.checkIn !== a.checkIn || m.checkOut !== a.checkOut),
    });
  }

  return quartos;
}
