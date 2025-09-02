// Lista de pré-funções ordenada alfabeticamente e editável
export const preFunctionsList = [
  "Assinaturas",
  "Atendimento", 
  "Atendimentos - Projetos",
  "Ativação",
  "Ceno",
  "Cluber 02",
  "Comercial",
  "Compras",
  "Diretor de Prova",
  "Grupp",
  "Hub - Diretor de Prova",
  "Hub - Percuseiro",
  "Hub - Produtor",
  "Kit",
  "Marketing - MKT",
  "Marketing - Performance",
  "Percuseiro",
  "Produto",
  "Running Land",
  "Supervisor Ceno",
  "Supervisor Kit"
].sort(); // Garantir ordem alfabética

export function getAvailablePreFunctions(): string[] {
  return [...preFunctionsList];
}