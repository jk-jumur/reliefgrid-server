import type { Request, Response } from "express";

import { HttpError } from "../../utils/http-error.js";
import {
  createResourceAllocationSchema,
  listResourceAllocationsSchema,
  resourceAllocationIdParamsSchema,
  updateResourceAllocationSchema,
  verifyAllocationDeliverySchema,
} from "../../validators/resource-allocation.validator.js";
import {
  createResourceAllocation,
  getResourceAllocationById,
  listResourceAllocations,
  updateResourceAllocation,
} from "./resource-allocation.service.js";
import {
  createDistributionVerificationQr,
  verifyDistributionQr,
} from "./distribution-verification.service.js";

export const createResourceAllocationHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const data = createResourceAllocationSchema.shape.body.parse(req.body);
  const allocation = await createResourceAllocation(data, req.user);
  res.status(201).json({
    success: true,
    message: "Resource allocated successfully",
    data: allocation,
  });
};

export const listResourceAllocationsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const query = listResourceAllocationsSchema.shape.query.parse(req.validatedQuery);
  const result = await listResourceAllocations(query, req.user);
  res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getResourceAllocationHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { allocationId } = resourceAllocationIdParamsSchema.shape.params.parse(
    req.params
  );
  const allocation = await getResourceAllocationById(allocationId, req.user);
  res.status(200).json({ success: true, data: allocation });
};

export const updateResourceAllocationHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { allocationId } = resourceAllocationIdParamsSchema.shape.params.parse(
    req.params
  );
  const data = updateResourceAllocationSchema.shape.body.parse(req.body);
  const allocation = await updateResourceAllocation(allocationId, data, req.user);
  res.status(200).json({
    success: true,
    message: "Resource allocation status updated successfully",
    data: allocation,
  });
};

export const createAllocationVerificationQrHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { allocationId } = resourceAllocationIdParamsSchema.shape.params.parse(
    req.params
  );
  const result = await createDistributionVerificationQr(allocationId, req.user);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({
    success: true,
    message: "One-time delivery QR created",
    data: result,
  });
};

export const verifyAllocationDeliveryHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const { token } = verifyAllocationDeliverySchema.shape.body.parse(req.body);
  const allocation = await verifyDistributionQr(token, req.user);
  res.status(200).json({
    success: true,
    message: "Delivery verified and allocation marked delivered",
    data: allocation,
  });
};
