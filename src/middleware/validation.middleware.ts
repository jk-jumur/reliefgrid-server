
// import type { Request, Response, NextFunction } from "express";
// import type { ZodType } from "zod";

// export const validateRequest = (schema: ZodType) => {
//   return (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ): void => {
//     const result = schema.safeParse({
//       body: req.body,
//       params: req.params,
//       query: req.query,
//     });

//     if (!result.success) {
//       res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         errors: result.error.issues.map((issue) => ({
//           field: issue.path.join("."),
//           message: issue.message,
//         })),
//       });

//       return;
//     }

//     if (typeof result.data !== "object" || result.data === null) {
//       next(new Error("Validation schema must return an object"));
//       return;
//     }

//     if ("body" in result.data) {
//       req.body = result.data.body;
//     }

//     if ("query" in result.data) {
//       req.validatedQuery = result.data.query;
//     }

//     next();
//   };
// };



// import type { Request, Response, NextFunction } from "express";
// import type { ZodType } from "zod";

// export const validateRequest = (schema: ZodType) => {
//   return (
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ): void => {
//     const result = schema.safeParse({
//       body: req.body,
//       params: req.params,
//       query: req.query,
//     });

//     if (!result.success) {
//       res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         errors: result.error.issues.map((issue) => ({
//           field: issue.path.join("."),
//           message: issue.message,
//         })),
//       });

//       return;
//     }

//     if (typeof result.data !== "object" || result.data === null) {
//       next(new Error("Validation schema must return an object"));
//       return;
//     }

//     const parsedData = result.data as {
//       body?: unknown;
//       query?: unknown;
//     };

//     if ("body" in parsedData) {
//       req.body = parsedData.body;
//     }

//     if ("query" in parsedData) {
//       req.validatedQuery = parsedData.query;
//     }

//     next();
//   };
// };


import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

type ValidatedRequest = Request & {
  validatedQuery?: unknown;
};

export const validateRequest = (schema: ZodType) => {
  return (
    req: ValidatedRequest,
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

    if (typeof result.data !== "object" || result.data === null) {
      next(new Error("Validation schema must return an object"));
      return;
    }

    const parsedData = result.data as {
      body?: unknown;
      query?: unknown;
    };

    if ("body" in parsedData) {
      req.body = parsedData.body;
    }

    if ("query" in parsedData) {
      req.validatedQuery = parsedData.query;
    }

    next();
  };
};