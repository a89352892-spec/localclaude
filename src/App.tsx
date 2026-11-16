import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { streamChat, SYSTEM_PROMPT, type Msg } from "./agent";
import { TOOLS, CMD } from "./tools";

const C = {
  bg: "#121212", sidebar: "#181818", panel: "#1e1e1e", border: "#2d2d2d",
  text: "#e0e0e0", accent: "#d97757", user: "#4a9eff", tool: "#888",
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
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", fontFamily: "ui-monospace, Menlo, monospace", overflow: "hidden" }}>
      
      {/* ЛЕВАЯ ПАНЕЛЬ (SIDEBAR) */}
      <div style={{ width: 260, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: "bold", fontSize: 18 }}>
          LocalClaude v2.0
        </div>
        <div style={{ padding: 20, color: C.tool, fontSize: 12 }}>
          Рабочая папка:<br/>
          <span style={{ color: C.text, wordBreak: "break-all" }}>{workdir || "Не выбрана"}</span>
          <button onClick={pickFolder} style={{ marginTop: 10, width: "100%", background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "8px", borderRadius: 4, cursor: "pointer" }}>
            📁 Выбрать папку
          </button>
        </div>
        
        <div style={{ marginTop: "auto", padding: 20, borderTop: `1px solid ${C.border}` }}>
          <div style={{ color: C.tool, fontSize: 12, marginBottom: 5 }}>Модель Ollama:</div>
          <input value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: "8px", borderRadius: 4, marginBottom: 10 }} />
          <div style={{ color: C.tool, fontSize: 12, marginBottom: 5 }}>URL сервера:</div>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: "8px", borderRadius: 4 }} />
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ (ЧАТ) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* Окно сообщений */}
        <div style={{ flex: 1, overflow: "auto", padding: "30px 10%" }}>
          {ui.length === 0 && (
            <div style={{ textAlign: "center", color: C.tool, marginTop: 100 }}>
              <h1 style={{ color: C.accent }}>Добро пожаловать в LocalClaude 2.0</h1>
              <p>Выбери рабочую папку слева и напиши задачу.</p>
            </div>
          )}
          {ui.map((m, i) => (
            <div key={i} style={{ marginBottom: 24, display: "flex", gap: 16 }}>
              <div style={{ minWidth: 80, fontSize: 12, fontWeight: "bold", marginTop: 2,
                color: m.role === "user" ? C.user : m.role === "tool" ? C.tool : C.accent }}>
                {m.role === "user" ? "Ты" : m.role === "tool" ? "Инструмент" : "Claude"}
              </div>
              <div style={{ whiteSpace: "pre-wrap", flex: 1, fontSize: 14, lineHeight: 1.6 }}>
                {m.tool ? (
                  <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 15px", borderRadius: 6, fontSize: 13, color: C.tool, fontStyle: "italic" }}>
                    ⚙️ {m.tool}
                  </div>
                ) : m.content}
                {busy && i === ui.length - 1 && <span style={{ color: C.accent, animation: "blink 1s infinite" }}>▋</span>}
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>

        {/* Поле ввода */}
        <div style={{ padding: "0 10% 30px 10%" }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <textarea 
              value={input} 
              disabled={busy}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
              placeholder={busy ? "Claude пишет код..." : "Опиши задачу. Ctrl+Enter — отправить"}
              style={{ width: "100%", minHeight: 80, background: "transparent", border: "none", color: C.text, padding: 16, resize: "none", fontFamily: "inherit", fontSize: 14, outline: "none" }}
            />
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.tool }}>Модель: {model}</span>
              <button onClick={submit} disabled={busy} style={{ background: C.accent, color: "#fff", border: "none", padding: "6px 16px", borderRadius: 4, cursor: busy ? "not-allowed" : "pointer", fontWeight: "bold", opacity: busy ? 0.5 : 1 }}>
                Отправить
              </button>
            </div>
          </div>
        </div>

      </div>
      
      <style>{`
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
      `}</style>
    </div>
  );
}
