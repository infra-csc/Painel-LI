/**
 * Mensagens do zod em pt-BR (24/09).
 *
 * Por quê: os formulários com react-hook-form + zod mostravam "Required",
 * "String must contain at least 3 character(s)" e "Invalid email" — texto em
 * inglês, técnico, no meio de uma tela em português. Este mapa é registrado
 * UMA vez em `main.tsx` (`z.setErrorMap`) e vale para todos os esquemas que
 * não passam mensagem própria (`{ message }` continua tendo prioridade).
 */
import { z, ZodIssueCode, ZodParsedType, type ZodErrorMap } from "zod";

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export const zodErrorMapPtBr: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined || issue.received === ZodParsedType.null) {
        return { message: "Obrigatório" };
      }
      if (issue.expected === ZodParsedType.number) return { message: "Número inválido" };
      if (issue.expected === ZodParsedType.date) return { message: "Data inválida" };
      if (issue.expected === ZodParsedType.boolean) return { message: "Valor inválido" };
      return { message: "Valor inválido" };

    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("startsWith" in issue.validation) return { message: `Deve começar com "${issue.validation.startsWith}"` };
        if ("endsWith" in issue.validation) return { message: `Deve terminar com "${issue.validation.endsWith}"` };
        if ("includes" in issue.validation) return { message: `Deve conter "${issue.validation.includes}"` };
        return { message: "Texto inválido" };
      }
      switch (issue.validation) {
        case "email": return { message: "E-mail inválido" };
        case "url": return { message: "Endereço (URL) inválido" };
        case "uuid": return { message: "Identificador inválido" };
        case "regex": return { message: "Formato inválido" };
        case "datetime": return { message: "Data e hora inválidas" };
        case "date": return { message: "Data inválida" };
        case "time": return { message: "Hora inválida" };
        default: return { message: "Texto inválido" };
      }

    case ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      switch (issue.type) {
        case "string":
          if (min === 1) return { message: "Obrigatório" };
          return { message: `Mínimo de ${min} ${plural(min, "caractere", "caracteres")}` };
        case "number":
          return { message: issue.inclusive ? `Deve ser no mínimo ${min}` : `Deve ser maior que ${min}` };
        case "array":
          if (min === 1) return { message: "Selecione pelo menos um item" };
          return { message: `Selecione pelo menos ${min} itens` };
        case "date":
          return { message: "Data anterior ao permitido" };
        default:
          return { message: "Valor abaixo do mínimo" };
      }
    }

    case ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      switch (issue.type) {
        case "string":
          return { message: `Máximo de ${max} ${plural(max, "caractere", "caracteres")}` };
        case "number":
          return { message: issue.inclusive ? `Deve ser no máximo ${max}` : `Deve ser menor que ${max}` };
        case "array":
          return { message: `Selecione no máximo ${max} ${plural(max, "item", "itens")}` };
        case "date":
          return { message: "Data posterior ao permitido" };
        default:
          return { message: "Valor acima do máximo" };
      }
    }

    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
      return { message: "Escolha uma das opções" };

    case ZodIssueCode.invalid_date:
      return { message: "Data inválida" };

    case ZodIssueCode.not_multiple_of:
      return { message: `Deve ser múltiplo de ${issue.multipleOf}` };

    case ZodIssueCode.unrecognized_keys:
      return { message: "Campos não reconhecidos" };

    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      return { message: "Valor inválido" };

    case ZodIssueCode.custom:
      return { message: ctx.defaultError === "Invalid input" ? "Valor inválido" : ctx.defaultError };

    default:
      return { message: ctx.defaultError };
  }
};

/** Registra o mapa globalmente. Chame uma vez, antes do primeiro render. */
export function registrarZodPtBr() {
  z.setErrorMap(zodErrorMapPtBr);
}

export default registrarZodPtBr;
