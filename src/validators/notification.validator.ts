import { z } from "zod";

export const notificationIdParamsSchema = z.object({
  params: z.object({
    notificationId: z.string().trim().min(1).max(500),
  }),
});

export const deliverNotificationRequestSchema = z.object({
  params: notificationIdParamsSchema.shape.params,
  body: z.object({
    channels: z.array(z.enum(["email", "sms"])).min(1).max(2)
      .refine((channels) => new Set(channels).size === channels.length, {
        message: "Each delivery channel can only be selected once",
      }),
  }),
});
