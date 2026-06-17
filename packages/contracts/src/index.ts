import { z } from "zod";

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string(),
});

export const healthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  version: z.string(),
  configured: z.boolean(),
  dependencies: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});

export const mcpToolContentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

export const mcpToolResponseSchema = z.object({
  content: z.array(mcpToolContentSchema).optional(),
});

export const runRequestSchema = z.object({
  serverName: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export const runRecordSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  serverName: z.string(),
  toolName: z.string(),
  status: z.enum(["success", "error"]),
  arguments: z.unknown(),
  response: z.unknown(),
  error: z.string().optional(),
});

export const storageEntrySchema = z.object({
  name: z.string(),
  kind: z.enum(["folder", "file"]),
});

export const storageBrowseSchema = z.object({
  path: z.string(),
  entries: z.array(storageEntrySchema),
});

export const storageWriteFileRequestSchema = z.object({
  path: z.string().min(1),
  contentBase64: z.string().min(1),
});

export const assetRecordSchema = z.object({
  filename: z.string(),
  keywords: z.array(z.string()),
  url: z.string(),
});

export const assetAddRequestSchema = z.object({
  filename: z.string().min(1),
  keywords: z.array(z.string()).optional(),
  keyword: z.string().optional(),
  contentBase64: z.string().min(1),
});

export const assetTagRequestSchema = z.object({
  keywords: z.array(z.string()).optional(),
  keyword: z.string().optional(),
});

export const qpsResolveAssetResponseSchema = z.object({
  ok: z.boolean(),
  abs_path: z.string().nullable(),
  rel_path: z.string().nullable(),
  label: z.string(),
  kind: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export const qpsValidationFindingSchema = z.object({
  severity: z.enum(["P0", "P1", "P2"]),
  id: z.string(),
  message: z.string(),
  fix: z.string(),
  line: z.number(),
  snippet: z.string(),
});

export const qpsValidateCopyResponseSchema = z.object({
  ok: z.literal(true),
  pass: z.boolean(),
  counts: z.object({
    p0: z.number(),
    p1: z.number(),
    p2: z.number(),
  }),
  findings: z.array(qpsValidationFindingSchema),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type Health = z.infer<typeof healthSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;
export type RunRecord = z.infer<typeof runRecordSchema>;
export type StorageBrowse = z.infer<typeof storageBrowseSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type QpsResolveAssetResponse = z.infer<typeof qpsResolveAssetResponseSchema>;
export type QpsValidateCopyResponse = z.infer<typeof qpsValidateCopyResponseSchema>;
