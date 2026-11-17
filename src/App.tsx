import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { streamChat, SYSTEM_PROMPT, type Msg } from "./agent";
import { TOOLS, CMD } from "./tools";

// Цвета 1:1 как у Claude
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
  const [showSettings, setShowSettings] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const [ui, setUi] = useState<Ui[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  
  // По умолчанию ставим настройки для работы с GitHub
  const [model, setModel] = useState("lfm3-1.7b-github");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [workdir, setWorkdir] = useState("");
  
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

  // ЭКРАН ЛОГИНА
  if (!isLoggedIn) {
    return (
      <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, Menlo" }}>
        <form onSubmit={handleLogin} style={{ background: C.panel, padding: 40, borderRadius: 8, border: `1px solid ${C.border}`, width: 300, textAlign: "center" }}>
          <h2 style={{ color: C.accent, marginTop: 0, fontWeight: "normal" }}>✻ LC</h2>
          <p style={{ fontSize: 12, color: C.tool }}>Local Claude Code</p>
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
      
      {/* ОКНО НАСТРОЕК (МОДАЛЬНОЕ) */}
      {showSettings && (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: C.panel, padding: 30, borderRadius: 8, border: `1px solid ${C.border}`, width: 400 }}>
            <h3 style={{ color: C.accent, marginTop: 0 }}>Настройки</h3>
            
            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 12, color: C.tool, marginBottom: 5 }}>Аккаунт</div>
              <input value={username} disabled style={{ width: "95%", padding: 8, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <div style={{ fontSize: 12, color: C.tool, marginBottom: 5 }}>Модель</div>
              <input value={model} onChange={e => setModel(e.target.value)} style={{ width: "95%", padding: 8, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.tool, marginBottom: 5 }}>API URL</div>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ width: "95%", padding: 8, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4 }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => setShowSettings(false)} style={{ background: C.accent, color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}>Сохранить</button>
              <button onClick={() => { setShowSettings(false); setIsLoggedIn(false); }} style={{ background: "transparent", color: "red", border: "1px solid red", padding: "8px 16px", borderRadius: 4, cursor: "pointer" }}>Выйти из аккаунта</button>
            </div>
          </div>
        </div>
      )}

      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <div style={{ width: 260, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, color: C.accent, fontWeight: "bold", fontSize: 18 }}>
          ✻ LC <span style={{ fontSize: 10, color: C.tool, fontWeight: "normal" }}>v3.5</span>
        </div>
        
        <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
          <div style={{ color: C.tool, fontSize: 11, textTransform: "uppercase", marginBottom: 10, letterSpacing: 1 }}>Проект</div>
          <div style={{ fontSize: 13, wordBreak: "break-all", marginBottom: 10 }}>{workdir || "Не выбрана"}</div>
          <button onClick={pickFolder} style={{ width: "100%", background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            Выбрать папку
          </button>
          
          <div style={{ color: C.tool, fontSize: 11, textTransform: "uppercase", marginTop: 30, marginBottom: 10, letterSpacing: 1 }}>Модель</div>
          <div style={{ fontSize: 12, color: C.accent }}>{model}</div>
          <div style={{ fontSize: 11, color: C.tool, marginTop: 5 }}>{baseUrl}</div>
        </div>

        <div style={{ padding: 20, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: C.text }}>{username}</span>
          <button onClick={() => setShowSettings(true)} style={{ background: "transparent", color: C.tool, border: "none", cursor: "pointer", fontSize: 16 }} title="Настройки">
            ⚙️
          </button>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: "40px 10%" }}>
          {ui.length === 0 && (
            <div style={{ marginTop: 50, textAlign: "center" }}>
              <h1 style={{ color: C.accent, fontSize: 24, fontWeight: "normal" }}>✻ Local Claude Code</h1>
              <p style={{ color: C.tool, fontSize: 14 }}>Мы справимся с любой задачей. (v3.5)</p>
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
