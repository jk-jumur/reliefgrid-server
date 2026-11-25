import { HttpError } from "../../utils/http-error.js";

export const calculateShelterCapacity = (
  totalCapacity: number,
  currentOccupancy: number
): number => {
  if (
    !Number.isInteger(totalCapacity) ||
    !Number.isInteger(currentOccupancy) ||
    totalCapacity < 1 ||
    currentOccupancy < 0 ||
    currentOccupancy > totalCapacity
  ) {
    throw new HttpError(409, "Shelter occupancy must be within its total capacity");
  }

  return totalCapacity - currentOccupancy;
};
