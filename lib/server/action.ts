import "server-only";
import { z } from "zod";

/** Uniform result for server actions: the client shows `error` in a toast or under the form. */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

/** Parse with zod and turn the first issue into a readable message. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): { data: z.infer<S> } | { error: string } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data };
  const issue = r.error.issues[0];
  return { error: issue ? `${issue.path.length ? issue.path.join(".") + ": " : ""}${issue.message}` : "Invalid input." };
}

/** Catch unexpected errors so the client always receives an ActionResult. */
export async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    // redirect()/notFound() throw special errors that must propagate.
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_")) throw err;
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
  }
}
