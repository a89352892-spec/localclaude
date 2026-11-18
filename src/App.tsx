import { useEffect, useRef, useState } from "react";
import { LlamaCpp } from "llama-cpp-capacitor";

const C = {
  bg: "#1c1b19", panel: "#242220", border: "#3b3833",
  text: "#e5e3d7", accent: "#d97757", user: "#8ab4f8", tool: "#a09f99",
};

type Ui = { role: "user" | "assistant"; content: string };

const MODELS = [
  { id: "tinyllama-1.1b", name: "TinyLlama 1.1B", size: "0.6 GB", path: "/storage/emulated/0/Download/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" },
  { id: "lfm3-1.7b", name: "LFM3 1.7B", size: "1.1 GB", path: "/storage/emulated/0/Download/lfm3-1.7b-uncensored.gguf" },
  { id: "qwen2.5-1.5b", name: "Qwen 2.5 1.5B", size: "1.0 GB", path: "/storage/emulated/0/Download/qwen2.5-1.5b-instruct-q4_k_m.gguf" },
  { id: "phi3-mini", name: "Phi-3 Mini", size: "2.3 GB", path: "/storage/emulated/0/Download/phi-3-mini-4k-instruct-q4.gguf" },
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  const [installedModel, setInstalledModel] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");

  const [ui, setUi] = useState<Ui[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  
  const bottom = useRef<HTMLDivElement>(null);
  const llamaRef = useRef<LlamaCpp | null>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [ui]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (username.length > 1) setIsLoggedIn(true);
  }

  // ЗАГРУЗКА МОДЕЛИ ЧЕРЕЗ НАТИВНЫЙ ПЛАГИН
  async function loadModel(modelPath: string, modelName: string) {
    setLoadingModel(true);
    setLoadingProgress("Инициализация llama.cpp...");
    try {
      const llama = new LlamaCpp();
      await llama.initContext({
        model: modelPath,
        n_ctx: 2048,
        n_threads: 4,
        use_mlock: true,
        use_mmap: true,
      });
      llamaRef.current = llama;
      setInstalledModel(modelName);
      setModelLoaded(true);
      setLoadingModel(false);
      alert(`Модель ${modelName} успешно загружена! Можно общаться.`);
    } catch (e: any) {
      alert("Ошибка загрузки модели: " + (e.message || e));
      setLoadingModel(false);
      setModelLoaded(false);
    }
  }

  async function runAgent(text: string) {
    if (!llamaRef.current || !modelLoaded) {
      alert("Сначала загрузи модель в настройках!");
      return;
    }
    setBusy(true);
    setUi(prev => [...prev, { role: "user", content: text }]);
    
    let newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setUi(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const result = await llamaRef.current.chat({
        messages: newMessages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: true,
      });

      let fullText = "";
      // Плагин поддерживает стриминг через callback (упрощенно)
      if (result && result.text) {
        fullText = result.text;
        setUi(prev => {
          const c = [...prev];
          c[c.length - 1] = { role: "assistant", content: fullText };
          return c;
        });
      }
      setMessages([...newMessages, { role: "assistant", content: fullText }]);
    } catch (e: any) {
      setUi(prev => [...prev, { role: "assistant", content: "Ошибка: " + (e.message || e) }]);
    }
    setBusy(false);
  }

  function submit() {
    if (!input.trim() || busy) return;
    const t = input; setInput(""); runAgent(t);
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
            <div style={{ fontSize: 14, fontWeight: "bold", marginBottom: 10 }}>Выберите модель для загрузки</div>
            {loadingModel && <div style={{ color: C.accent, marginBottom: 10 }}>{loadingProgress}</div>}
            {modelLoaded && <div style={{ color: "green", marginBottom: 10 }}>✓ Модель загружена и готова</div>}
            
            {MODELS.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 15, borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 14, color: C.text }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: C.tool }}>{m.size}</div>
                </div>
                <button disabled={loadingModel} onClick={() => loadModel(m.path, m.name)} style={{ background: "transparent", border: "none", color: C.user, cursor: "pointer", fontSize: 14, fontWeight: "bold" }}>
                  {installedModel === m.name ? "✓ Загружена" : "Загрузить"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {ui.length === 0 && (
          <div style={{ textAlign: "center", marginTop: "30vh" }}>
            <h1 style={{ color: C.text, fontSize: 24, fontWeight: "500" }}>✻ Привет, {username}</h1>
            <p style={{ color: C.tool, fontSize: 14 }}>{modelLoaded ? "Модель загружена. Спроси что-нибудь." : "Загрузи модель в настройках, чтобы начать."}</p>
          </div>
        )}
        {ui.map((m, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: "bold", color: m.role === "user" ? C.user : C.accent, marginBottom: 5 }}>
              {m.role === "user" ? "Вы" : "LC"}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {m.content}
              {busy && i === ui.length - 1 && <span style={{ animation: "blink 1s infinite" }}>▋</span>}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div style={{ padding: 15, paddingBottom: 30 }}>
        <div style={{ display: "flex", background: C.panel, borderRadius: 24, border: `1px solid ${C.border}`, padding: "5px 15px", alignItems: "center" }}>
          <textarea 
            value={input} 
            onChange={e => setInput(e.target.value)}
            placeholder={modelLoaded ? "Спросите что-нибудь..." : "Сначала загрузите модель"}
            disabled={!modelLoaded}
            style={{ flex: 1, background: "transparent", border: "none", color: C.text, padding: 10, resize: "none", height: 24, fontFamily: "inherit", fontSize: 16, outline: "none" }}
          />
          <button onClick={submit} disabled={busy || !modelLoaded} style={{ background: C.accent, color: "white", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: (busy || !modelLoaded) ? "not-allowed" : "pointer" }}>
            ↑
          </button>
        </div>
      </div>
      
      <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } } body { margin: 0; }`}</style>
    </div>
  );
}
