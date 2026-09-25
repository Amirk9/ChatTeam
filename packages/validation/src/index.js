import { z } from 'zod';

export const emailSchema = z.string().email().max(255);
export const passwordSchema = z.string().min(8).max(128);
export const displayNameSchema = z.string().min(1).max(80);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const workspaceSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const channelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-_]+$/),
  description: z.string().max(500).optional().default(''),
  isPrivate: z.boolean().optional().default(false),
});

export const messageSchema = z.object({
  content: z.string().min(1).max(8000),
  parentMessageId: z.string().uuid().nullable().optional(),
});

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = result.error.flatten();
    throw err;
  }
  return result.data;
}

// ---- Phase 3: workspaces ----
export const roleSchema = z.enum(['owner', 'admin', 'moderator', 'member', 'guest', 'bot']);

export const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
});

export const workspacePatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  iconUrl: z.string().url().max(500).nullable().optional(),
});

export const inviteCreateSchema = z.object({
  email: z.string().email().max(255).optional(),
  role: roleSchema.optional().default('member'),
});

export const joinSchema = z.object({
  token: z.string().min(8),
});

export const memberRoleSchema = z.object({
  role: roleSchema,
});

// ---- Phase 4: channels ----
export const channelCreateSchema = z.object({
  name: z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/),
  description: z.string().max(500).optional().default(''),
  topic: z.string().max(250).optional().default(''),
  isPrivate: z.boolean().optional().default(false),
});

export const channelPatchSchema = z.object({
  name: z.string().min(1).max(40).regex(/^[a-z0-9-_]+$/).optional(),
  description: z.string().max(500).optional(),
  topic: z.string().max(250).optional(),
});

export const channelMemberAddSchema = z.object({
  userId: z.string().uuid(),
});
