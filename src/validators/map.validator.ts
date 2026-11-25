import { z } from "zod";

export const mapOperationsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(1000).default(500),
    south: z.coerce.number().min(-90).max(90).optional(),
    west: z.coerce.number().min(-180).max(180).optional(),
    north: z.coerce.number().min(-90).max(90).optional(),
    east: z.coerce.number().min(-180).max(180).optional(),
  }).refine((query) => {
    const values = [query.south, query.west, query.north, query.east];
    const supplied = values.filter((value) => value !== undefined).length;
    return supplied === 0 || supplied === 4;
  }, { message: "Provide all four map bounds or none" }).refine(
    (query) =>
      query.south === undefined ||
      query.north === undefined ||
      query.west === undefined ||
      query.east === undefined ||
      (query.south <= query.north && query.west <= query.east),
    { message: "Map bounds must have south <= north and west <= east" }
  ),
});
