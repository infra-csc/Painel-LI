interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusClass = (status: string) => {
    switch (status) {
      case "planejado":
        return "status-planejado"; // Vermelho - ainda não iniciado
      case "escalacao":
        return "status-escalacao"; // Amarelo - em andamento
      case "passagem":
        return "status-passagem"; // Amarelo - em andamento
      case "fechamento":
        return "status-fechamento"; // Amarelo - em andamento
      case "aprovacao":
        return "status-aprovacao"; // Amarelo - em andamento
      case "aprovado":
        return "status-aprovado"; // Verde - completo
      case "rejeitado":
        return "status-rejeitado"; // Vermelho - erro/problema
      default:
        return "status-planejado";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planejado":
        return "Planejado";
      case "escalacao":
        return "Em Escalação";
      case "passagem":
        return "Aguardando Passagem";
      case "fechamento":
        return "Fechamento";
      case "aprovacao":
        return "Aguardando Aprovação";
      case "aprovado":
        return "Aprovado";
      case "rejeitado":
        return "Rejeitado";
      default:
        return "Planejado";
    }
  };

  return (
    <span className={`status-badge ${getStatusClass(status)}`} data-testid={`status-${status}`}>
      {getStatusLabel(status)}
    </span>
  );
}
