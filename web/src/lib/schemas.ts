import { z } from "zod";

export const VerifyEmailSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address")
    .endsWith(".edu", "Must be a .edu email address"),
});

export const VibeProfileSchema = z.object({
  vibe_text: z.string().max(500, "Keep it under 500 characters").optional().default(""),
  university: z.string().min(2, "Please enter your university"),
  max_rent: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: "Please enter a valid rent budget",
  }),
  min_bedrooms: z.string().min(1),
});

export const ListingSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(100, "Title must be under 100 characters"),
  description: z.string().max(2000, "Description must be under 2000 characters").optional().default(""),
  address: z.string().min(5, "Please enter a complete address"),
  university_near: z.string().optional().default(""),
  rent: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: "Please enter a valid rent amount",
  }),
  available_from: z.string().min(1, "Please select an available from date"),
  available_to: z.string().optional().default(""),
  bedrooms: z.string().min(1),
  bathrooms: z.string().min(1),
});

export type ListingFormValues = z.infer<typeof ListingSchema>;
