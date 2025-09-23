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
      case "hospedagem":
        return "status-hospedagem"; // Azul - aguardando hospedagem
      case "passagem_comprada":
        return "status-passagem_comprada"; // Verde esmeralda - passagem comprada
      case "aprovacao":
        return "status-aprovacao"; // Amarelo - em andamento
      case "aprovado":
        return "status-aprovado"; // Verde - completo
      case "rejeitado":
        return "status-rejeitado"; // Vermelho - erro/problema
      case "cancelado":
        return "status-cancelado"; // Cinza - cancelado
      default:
        return "status-planejado";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "planejado":
        return "Aguardando Escalação";
      case "escalacao":
        return "Em Escalação";
      case "passagem":
        return "Aguardando Passagem";
      case "hospedagem":
        return "Aguardando Hospedagem";
      case "passagem_comprada":
        return "Passagem Comprada";
      case "aprovacao":
        return "Aguardando Aprovação";
      case "aprovado":
        return "Aprovado";
      case "rejeitado":
        return "Rejeitado";
      case "cancelado":
        return "Cancelado";
      default:
        return "Aguardando Escalação";
    }
  };

  return (
    <span className={`status-badge ${getStatusClass(status)}`} data-testid={`status-${status}`}>
      {getStatusLabel(status)}
    </span>
  );
}
