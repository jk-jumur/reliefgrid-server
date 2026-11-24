
import { z } from "zod";

// Volunteer Availability
export const volunteerAvailabilityEnum = z.enum([
  "available",
  "unavailable",
  "assigned",
]);

// Volunteer Registration Validation
export const createVolunteerSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(3, "Full name must be at least 3 characters")
      .max(100, "Full name cannot exceed 100 characters"),

    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .toLowerCase(),

    phone: z
      .string()
      .trim()
      .regex(
        /^\+?[0-9]{7,15}$/,
        "Invalid phone number"
      ),

    skills: z
      .array(
        z.string()
          .trim()
          .min(2, "Skill must be at least 2 characters")
      )
      .min(1, "At least one skill is required"),

    availability: volunteerAvailabilityEnum,
  }),
});
