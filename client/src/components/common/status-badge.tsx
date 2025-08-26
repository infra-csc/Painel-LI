interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusClass = (status: string) => {
    switch (status) {
      case "planejado":
        return "status-planejado";
      case "escalacao":
        return "status-escalacao";
      case "passagem":
        return "status-passagem";
      case "fechamento":
        return "status-fechamento";
      case "aprovado":
        return "status-aprovado";
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
      case "aprovado":
        return "Aprovado";
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
