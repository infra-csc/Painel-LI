/**
 * Quem edita o quê num usuário interno — fonte ÚNICA para o servidor
 * (PATCH /api/users/:id, reset de senha) e para a tela de Usuários (08/10).
 *
 * Antes cada lado tinha a sua cópia: a tela deixava Logística Interna abrir
 * "Editar" em terceiros, mandava o e-mail junto na edição feita por RH/Compras
 * e o perfil junto na edição do próprio admin — e o servidor respondia 403.
 *
 * Regra (a mesma de 23/09, sem afrouxar nada):
 *   - o próprio usuário: nome e e-mail (admin também a área); NINGUÉM muda o
 *     próprio perfil ou status (evita se trancar fora);
 *   - RH e Compras em terceiros: só o nome;
 *   - admin em terceiros: nome, e-mail, perfil, status e área;
 *   - os outros perfis (Logística Interna, Área de Função) não editam terceiros.
 */
import { normalizeRole } from "./roles";

/** Senha mínima — a mesma do servidor (cadastro, troca e reset). */
export const SENHA_MINIMA = 8;

export type CampoDoUsuario = "name" | "email" | "role" | "status" | "area";

export const MSG_SEM_PERMISSAO_PARA_EDITAR = "Sem permissão para editar este usuário";
export const MSG_PROPRIO_PERFIL = "Você não pode alterar o próprio perfil ou status.";
export const MSG_SO_ADMIN_PERFIL = "Só administradores alteram perfil, status e área do usuário.";
export const MSG_SO_ADMIN_EMAIL = "Só administradores alteram o e-mail de outro usuário.";
export const MSG_SENHA_DE_OUTRO_ADMIN = "A senha de outro administrador não pode ser redefinida por aqui.";

/** RH e Compras gerenciam terceiros (só o nome); admin, tudo. */
function gereTerceiros(role: string | null | undefined): boolean {
  const r = normalizeRole(role);
  return r === "admin" || r === "financial" || r === "purchasing";
}

/**
 * Campos que quem edita (`editorRole`) pode alterar. `euMesmo`: a pessoa
 * editada é quem está logado. Lista vazia = não edita.
 */
export function camposEditaveisDoUsuario(editorRole: string | null | undefined, euMesmo: boolean): readonly CampoDoUsuario[] {
  const r = normalizeRole(editorRole);
  if (r === "admin") return euMesmo ? ["name", "email", "area"] : ["name", "email", "role", "status", "area"];
  if (euMesmo) return ["name", "email"];
  if (gereTerceiros(r)) return ["name"];
  return [];
}

export function podeEditarUsuario(editorRole: string | null | undefined, euMesmo: boolean): boolean {
  return camposEditaveisDoUsuario(editorRole, euMesmo).length > 0;
}

/**
 * Por que o servidor recusa (403) uma edição com estes campos — ou `null` se
 * aceita. A ordem das mensagens é a de sempre do PATCH /api/users/:id.
 */
export function recusaDaEdicaoDeUsuario(
  editorRole: string | null | undefined,
  euMesmo: boolean,
  enviados: Iterable<CampoDoUsuario>,
): string | null {
  const isAdmin = normalizeRole(editorRole) === "admin";
  const s = new Set(enviados);
  if (!gereTerceiros(editorRole) && !euMesmo) return MSG_SEM_PERMISSAO_PARA_EDITAR;
  if (euMesmo && (s.has("role") || s.has("status"))) return MSG_PROPRIO_PERFIL;
  if (!isAdmin && (s.has("role") || s.has("status") || s.has("area"))) return MSG_SO_ADMIN_PERFIL;
  if (!euMesmo && !isAdmin && s.has("email")) return MSG_SO_ADMIN_EMAIL;
  return null;
}

/** Reset de senha por admin: a própria pode; a de OUTRO admin, não. */
export function podeRedefinirSenhaDe(alvoRole: string | null | undefined, euMesmo: boolean): boolean {
  return euMesmo || normalizeRole(alvoRole) !== "admin";
}
