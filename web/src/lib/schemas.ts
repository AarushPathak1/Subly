import { z } from "zod";

export const LEASE_TYPES = ["whole_place", "private_room", "shared_room"] as const;
export const FURNISHED_OPTIONS = ["furnished", "partially", "unfurnished"] as const;
export const AMENITY_OPTIONS = [
  "WiFi", "In-unit Laundry", "Dishwasher", "AC", "Heat Included",
  "Parking", "Gym", "Pool", "Balcony", "Dog-friendly", "Cat-friendly", "Smoke-free",
] as const;
export const UTILITY_OPTIONS = ["Water", "Electric", "Gas", "Internet", "Trash"] as const;

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
  mode: z.enum(["onboarding", "settings"]).optional().default("onboarding"),
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
  lease_type: z.enum(LEASE_TYPES).optional().or(z.literal("")).default(""),
  furnished: z.enum(FURNISHED_OPTIONS).optional().or(z.literal("")).default(""),
  lat: z.string().optional().default(""),
  lng: z.string().optional().default(""),
});

export type ListingFormValues = z.infer<typeof ListingSchema>;

export const InviteRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  university_name: z.string().min(2, "Please enter your university or college"),
});

export const ReviewSchema = z.object({
  rating: z.string().refine((v) => ["1", "2", "3", "4", "5"].includes(v), {
    message: "Please select a rating",
  }),
  body: z.string().max(1000, "Keep it under 1000 characters").optional().default(""),
});
