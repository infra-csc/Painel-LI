import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

/**
 * Middleware de validação de corpo.
 *
 * Faz parse do req.body com o schema Zod fornecido e:
 *  - em caso de sucesso: substitui req.body pelos dados validados/coercidos
 *  - em caso de erro: retorna 400 JSON com os erros por campo
 *
 * Uso:
 *   app.post("/api/tickets", validateBody(insertTicketSchema), async (req, res) => { ... });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data;
      return next();
    }
    const error = result.error as ZodError;
    res.status(400).json({
      message: "Dados inválidos. Verifique os campos obrigatórios.",
      errors: error.flatten().fieldErrors,
    });
  };
}

/**
 * Middleware de validação de query string.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (result.success) {
      (req as any).validatedQuery = result.data;
      return next();
    }
    const error = result.error as ZodError;
    res.status(400).json({
      message: "Parâmetros de consulta inválidos.",
      errors: error.flatten().fieldErrors,
    });
  };
}
