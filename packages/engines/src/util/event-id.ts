import { v7 as uuidv7 } from "uuid";

/** Generate a stable callId for tool_call/tool_result pairing when the SDK doesn't provide one. */
export function newCallId(): string {
  return uuidv7();
}
