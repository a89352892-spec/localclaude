import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { streamChat, SYSTEM_PROMPT, type Msg } from "./agent";
import { TOOLS, CMD } from "./tools";

const C = {
  bg: "#1e1e1e", panel: "#252526", border: "#3c3c3c",
  text: "#d4d4d4", accent: "#d97757", user: "#4a9eff", tool: "#888",
};

type Ui = { role: "user" | "assistant" | "tool"; content: string; tool?: string };

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const [ui, setUi] = useState<Ui[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("devstral");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [workdir, setWorkdir] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { invoke<string>("get_workdir").then(setWorkdir).catch(() => {}); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [ui]);

  async function pickFolder() {
    const p = await open({ directory: true });
    if (typeof p === "string") {
      const real = await invoke<string>("set_workdir", { path: p });
      setWorkdir(real);
    }
  }

  async function runAgent(text: string) {
    setBusy(true);
    let msgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(msgs);
    setUi(prev => [...prev, { role: "user", content: text }]);

    for (let iter = 0; iter < 30; iter++) {
      let idx = 0;
      setUi(prev => { idx = prev.length; return [...prev, { role: "assistant", content: "" }]; });
      const a = await streamChat(baseUrl, model, msgs, TOOLS as any, (delta) => {
        setUi(prev => { const c = [...prev];
          c[idx] = { ...c[idx], content: (c[idx].content || "") + delta }; return c; });
      });
      msgs = [...msgs, a];
      setMessages(msgs);
      if (!a.tool_calls?.length) break;

      for (const tc of a.tool_calls) {
        const name = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        setUi(prev => [...prev, { role: "tool", content: "",
          tool: `${name}(${Object.values(args)[0] ?? ""})` }]);
        let result: string;
        try { result = await invoke<string>(CMD[name], args); }
        catch (e) { result = `Error: ${e}`; }
        msgs = [...msgs, { role: "tool", tool_call_id: tc.id, content: String(result) }];
        setMessages(msgs);
      }
    }
    setBusy(false);
  }

  function submit() {
    if (!input.trim() || busy) return;
    const t = input; setInput(""); runAgent(t);
  }

  return (
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex",
                  flexDirection: "column", fontFamily: "ui-monospace, Menlo, monospace" }}>
      <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`,
                    display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: C.accent, fontWeight: "bold" }}>LocalClaude</span>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} title="Ollama URL"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text,
                   padding: "4px 8px", borderRadius: 4, width: 220 }} />
        <input value={model} onChange={e => setModel(e.target.value)} title="Model"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text,
                   padding: "4px 8px", borderRadius: 4, width: 140 }} />
        <span style={{ color: C.tool, fontSize: 12 }}>{workdir}</span>
        <button onClick={pickFolder}
          style={{ marginLeft: "auto", background: C.panel, color: C.text,
                   border: `1px solid ${C.border}`, padding: "4px 12px",
                   borderRadius: 4, cursor: "pointer" }}>📁 workdir</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {ui.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, display: "flex", gap: 12 }}>
            <div style={{ minWidth: 70, fontSize: 12,
              color: m.role === "user" ? C.user : m.role === "tool" ? C.tool : C.accent }}>
              {m.role}
            </div>
            <div style={{ whiteSpace: "pre-wrap", flex: 1, fontSize: 13, lineHeight: 1.5 }}>
              {m.tool ? <code style={{ color: C.tool }}>🔧 {m.tool}</code> : m.content}
              {busy && i === ui.length - 1 && <span style={{ color: C.accent }}>▋</span>}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
        <textarea value={input} disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); submit(); } }}
          placeholder={busy ? "agent working..." : "Опиши задачу. Ctrl+Enter — отправить"}
          style={{ width: "100%", minHeight: 80, background: C.panel,
                   border: `1px solid ${C.border}`, color: C.text, padding: 12,
                   borderRadius: 6, resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
      </div>
    </div>
  );
}
