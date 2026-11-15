import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

export const SYSTEM_PROMPT = [
  "You are a coding agent working in the user's local project.",
  "Rules:",
  "- Inspect files before editing (read_file / list_dir).",
  "- Prefer edit_file for small changes; write_file only for new files.",
  "- Use bash for tests, git, installs.",
  "- Reply in the user's language. Be concise.",
  "- When done, stop calling tools and give a short summary.",
].join("\n");

export async function streamChat(
  baseUrl: string, model: string, messages: Msg[], tools: any[],
  onDelta: (delta: string) => void,
): Promise<Msg> {
  let content = "";
  const toolCalls: any[] = [];
  const unlistenChunk = await listen<any>("chat-chunk", (e) => {
    const d = e.payload?.choices?.[0]?.delta;
    if (!d) return;
    if (d.content) { content += d.content; onDelta(d.content); }
    if (d.tool_calls) for (const tc of d.tool_calls) {
      const i = tc.index ?? 0;
      toolCalls[i] ??= { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } };
      if (tc.id) toolCalls[i].id = tc.id;
      if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
      if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
    }
  });
  const done = new Promise<void>(r => { listen("chat-done", () => r()); });
  await invoke("chat", { baseUrl, model, messages, tools });
  await done;
  unlistenChunk();
  return { role: "assistant", content: content || undefined,
           tool_calls: toolCalls.length ? toolCalls : undefined };
}
