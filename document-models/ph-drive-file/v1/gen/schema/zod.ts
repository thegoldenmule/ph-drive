/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type { PhDriveFileState, SetFileContentInput } from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function PhDriveFileStateSchema(): z.ZodObject<
  Properties<PhDriveFileState>
> {
  return z.object({
    __typename: z.literal("PhDriveFileState").optional(),
    content: z.string().nullish(),
    mimeType: z.string().nullish(),
    parentFolder: z.string().nullish(),
    sha256: z.string().nullish(),
    size: z.number().nullish(),
  });
}

export function SetFileContentInputSchema(): z.ZodObject<
  Properties<SetFileContentInput>
> {
  return z.object({
    content: z.string(),
    mimeType: z.string(),
    parentFolder: z.string().nullish(),
    sha256: z.string(),
    size: z.number(),
  });
}
