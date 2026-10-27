/**
 * Normalização de papéis compartilhada entre client e servidor.
 *
 * O banco tem papéis legados ("administrador", "financeiro", ...); o client
 * sempre normalizou (client/src/lib/permissions.ts), mas o servidor comparava
 * strings literais — usuário com papel legado via os botões e tomava 403.
 * Esta é a fonte única da tabela de aliases.
 */

/**
 * Papéis canônicos — a chave gravada em `users.role` (texto livre no banco,
 * sem CHECK). 23/10: `honorarios`, o perfil que só libera a verba dos
 * Honorários da cenotécnica e extrai os relatórios. O Portal Norte manda o
 * nome "Honorários (liberação)" no SSO e grava a chave `honorarios` direto na
 * tabela (syncPermissionToLogistica); as duas formas viram este papel.
 */
export const PAPEIS_CANONICOS = ["admin", "production", "function_area", "purchasing", "financial", "honorarios"] as const;
export type CanonicalRole = (typeof PAPEIS_CANONICOS)[number];

const ROLE_MAP: Record<string, CanonicalRole> = {
  admin: "admin",
  production: "production",
  function_area: "function_area",
  purchasing: "purchasing",
  financial: "financial",
  // Aliases legados
  administrador: "admin",
  administrator: "admin",
  logistica_interna: "production",
  logistica: "production",
  area_funcional: "function_area",
  area_responsavel: "function_area",
  function_manager: "function_area",
  compras: "purchasing",
  viagens: "purchasing",
  compras_viagens: "purchasing",
  purchase: "purchasing",
  travel: "purchasing",
  financeiro: "financial",
  finance: "financial",
  // 26/10 (Honorários, Fase 0): o app diz "DP" onde dizia "RH" — o rótulo do
  // papel é "Financeiro / DP"; o Portal ainda manda "Financeiro / RH". Os dois
  // nomes viram o mesmo papel. Siglas soltas ("rh", "dp") NÃO entram: um
  // papel gravado assim ganharia o financeiro sem ninguém ter dado.
  "financeiro / dp": "financial",
  "financeiro / rh": "financial",
  // Honorários da cenotécnica: só liberação e relatórios (23/10). As chaves
  // ficam sem acento (ver `chaveDoPapel`): "Honorários (liberação)", o texto
  // exato que o Portal manda, vira "honorarios (liberacao)".
  honorarios: "honorarios",
  "honorarios (liberacao)": "honorarios",
  "honorarios liberacao": "honorarios",
  honorarios_liberacao: "honorarios",
};

/** Caixa, acentos e espaços (nas pontas e repetidos) não importam. */
function chaveDoPapel(role: string): string {
  return role.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  if (!role) return null;
  return ROLE_MAP[chaveDoPapel(role)] || null;
}

/**
 * Perfil "Honorários (liberação)" (23/10): só a tela Honorários da
 * cenotécnica (liberar verba, histórico, relatórios e CSV). Não pede nem
 * aprova honorário e não abre nenhuma outra tela nem rota: o servidor barra
 * tudo fora da lista de server/perfil-honorarios.ts.
 */
export function ehPerfilHonorarios(role: string | null | undefined): boolean {
  return normalizeRole(role) === "honorarios";
}

/** Quem registra a liberação da verba dos honorários: admin, DP e o perfil Honorários. */
export function podeLiberarHonorarios(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "financial" || r === "honorarios";
}

/** DP (financial, "Financeiro / DP") ou administrador — quem decide no fluxo financeiro. */
export function isFinanceRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "financial";
}

/**
 * Grupos de autorização usados pelo servidor (server/routes.ts) e disponíveis
 * ao client para esconder ações que a API vai recusar. Fonte única — antes
 * cada rota repetia sua própria lista de strings.
 */
export const ROLE_GROUPS = {
  /** Cadastros estruturais: funções, colaboradores, eventos, escalação */
  cadastro: ["admin", "purchasing", "production"],
  /** Valores, custos e decisões financeiras */
  financeiro: ["admin", "financial"],
  /** Logística: passagens, hospedagem, grupos de transporte, custos extras */
  logistica: ["admin", "purchasing", "production"],
  /**
   * Dados pessoais do colaborador: CPF/RG, nascimento, telefone, endereço e o
   * anexo do documento. 23/09 ficou só admin/Compras/RH; 29/09 o dono devolveu
   * à Área de Função ("vê todos os dados na verdade") — ela mantém o próprio
   * time e usa o documento no dia a dia. Produção continua sem.
   */
  dadosPessoais: ["admin", "purchasing", "financial", "function_area"],
} as const satisfies Record<string, readonly CanonicalRole[]>;

/** Verifica se o papel (aceitando aliases legados) pertence ao grupo. */
export function hasRoleIn(
  role: string | null | undefined,
  group: readonly CanonicalRole[],
): boolean {
  const r = normalizeRole(role);
  return !!r && group.includes(r);
}
