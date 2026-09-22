/**
 * O dia da PROVA dentro do período do evento (dono, 22/09: "o evento sempre
 * ocorre sábado ou domingo — geralmente domingo, um ou outro é sábado").
 *
 * O cadastro guarda uma JANELA ("22/09 a 28/09"), que é montagem + prova +
 * desmontagem: a data de início é quase sempre terça ou quarta. Quem fala "o
 * evento é dia 27" fala do dia da prova.
 *
 * Regra, conferida nos 232 eventos da base (22/09): último DOMINGO dentro da
 * janela (226 casos); sem domingo, o último SÁBADO (1 caso); sem fim de semana
 * nenhum, a data de fim (2 casos, um deles um evento de teste).
 *
 * Quando o sábado anterior também está na janela, a janela da prova vai de
 * sábado a domingo — há evento que acontece nos dois dias.
 */

const MS_DIA = 86_400_000;

/** "2026-09-27" ou "2026-09-27T00:00:00.000Z" → Date de meia-noite LOCAL. */
function dia(valor: string | Date | null | undefined): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  const m = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** O dia da prova (Date local) ou null quando o evento não tem datas. */
export function diaDaProva(inicio: string | Date | null | undefined, fim: string | Date | null | undefined): Date | null {
  const de = dia(inicio);
  const ate = dia(fim) ?? de;
  if (!de || !ate) return de ?? ate ?? null;
  const [primeiro, ultimo] = de <= ate ? [de, ate] : [ate, de];
  let domingo: Date | null = null;
  let sabado: Date | null = null;
  for (let t = ultimo.getTime(); t >= primeiro.getTime(); t -= MS_DIA) {
    const d = new Date(t);
    if (!domingo && d.getDay() === 0) domingo = d;
    if (!sabado && d.getDay() === 6) sabado = d;
    if (domingo) break; // domingo manda; o sábado só serve se não houver domingo
  }
  return domingo ?? sabado ?? ultimo;
}

/** O mesmo, em "AAAA-MM-DD". */
export function diaDaProvaISO(inicio: string | Date | null | undefined, fim: string | Date | null | undefined): string | null {
  const d = diaDaProva(inicio, fim);
  return d ? iso(d) : null;
}

/**
 * A janela da prova: normalmente um dia só; sábado + domingo quando o sábado
 * anterior também está dentro do período do evento.
 */
export function janelaDaProva(inicio: string | Date | null | undefined, fim: string | Date | null | undefined): { de: Date; ate: Date } | null {
  const prova = diaDaProva(inicio, fim);
  if (!prova) return null;
  const comeco = dia(inicio);
  if (prova.getDay() === 0 && comeco) {
    const sabado = new Date(prova.getTime() - MS_DIA);
    if (sabado >= comeco) return { de: sabado, ate: prova };
  }
  return { de: prova, ate: prova };
}
