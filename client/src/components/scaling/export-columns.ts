/**
 * Colunas do exportar da Escalação — fonte única (regra do dono, 27/08).
 *
 * Vive em módulo próprio (auditoria 28/08) para o modal de escolha de colunas
 * não arrastar a biblioteca xlsx (~430 kB) para o bundle inicial da tela: o
 * modal só precisa DESTAS listas; o xlsx agora carrega sob demanda na hora do
 * clique em exportar (ver export-scaling-xlsx.ts).
 *
 * Os grupos organizam o modal e a ordem aqui é a ordem no arquivo.
 * Chave = título da coluna em buildScalingExportRows.
 */
export interface ExportColumnGroup { label: string; keys: string[] }

export const EXPORT_COLUMN_GROUPS: ExportColumnGroup[] = [
  { label: "Evento", keys: ["ID", "Evento", "Local do Evento", "Início do Evento", "Fim do Evento", "Função", "Área"] },
  { label: "Colaborador", keys: ["Colaborador", "Tipo", "CPF Colaborador", "Data Nascimento", "Telefone Colaborador", "Cidade Colaborador", "Sai de"] },
  { label: "Período", keys: ["Período Agendado - Início", "Período Agendado - Fim", "Período Real - Início", "Período Real - Fim"] },
  { label: "Passagem e viagem", keys: [
    "Precisa Passagem", "Tipo de Transporte", "Passagem LOC", "Passagem Data Compra", "Passagem Valor (R$)",
    "Ida - Cidade Origem", "Ida - Aeroporto Origem", "Ida - Cidade Destino", "Ida - Aeroporto Destino", "Ida - Data", "Ida - Horário", "Horário Sugerido Ida",
    "Volta - Cidade Origem", "Volta - Aeroporto Origem", "Volta - Cidade Destino", "Volta - Aeroporto Destino", "Volta - Data", "Volta - Horário", "Horário Sugerido Volta",
    "Precisa Hospedagem",
  ] },
  { label: "Valores", keys: ["Diárias Planejadas", "Diárias Reais", "Valor da Diária (R$)", "Valor Total (R$)"] },
  { label: "Status e observações", keys: ["Status", "Fase Atual", "Registro Emergencial", "Observações", "Observações Reais", "Comentários"] },
];

export const ALL_EXPORT_COLUMNS: string[] = EXPORT_COLUMN_GROUPS.flatMap((g) => g.keys);
