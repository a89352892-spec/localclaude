import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { streamChat, SYSTEM_PROMPT, type Msg } from "./agent";
import { TOOLS, CMD } from "./tools";

// Цвета оригинального Claude
const C = {
  bg: "#1c1b19", sidebar: "#141413", panel: "#242220", border: "#3b3833",
  text: "#e5e3d7", accent: "#d97757", user: "#8ab4f8", tool: "#a09f99",
};

type Ui = { role: "user" | "assistant" | "tool"; content: string; tool?: string };

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [messages, setMessages] = useState<Msg[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const [ui, setUi] = useState<Ui[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("claude-3-5-sonnet-latest");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [workdir, setWorkdir] = useState("");
  
  const [ggufPath, setGgufPath] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { invoke<string>("get_workdir").then(setWorkdir).catch(() => {}); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [ui]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (username === "ADMiN" && password === "admiN") {
      setIsLoggedIn(true); setLoginError("");
    } else if (username.length > 2 && password.length > 2) {
      setIsLoggedIn(true); setLoginError("");
    } else {
      setLoginError("Ник и пароль должны быть больше 2 символов");
    }
  }

  async function pickFolder() {
    const p = await open({ directory: true });
    if (typeof p === "string") {
      const real = await invoke<string>("set_workdir", { path: p });
      setWorkdir(real);
    }
  }

  async function pickGguf() {
    const p = await open({ filters: [{ name: "GGUF", extensions: ["gguf"] }] });
    if (typeof p === "string") {
      setGgufPath(p);
      const msg = await invoke<string>("load_gguf", { path: p });
      alert(msg + "\n\nНастройте URL на http://localhost:8080 чтобы использовать локальную модель.");
      setBaseUrl("http://localhost:8080");
      setModel("local-model");
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

  if (!isLoggedIn) {
    return (
      <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, Menlo" }}>
        <form onSubmit={handleLogin} style={{ background: C.panel, padding: 40, borderRadius: 8, border: `1px solid ${C.border}`, width: 300, textAlign: "center" }}>
          <h2 style={{ color: C.accent, marginTop: 0 }}>Claude Code</h2>
          <p style={{ fontSize: 12, color: C.tool }}>Вход в систему</p>
          <input placeholder="Имя пользователя" value={username} onChange={e => setUsername(e.target.value)} style={{ width: "90%", padding: 10, marginBottom: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4 }} />
          <input placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "90%", padding: 10, marginBottom: 15, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4 }} />
          {loginError && <p style={{ color: "red", fontSize: 12 }}>{loginError}</p>}
          <button type="submit" style={{ width: "100%", padding: 10, background: C.accent, color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}>Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", fontFamily: "ui-monospace, Menlo", overflow: "hidden" }}>
      
      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <div style={{ width: 280, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: "bold", fontSize: 16, display: "flex", justifyContent: "space-between" }}>
          <span>✻ Claude Code</span>
          <span style={{ fontSize: 10, color: C.tool, alignSelf: "center" }}>v3.0</span>
        </div>
        
        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          <div style={{ color: C.tool, fontSize: 11, textTransform: "uppercase", marginBottom: 10, letterSpacing: 1 }}>Проект</div>
          <div style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 10 }}>{workdir || "Не выбрана"}</div>
          <button onClick={pickFolder} style={{ width: "100%", background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            Выбрать папку
          </button>

          <div style={{ color: C.tool, fontSize: 11, textTransform: "uppercase", marginTop: 30, marginBottom: 10, letterSpacing: 1 }}>Модель (GGUF)</div>
          <button onClick={pickGguf} style={{ width: "100%", background: C.panel, color: C.text, border: `1px dashed ${C.border}`, padding: "12px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            📁 Загрузить .gguf
          </button>
          {ggufPath && <div style={{ fontSize: 10, color: C.accent, marginTop: 8, wordBreak: "break-all" }}>Выбран: {ggufPath.split('\\').pop()}</div>}
        
          <div style={{ color: C.tool, fontSize: 11, textTransform: "uppercase", marginTop: 30, marginBottom: 10, letterSpacing: 1 }}>Настройки</div>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="Модель" style={{ width: "90%", background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: "8px", borderRadius: 4, marginBottom: 8, fontSize: 12 }} />
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="URL" style={{ width: "90%", background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: "8px", borderRadius: 4, fontSize: 12 }} />
        </div>

        <div style={{ padding: 20, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.tool }}>
          Пользователь: <span style={{ color: C.text }}>{username}</span>
          <button onClick={() => setIsLoggedIn(false)} style={{ background: "transparent", color: "red", border: "none", cursor: "pointer", marginTop: 10, padding: 0, fontSize: 12 }}>Выйти</button>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: "40px 10%" }}>
          {ui.length === 0 && (
            <div style={{ marginTop: 50, textAlign: "center" }}>
              <h1 style={{ color: C.accent, fontSize: 24, fontWeight: "normal" }}>✻ Добро пожаловать в Claude Code</h1>
              <p style={{ color: C.tool, fontSize: 14 }}>Мы справимся с любой задачей.</p>
            </div>
          )}
          {ui.map((m, i) => (
            <div key={i} style={{ marginBottom: 24, display: "flex", gap: 16 }}>
              <div style={{ minWidth: 80, fontSize: 13, fontWeight: "bold", marginTop: 2,
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

        <div style={{ padding: "0 10% 40px 10%" }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <textarea 
              value={input} 
              disabled={busy}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
              placeholder={busy ? "Claude печатает..." : "Какую задачу нужно выполнить?"}
              style={{ width: "100%", minHeight: 80, background: "transparent", border: "none", color: C.text, padding: 16, resize: "none", fontFamily: "inherit", fontSize: 14, outline: "none" }}
            />
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.sidebar }}>
              <span style={{ fontSize: 11, color: C.tool }}>{model}</span>
              <button onClick={submit} disabled={busy} style={{ background: C.accent, color: "white", border: "none", padding: "6px 20px", borderRadius: 4, cursor: busy ? "not-allowed" : "pointer", fontWeight: "bold", opacity: busy ? 0.5 : 1 }}>
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } } ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }`}</style>
    </div>
  );
}
