interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusClass = (status: string) => {
    switch (status) {
      case "planejado":
        return "status-planejado"; // Vermelho - ainda não iniciado
      case "confirmado":
        return "status-confirmado"; // Laranja - escalação confirmada e bloqueada
      case "reaberto":
        return "status-reaberto"; // Azul claro - gestão liberou para editar
      case "escalacao":
        return "status-escalacao"; // Amarelo - em andamento
      case "passagem":
        return "status-passagem"; // Amarelo - em andamento
      case "hospedagem":
        return "status-hospedagem"; // Azul - aguardando hospedagem
      case "passagem_comprada":
        return "status-passagem_comprada"; // Verde esmeralda - passagem comprada
      case "hospedagem_comprada":
        return "status-hospedagem_comprada"; // Verde esmeralda - hospedagem comprada
      case "hospedagem_passagem_comprada":
        return "status-hospedagem_passagem_comprada"; // Verde completo - ambos comprados
      case "aprovado":
        return "status-aprovado"; // Verde - processo completo
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
      case "confirmado":
        return "Confirmado";
      case "reaberto":
        return "Reaberto";
      case "escalacao":
        return "Escalado";
      case "passagem":
        return "Aguardando Passagem";
      case "hospedagem":
        return "Aguardando Hospedagem";
      case "passagem_comprada":
        return "Passagem Comprada";
      case "hospedagem_comprada":
        return "Hospedagem Comprada";
      case "hospedagem_passagem_comprada":
        return "Hospedagem e Passagem Comprada";
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
