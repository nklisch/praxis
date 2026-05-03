/**
 * Convert an arbitrary thrown value into a structured field for logging.
 * Lives in core/types so domain code can format errors consistently without
 * importing from desktop.
 */
export interface SerializedError {
  message: string;
  stack?: string;
  code?: string;
  name?: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      message: err.message,
      ...(err.stack !== undefined && { stack: err.stack }),
      ...(err.name !== undefined && { name: err.name }),
      ...("code" in err && typeof err.code === "string" && { code: err.code }),
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: unknown; code?: unknown };
    return {
      message: String(e.message),
      ...(typeof e.code === "string" && { code: e.code }),
    };
  }
  return { message: String(err) };
}
