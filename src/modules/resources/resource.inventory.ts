import type { ResourceAvailability } from "./resource.model.js";

export const calculateResourceAvailability = (
  availableQuantity: number,
  allocatedQuantity: number,
  distributedQuantity: number
): ResourceAvailability => {
  if (availableQuantity <= 0) return "out_of_stock";
  const totalQuantity = availableQuantity + allocatedQuantity + distributedQuantity;
  return totalQuantity > 0 && availableQuantity / totalQuantity <= 0.2
    ? "low_stock"
    : "available";
};
