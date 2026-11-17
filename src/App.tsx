import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { streamChat, SYSTEM_PROMPT, type Msg } from "./agent";
import { TOOLS, CMD } from "./tools";

const C = {
  bg: "#1c1b19", panel: "#242220", border: "#3b3833",
  text: "#e5e3d7", accent: "#d97757", user: "#8ab4f8", tool: "#a09f99",
};

type Ui = { role: "user" | "assistant" | "tool"; content: string; tool?: string };

// СПИСОК МОДЕЛЕЙ С РЕАЛЬНЫМИ ССЫЛКАМИ НА HUGGING FACE
const MODELS = [
  { id: "lfm3-1.7b", name: "LFM3 1.7B (Uncensored)", size: "1.1 GB", url: "https://huggingface.co/AtomicChat/LFM3-1.7B-Uncensored-GGUF/resolve/main/LFM3-1.7B-Uncensored-AD-Q4_K_M.gguf" },
  { id: "llama-3-8b", name: "Llama 3 8B", size: "4.7 GB", url: "https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf" },
  { id: "qwen-coder-1.5b", name: "Qwen 2.5 Coder 1.5B", size: "1.0 GB", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf" },
  { id: "phi-3-mini", name: "Phi-3 Mini 3.8B", size: "2.3 GB", url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf" },
  { id: "gemma-2-2b", name: "Gemma 2 2B", size: "1.6 GB", url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf" },
  { id: "tinyllama-1.1b", name: "TinyLlama 1.1B", size: "0.6 GB", url: "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" },
  { id: "stablelm-2-1.6b", name: "StableLM 2 1.6B", size: "1.0 GB", url: "https://huggingface.co/TheBloke/stablelm-zephyr-3b-GGUF/resolve/main/stablelm-zephyr-3b.Q4_K_M.gguf" },
  { id: "qwen-2-1.5b", name: "Qwen 2 1.5B", size: "0.9 GB", url: "https://huggingface.co/Qwen/Qwen2-1.5B-Instruct-GGUF/resolve/main/qwen2-1_5b-instruct-q4_k_m.gguf" },
  { id: "smollm-1.7b", name: "SmolLM 1.7B", size: "1.0 GB", url: "https://huggingface.co/HuggingFaceTB/SmolLM-1.7B-Instruct-GGUF/resolve/main/smollm-1.7b-instruct-q4_k_m.gguf" },
  { id: "deepseek-coder-1.3b", name: "DeepSeek Coder 1.3B", size: "0.8 GB", url: "https://huggingface.co/TheBloke/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf" },
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCoder, setShowCoder] = useState(false);
  
  const [installedModel, setInstalledModel] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [messages, setMessages] = useState<Msg[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const [ui, setUi] = useState<Ui[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [ui]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (username.length > 1) setIsLoggedIn(true);
  }

  // Скачивание модели (открывает браузер телефона)
  function downloadModel(url: string, name: string) {
    // В мобильном приложении window.open откроет системный браузер
    window.open(url, "_blank");
    // Записываем, что модель "установлена"
    setInstalledModel(name);
    alert(`Скачивание ${name} начато.\nФайл сохранится в папку "Загрузки".\nПосле скачивания загрузите его в LC Coder.`);
  }

  function downloadCustom() {
    if (!customUrl) return;
    window.open(customUrl, "_blank");
    setInstalledModel("Custom Model");
    alert("Скачивание начато. Проверьте папку Загрузки.");
  }

  async function runAgent(text: string) {
    if (!installedModel) {
      alert("Сначала скачай модель в настройках!");
      return;
    }
    setBusy(true);
    setIsTruncated(false);
    let msgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(msgs);
    setUi(prev => [...prev, { role: "user", content: text }]);

    for (let iter = 0; iter < 30; iter++) {
      let idx = 0;
      setUi(prev => { idx = prev.length; return [...prev, { role: "assistant", content: "" }]; });
      
      const a = await streamChat("http://localhost", installedModel, msgs, TOOLS as any, (delta) => {
        setUi(prev => { const c = [...prev];
          c[idx] = { ...c[idx], content: (c[idx].content || "") + delta }; return c; });
      });
      
      msgs = [...msgs, a];
      setMessages(msgs);
      
      if (!a.tool_calls?.length) {
        if (a.content && a.content.length > 0 && !a.content.endsWith(".")) {
          setIsTruncated(true);
        }
        break;
      }

      for (const tc of a.tool_calls) {
        const name = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        setUi(prev => [...prev, { role: "tool", content: "", tool: `${name}(${Object.values(args)[0] ?? ""})` }]);
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

  function continueGen() {
    setIsTruncated(false);
    runAgent("Продолжай ровно с того места, где ты остановился. Не пиши вступлений.");
  }

  if (!isLoggedIn) {
    return (
      <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <form onSubmit={handleLogin} style={{ background: C.panel, padding: 30, borderRadius: 12, border: `1px solid ${C.border}`, width: "80%", maxWidth: 300, textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.accent, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: "bold", color: "#fff" }}>LC</div>
          <input placeholder="Никнейм" value={username} onChange={e => setUsername(e.target.value)} style={{ width: "90%", padding: 12, marginBottom: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
          <input placeholder="Пароль" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "90%", padding: 12, marginBottom: 20, background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} />
          <button type="submit" style={{ width: "100%", padding: 12, background: C.accent, color: "white", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 16 }}>Войти</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, color: C.text, height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", position: "relative" }}>
      
      <div style={{ padding: "15px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.accent, fontSize: 20 }}>✻</span>
          <span style={{ fontWeight: "600", fontSize: 16 }}>LC</span>
        </div>
        <div onClick={() => setShowSettings(true)} style={{ cursor: "pointer", fontSize: 20, color: C.tool }}>⚙️</div>
      </div>

      {showSettings && (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: C.bg, zIndex: 100, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "bold", fontSize: 18 }}>Настройки</span>
            <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", color: C.accent, fontSize: 16, cursor: "pointer" }}>Готово</button>
          </div>
          
          <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
            <div style={{ background: C.panel, padding: 20, borderRadius: 12, marginBottom: 20, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 16, fontWeight: "bold", marginBottom: 5 }}>LC Coder</div>
              <div style={{ fontSize: 12, color: C.tool, marginBottom: 15 }}>
                {installedModel ? `Модель: ${installedModel}` : "Ваша ИИ модель не установлена"}
              </div>
              <button onClick={() => setShowCoder(true)} style={{ width: "100%", background: C.text, color: C.bg, padding: 10, borderRadius: 8, border: "none", fontWeight: "bold", cursor: "pointer" }}>
                Открыть терминал
              </button>
            </div>

            <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 10 }}>Своя ссылка на GGUF</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <input 
                value={customUrl} onChange={e => setCustomUrl(e.target.value)} 
                placeholder="https://huggingface.co/..." 
                style={{ flex: 1, padding: 10, background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8 }} 
              />
              <button onClick={downloadCustom} style={{ background: C.accent, color: "white", border: "none", padding: "0 15px", borderRadius: 8, fontWeight: "bold", cursor: "pointer" }}>Скачать</button>
            </div>

            <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 10 }}>Или выбери из списка</div>
            {MODELS.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 15, borderBottom: `1px solid ${C.border}`, background: installedModel === m.name ? C.panel : "transparent" }}>
                <div>
                  <div style={{ fontSize: 14, color: installedModel === m.name ? C.accent : C.text }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: C.tool }}>{m.size}</div>
                </div>
                <button onClick={() => downloadModel(m.url, m.name)} style={{ background: "transparent", border: "none", color: installedModel === m.name ? C.accent : C.user, cursor: "pointer", fontSize: 14, fontWeight: "bold" }}>
                  {installedModel === m.name ? "✓ Установлена" : "Скачать"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCoder && (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "#000", zIndex: 200, display: "flex", flexDirection: "column", fontFamily: "monospace" }}>
          <div style={{ padding: 10, background: "#111", display: "flex", justifyContent: "space-between", color: C.accent }}>
            <span>LC Coder Terminal</span>
            <button onClick={() => setShowCoder(false)} style={{ background: "transparent", border: "none", color: "red" }}>Закрыть</button>
          </div>
          <div style={{ padding: 15, color: "#0f0", flex: 1, overflowY: "auto" }}>
            <p>root@lc-mobile:~# Модель: {installedModel || "Не установлена"}</p>
            <p>root@lc-mobile:~# Готов к работе. Выполняйте команды.</p>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {ui.length === 0 && (
          <div style={{ textAlign: "center", marginTop: "30vh" }}>
            <h1 style={{ color: C.text, fontSize: 24, fontWeight: "500" }}>✻ Привет, {username}</h1>
            <p style={{ color: C.tool, fontSize: 14 }}>Чем я могу помочь тебе сегодня?</p>
          </div>
        )}
        {ui.map((m, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: m.role === "user" ? C.user : C.accent, marginBottom: 5 }}>
              {m.role === "user" ? "Вы" : m.role === "tool" ? "Инструмент" : "LC"}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {m.tool ? <div style={{ background: C.panel, padding: 10, borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}>⚙️ {m.tool}</div> : m.content}
              {busy && i === ui.length - 1 && <span style={{ animation: "blink 1s infinite" }}>▋</span>}
            </div>
          </div>
        ))}
        
        {isTruncated && !busy && (
          <button onClick={continueGen} style={{ display: "block", margin: "20px auto", background: C.panel, color: C.text, border: `1px solid ${C.border}`, padding: "10px 20px", borderRadius: 20, cursor: "pointer", fontWeight: "bold" }}>
            Продолжить
          </button>
        )}
        <div ref={bottom} />
      </div>

      <div style={{ padding: 15, paddingBottom: 30 }}>
        <div style={{ display: "flex", background: C.panel, borderRadius: 24, border: `1px solid ${C.border}`, padding: "5px 15px", alignItems: "center" }}>
          <textarea 
            value={input} 
            onChange={e => setInput(e.target.value)}
            placeholder="Спросите что-нибудь..."
            style={{ flex: 1, background: "transparent", border: "none", color: C.text, padding: 10, resize: "none", height: 24, fontFamily: "inherit", fontSize: 16, outline: "none" }}
          />
          <button onClick={submit} disabled={busy} style={{ background: C.accent, color: "white", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "not-allowed" : "pointer" }}>
            ↑
          </button>
        </div>
      </div>
      
      <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } } body { margin: 0; }`}</style>
    </div>
  );
}
