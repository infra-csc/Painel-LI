/**
 * Conserto de nomes e cidades com erro de codificação (dono, 15/09: "corrigir
 * possíveis erros de nomes" — ex.: "PRISCILA ELIAS DA SILVAÂ").
 *
 * Os erros vêm de planilhas importadas com a codificação trocada: o texto
 * UTF-8 foi lido como Latin-1/Windows-1252 e gravado assim. Cada letra
 * acentuada virou DUAS ("ã" → "Ã£", "é" → "Ã©"), o espaço especial virou "Â"
 * e, em alguns casos, um dos dois caracteres se perdeu ("CONCEIÇÃO" →
 * "CONCEIÃÃO", "BRASÍLIA" → "BRASÃLIA").
 *
 * `corrigirTextoDeNome` só faz o que dá para desfazer COM CERTEZA: devolve cada
 * par quebrado à letra original, tira o "Â" que sobrou do espaço especial,
 * recupera o "ÇÃO" e arruma os espaços. O que perdeu informação de verdade
 * ("BRASÃLIA") não é adivinhado — `pareceComErro` aponta para revisão manual.
 *
 * Nunca mexe em maiúsculas/minúsculas nem em acento correto: "SÃO PAULO",
 * "JOÃO", "Ângela" e "CÂMARA" saem iguais.
 */

/** Caracteres do Windows-1252 nas posições 0x80–0x9F → o byte que eles eram. */
const CP1252_PARA_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

const byteDe = (ch: string): number | null => {
  const c = ch.charCodeAt(0);
  if (c < 0x100) return c;
  return CP1252_PARA_BYTE[c] ?? null;
};

/** Segundo caractere de um par quebrado: byte de continuação 0x80–0xBF, visto como Latin-1 ou Windows-1252. */
const CONTINUACAO =
  "[\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC" +
  "\\u2013\\u2014\\u2018-\\u201A\\u201C-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]";
/** Par quebrado: primeiro byte de uma letra de 2 bytes (0xC2–0xDF) + continuação. */
const PAR_QUEBRADO = new RegExp("[\\u00C2-\\u00DF]" + CONTINUACAO, "g");
const PAR_QUEBRADO_1 = new RegExp("[\\u00C2-\\u00DF]" + CONTINUACAO);

const decoder = new TextDecoder("utf-8", { fatal: true });

/** "Ã£" → "ã". Se o par não formar UMA letra válida, fica como está. */
function decodificarPar(par: string): string {
  const a = byteDe(par[0]);
  const b = byteDe(par[1]);
  if (a === null || b === null || b < 0x80 || b > 0xbf) return par;
  try {
    const s = decoder.decode(new Uint8Array([a, b]));
    return s.length === 1 ? s : par;
  } catch {
    return par;
  }
}

export function corrigirTextoDeNome(texto: string): string {
  let s = texto;
  // Apóstrofo de 3 bytes quebrado ("D’Ávila" → "Dâ€™Ávila").
  s = s.replace(/â€™/g, "'");
  // Letras de 2 bytes quebradas.
  s = s.replace(PAR_QUEBRADO, decodificarPar);
  // "Â" que sobrou do espaço especial ("SILVAÂ", "DAÂ SILVA"). Â legítimo
  // ("Ângela", "CÂMARA") vem sempre antes de letra e não é tocado.
  s = s.replace(/Â(?=[\s ]|$)/g, "");
  // "ÇÃO" que perdeu o byte do Ç no caminho ("CONCEIÃÃO").
  s = s.replace(/ÃÃO/g, "ÇÃO").replace(/Ãão/g, "ção");
  // Espaços: especial vira normal, repetidos viram um, pontas somem.
  s = s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Sobrou algo que a correção automática não resolve e precisa de olho humano:
 * caractere de substituição, par ainda quebrado, "Ã" antes de letra que não
 * forma "ÃO/ÃE/ÃS" ("BRASÃLIA") ou "Â" solto.
 */
export function pareceComErro(texto: string): boolean {
  return /�/.test(texto)
    || PAR_QUEBRADO_1.test(texto)
    || /Ã(?=[A-DF-NP-RT-Za-df-np-rt-z])/.test(texto)
    || /Â(?![A-Za-zÀ-ÿ])/.test(texto);
}
