import * as z from "zod";

export const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

export const passwordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(6, "New password must be at least 6 characters"),
  confirm_new_password: z.string(),
}).refine((data) => data.new_password === data.confirm_new_password, {
  message: "Passwords do not match",
  path: ["confirm_new_password"],
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
export type PasswordFormValues = z.infer<typeof passwordSchema>;