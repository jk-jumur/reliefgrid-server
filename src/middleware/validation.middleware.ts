
import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export const validateRequest = (schema: ZodType) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });

      return;
    }

    const validatedData = result.data as {
      body: unknown;
    };

    req.body = validatedData.body;

    next();
  };
};
