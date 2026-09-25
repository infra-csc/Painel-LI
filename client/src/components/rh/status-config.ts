// Extraído de rh-control.tsx em 25/09 (modularização): rótulos, ícones e
// classes de cada status da fila. Era um objeto declarado dentro do componente
// (recriado a cada render); como não depende de estado, vive aqui como constante.
import type { LucideIcon } from "lucide-react";
import {
  Shield, CheckCircle, RotateCcw, Clock, FileText, Users, ClipboardList, Send, Ban,
} from "lucide-react";
import type { PrestacaoStatus } from "./prestacao-types";

export interface StatusConfigEntry {
  label: string; shortLabel: string; description: string;
  icon: LucideIcon; color: string; bg: string; border: string;
  iconColor: string; badgeCls: string; cardBorder: string;
}

export const statusConfig: Record<PrestacaoStatus, StatusConfigEntry> = {
  planejamento_pendente: {
    label: "Aguardando planejamento",
    shortLabel: "Planejamento",
    description: "Escalação confirmada — RH precisa criar o planejamento de valores",
    icon: ClipboardList,
    color: "text-warning",
    bg: "bg-warning-soft",
    border: "border-warning/25",
    iconColor: "text-warning-strong",
    badgeCls: "bg-warning-soft text-warning border-warning/25",
    cardBorder: "border-warning/25",
  },
  aguardando_prestacao: {
    label: "Aguardando envio do realizado",
    shortLabel: "Ag. Realizado",
    description: "Planejado criado — aguardando o responsável da função preencher e enviar o realizado",
    icon: Clock,
    color: "text-slate-600",
    bg: "bg-surface-muted",
    border: "border-border",
    iconColor: "text-muted-foreground",
    badgeCls: "bg-muted text-slate-600 border-border",
    cardBorder: "border-border",
  },
  prestacao_recebida: {
    label: "Análise pendente",
    shortLabel: "Comparativo",
    description: "Realizado recebido — RH precisa analisar o comparativo para aprovar ou recusar",
    icon: Send,
    color: "text-primary",
    bg: "bg-brand-soft",
    border: "border-primary/25",
    iconColor: "text-primary",
    badgeCls: "bg-brand-soft text-primary border-primary/25",
    cardBorder: "border-primary/25 shadow-1",
  },
  devolvida_para_ajuste: {
    label: "Devolvida para ajuste",
    shortLabel: "Devolvida",
    description: "O RH devolveu o realizado — aguardando o responsável da função corrigir e reenviar",
    icon: RotateCcw,
    color: "text-warning",
    bg: "bg-warning-soft",
    border: "border-warning/25",
    iconColor: "text-warning-strong",
    badgeCls: "bg-warning-soft text-warning border-warning/25",
    cardBorder: "border-warning/25",
  },
  aprovada_faturamento: {
    label: "Aprovada para faturamento",
    shortLabel: "Aprovada",
    description: "O RH aprovou — pronta para faturamento",
    icon: CheckCircle,
    color: "text-success",
    bg: "bg-success-soft",
    border: "border-success/25",
    iconColor: "text-success-strong",
    badgeCls: "bg-success-soft text-success border-success/25",
    cardBorder: "border-success/25",
  },
  recusada: {
    label: "Recusada",
    shortLabel: "Recusada",
    description: "O RH recusou — não será faturada",
    icon: Ban,
    color: "text-danger",
    bg: "bg-danger-soft",
    border: "border-danger/25",
    iconColor: "text-danger-strong",
    badgeCls: "bg-danger-soft text-danger border-danger/25",
    cardBorder: "border-danger/25",
  },
  all: {
    label: "Todos", shortLabel: "Todos", description: "",
    icon: Users, color: "text-slate-700", bg: "bg-surface-muted",
    border: "border-border", iconColor: "text-muted-foreground",
    badgeCls: "bg-muted text-slate-600 border-border",
    cardBorder: "border-border",
  },
  rh_action: {
    label: "Pendências do RH", shortLabel: "Pendências RH", description: "",
    icon: Shield, color: "text-primary", bg: "bg-brand-soft",
    border: "border-primary/25", iconColor: "text-primary",
    badgeCls: "bg-brand-soft text-primary border-primary/25",
    cardBorder: "border-primary/25",
  },
  col_action: {
    label: "Aguardando Colaborador", shortLabel: "Ag. Colaborador", description: "",
    icon: Users, color: "text-primary", bg: "bg-brand-soft",
    border: "border-primary/25", iconColor: "text-primary",
    badgeCls: "bg-brand-soft text-primary border-primary/25",
    cardBorder: "border-primary/25",
  },
  nf_andamento: {
    label: "Nota Fiscal em andamento", shortLabel: "Nota Fiscal", description: "",
    icon: FileText, color: "text-warning", bg: "bg-warning-soft",
    border: "border-warning/25", iconColor: "text-warning-strong",
    badgeCls: "bg-warning-soft text-warning border-warning/25",
    cardBorder: "border-warning/25",
  },
  concluidos: {
    label: "Concluídos", shortLabel: "Concluídos", description: "",
    icon: CheckCircle, color: "text-success", bg: "bg-success-soft",
    border: "border-success/25", iconColor: "text-success-strong",
    badgeCls: "bg-success-soft text-success border-success/25",
    cardBorder: "border-success/25",
  },
};
