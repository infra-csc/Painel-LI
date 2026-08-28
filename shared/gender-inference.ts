/**
 * Palpite de gênero pelo PRIMEIRO NOME (28/08).
 *
 * Existe por um motivo prático: nenhum dos colaboradores tem gênero
 * cadastrado, e sem esse dado a sugestão de quarto não separa homens de
 * mulheres. Em vez de exigir 864 cadastros preenchidos à mão, o sistema
 * arrisca um palpite — mas só quando tem certeza.
 *
 * A regra é DELIBERADAMENTE conservadora: na dúvida devolve `null`, e quem
 * chama trata como "não sei" (no quarto, cai na regra de mesma função). Errar
 * aqui significa colocar um homem e uma mulher no mesmo quarto, então um
 * palpite a menos é sempre melhor que um palpite errado.
 *
 * Isto NUNCA substitui o cadastro: o gênero informado no colaborador sempre
 * vence. É só o que usar quando o campo está vazio.
 */

export type GeneroInferido = "male" | "female" | null;

export interface ResultadoGenero {
  genero: GeneroInferido;
  /** "alta" = nome conhecido; "media" = terminação típica; null = não arrisquei. */
  confianca: "alta" | "media" | null;
}

/** Tira acento, conserta o mojibake que existe na base e devolve minúsculas. */
export function normalizarNome(bruto: string): string {
  return (bruto || "")
    .replace(/Ã£/g, "ã").replace(/Ã©/g, "é").replace(/Ã¡/g, "á").replace(/Ã³/g, "ó")
    .replace(/Ã´/g, "ô").replace(/Ãª/g, "ê").replace(/Ã­/g, "í").replace(/Ã§/g, "ç")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").trim();
}

export const primeiroNome = (completo: string): string =>
  normalizarNome(completo).split(/\s+/)[0] ?? "";

/** Nomes que servem para os dois — nunca arriscamos. */
const AMBIGUOS = new Set([
  "alex", "ariel", "darci", "adair", "ancle", "kelly", "andrea", "cris", "sasha",
  "nicola", "jean", "yuri", "loame", "kallu", "karym", "neto", "junior", "max",
  "teste", "arena", "arte", "griffe", "loca", "inside", "tbh", "beras", "lua",
]);

const FEMININOS = new Set([
  "ana", "maria", "aline", "fernanda", "natalia", "nathalia", "bruna", "camila",
  "camilla", "manuela", "naiara", "patricia", "priscila", "thais", "thaiza",
  "tatiana", "lidiane", "agatha", "amanda", "andreia", "angelica", "alessandra",
  "adriane", "andresa", "beatriz", "barbara", "carolina", "caroline", "carla",
  "clara", "cristiane", "cristina", "cynthia", "daniele", "dathya", "dayse",
  "erica", "elaine", "geisiane", "giovana", "gislaine", "gabriela", "gleicy",
  "graziella", "grazielle", "izabelle", "isabela", "isabel", "ivana", "jaqueline",
  "jessica", "joana", "joyci", "jamile", "juliana", "karen", "karla", "kassia",
  "kennya", "karina", "larissa", "larysa", "lavinia", "luiza", "leandra", "lydia",
  "mariana", "marina", "mayara", "marta", "mirella", "myrella", "nadia", "natasha",
  "nicoly", "nagila", "olga", "paula", "poliane", "rachel", "raisa", "raiza",
  "renata", "rosane", "rafaela", "ruth", "sarah", "sofia", "soleni", "sumika",
  "thamires", "tamara", "vitoria", "vanessa", "vera", "zenilda", "ester", "raquel",
  "carmen", "iris", "eduarda", "leticia", "gabriele", "simone", "silvia", "sandra",
  "monica", "denise", "regina", "rita", "sonia", "solange", "vania", "viviane",
]);

const MASCULINOS = new Set([
  "bruno", "leandro", "luiz", "luis", "jose", "marcos", "rodrigo", "fabio",
  "felipe", "filipe", "phelipe", "rafael", "raphael", "fernando", "alexandre",
  "gabriel", "jefferson", "jeferson", "matheus", "anderson", "carlos", "daniel",
  "guilherme", "joao", "lucas", "marcelo", "paulo", "pedro", "rogerio", "tiago",
  "thiago", "adriano", "francisco", "gustavo", "leonardo", "renan", "ricardo",
  "wellington", "welington", "wellyngton", "alan", "allan", "andre", "eduardo",
  "luan", "marcio", "marco", "marcus", "ronaldo", "vinicius", "willian", "william",
  "willians", "alexsandro", "alessandro", "arnaldo", "alonso", "antonio", "claudio",
  "clodoaldo", "cristiano", "cristian", "danilo", "david", "davi", "diego", "douglas",
  "eder", "erick", "eric", "frederico", "fabiano", "fabricio", "gledson", "henrique",
  "iago", "igor", "jorge", "julio", "jardel", "luciano", "maicon", "maico", "mauricio",
  "manoel", "reinaldo", "roberto", "renato", "silas", "sandro", "victor", "vitor",
  "wagner", "washington", "wesley", "weslley", "wendel", "wilson", "yan", "adailton",
  "adauto", "ademir", "adilson", "adrian", "albert", "aldenir", "amilton", "andrew",
  "andrey", "aroldo", "aureliano", "arthur", "atilio", "breno", "brian", "caio",
  "caue", "kaua", "kaue", "chrystian", "claudionor", "cleber", "cleiton", "cleyton",
  "cesar", "cicero", "clarivaldo", "dario", "darlan", "denis", "diogo", "dionathan",
  "domingos", "deivison", "edcarlos", "edgard", "ediel", "edinaldo", "edmar", "edney",
  "edson", "elias", "eliel", "eliezio", "endrio", "enzo", "erivaldo", "erlon",
  "ernande", "euler", "evandro", "evenilson", "everson", "everton", "fagner",
  "flavio", "franklin", "geraldo", "germinio", "geuderson", "geybson", "gilvan",
  "giovanni", "hamilton", "haskel", "helder", "helio", "hentony", "herique", "hilton",
  "hugo", "humberto", "hebert", "higo", "hudson", "ivan", "ivo", "isac", "isaias",
  "jamerson", "janderson", "janilton", "jeanderson", "jessenilton", "joallyson",
  "joaquim", "joberico", "jobert", "joel", "johnny", "jonas", "jonathan", "jhonathan",
  "josimar", "josinilson", "josivaldo", "jovane", "jarderson", "jardeson", "joedison",
  "joilson", "joseni", "jurandir", "kelio", "kevin", "keven", "kelven", "kennedy",
  "khelton", "klebson", "kaio", "laercio", "leon", "lucio", "lupercio", "macks",
  "maigton", "mauro", "miguel", "mike", "mailson", "marcel", "murilo", "myckael",
  "maxmiliano", "maxsuel", "nelson", "nathan", "nicolas", "nailson", "odair", "oscar",
  "osmar", "osvaldo", "oswaldo", "otavio", "orisvaldo", "pablo", "ramon", "ramirez",
  "renildo", "rikelmy", "robson", "romeu", "romilson", "ruan", "rubem", "reginaldo",
  "rhyan", "ronan", "rui", "ryan", "samuel", "sebastiao", "sergio", "silvando",
  "tarcisio", "tarcyo", "thales", "thalesson", "thomas", "tulio", "uanderson",
  "unilson", "ualace", "ulisses", "vanderlei", "walter", "wandeir", "wanderson",
  "wallan", "welker", "willames", "zederjunior", "zenildo", "abraim", "ageu",
  "alvarino", "alvaro", "arakan", "luaran", "diorlan", "danio", "edima", "guiomar",
  "lyrick", "joo", "nailton",
]);

/** Masculinos terminados em -a: a terminação sozinha erraria. */
const MASCULINOS_EM_A = new Set(["juca", "luca", "nicola", "sacha", "elia", "isaia"]);

export function inferirGenero(nomeCompleto: string): ResultadoGenero {
  const nome = primeiroNome(nomeCompleto);
  if (!nome || nome.length < 2) return { genero: null, confianca: null };
  if (AMBIGUOS.has(nome)) return { genero: null, confianca: null };
  if (FEMININOS.has(nome)) return { genero: "female", confianca: "alta" };
  if (MASCULINOS.has(nome)) return { genero: "male", confianca: "alta" };

  // Terminações típicas do português — só as que quase não falham.
  if (MASCULINOS_EM_A.has(nome)) return { genero: "male", confianca: "media" };
  if (/(ana|ina|ela|ella|elle|iane|iele|inha|essa|isa)$/.test(nome)) return { genero: "female", confianca: "media" };
  if (/a$/.test(nome)) return { genero: "female", confianca: "media" };
  if (/(o|os|ao|or|son|ton|aldo|inho|eu|im)$/.test(nome)) return { genero: "male", confianca: "media" };

  // Qualquer outra coisa (termina em consoante, nome estrangeiro, apelido…):
  // não arriscamos.
  return { genero: null, confianca: null };
}
