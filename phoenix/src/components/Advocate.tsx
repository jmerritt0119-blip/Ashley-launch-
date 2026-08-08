import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { buildCaseSnapshot, streamAdvocate, QUICK_ACTIONS, type AdvocateTurn } from "../claude";
import { handoff } from "../handoff";
import type { Settings } from "../settings";

interface Props {
  settings: Settings;
  goSettings: () => void;
}

export default function Advocate({ settings, goSettings }: Props) {
  const chat = useLiveQuery(() => db.chat.orderBy("createdAt").toArray(), []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.length, live]);

  // A page (e.g. Key dates) can hand off a prepared question.
  useEffect(() => {
    const prefill = sessionStorage.getItem("phx_advocate_prefill");
    if (prefill) {
      sessionStorage.removeItem("phx_advocate_prefill");
      setInput(prefill);
    }
  }, []);

  const needsKey = settings.connection === "direct" && !settings.apiKey;

  // The home screen's Ask box hands the question here — send it the moment
  // the conversation has loaded, no extra tap.
  const [pendingAsk, setPendingAsk] = useState<string | null>(() => {
    const q = handoff.ask;
    handoff.ask = null;
    return q;
  });
  useEffect(() => {
    if (pendingAsk && chat !== undefined && !busy && !needsKey) {
      const q = pendingAsk;
      setPendingAsk(null);
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk, chat === undefined, busy, needsKey]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    await db.chat.add({ role: "user", content, createdAt: Date.now() });

    try {
      const history: AdvocateTurn[] = [
        ...(chat || []).map((c) => ({ role: c.role, content: c.content })),
        { role: "user" as const, content },
      ];
      const caseContext = settings.shareContext ? await buildCaseSnapshot(settings.county, settings.hisNames) : null;
      let acc = "";
      const full = await streamAdvocate({
        connection: settings.connection,
        apiKey: settings.apiKey,
        model: settings.model,
        history,
        caseContext,
        onDelta: (d) => {
          acc += d;
          setLive(acc);
        },
      });
      await db.chat.add({ role: "assistant", content: full || acc, createdAt: Date.now() });
    } catch (e: any) {
      const msg = e?.message || "Something went wrong reaching the AI.";
      setError(msg);
    } finally {
      setLive("");
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>The Advocate</h1>
      <p className="muted">
        Your always-available case strategist: relentless about your case and your daughter's
        safety, honest about the law, available at 2am when your attorney isn't. It prepares — your
        attorney decides. {settings.shareContext ? "It can see the case file you've built here." : "Case-file sharing is off (Settings)."}
      </p>

      {needsKey && (
        <div className="notice">
          Direct mode needs your Anthropic API key.{" "}
          <a style={{ cursor: "pointer" }} onClick={goSettings}>
            Add it in Settings
          </a>{" "}
          — or switch the AI connection to "This site's server".
        </div>
      )}

      <div className="quick-actions">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            className="btn secondary sm"
            disabled={busy || needsKey}
            onClick={() => void send(qa.prompt)}
          >
            {qa.label}
          </button>
        ))}
      </div>

      <div className="chat-box">
        {(chat || []).map((c) => (
          <div className={`bubble ${c.role}`} key={c.id}>
            <div className="who">{c.role === "user" ? "You" : "The Advocate"}</div>
            {c.content}
            {c.role === "assistant" && (
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    const firstLine =
                      c.content
                        .split("\n")
                        .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
                        .find((l) => l.length > 0) || "Advocate notes";
                    const now = Date.now();
                    void db.documents
                      .add({
                        title: firstLine.slice(0, 80),
                        content: c.content,
                        createdAt: now,
                        updatedAt: now,
                      })
                      .then(() => alert("Saved to Documents — edit, print, or export it there."));
                  }}
                >
                  Save to documents
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant">
            <div className="who">The Advocate</div>
            {live || "…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="notice" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      <div className="chat-input no-print">
        <textarea
          placeholder="Ask anything — a hearing coming up, something he did today, a letter you received…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(input);
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn" disabled={busy || needsKey || !input.trim()} onClick={() => void send(input)}>
            Send
          </button>
          <button
            className="btn ghost sm"
            onClick={() => {
              if (confirm("Clear this conversation? Your logs and evidence are not affected.")) {
                void db.chat.clear();
              }
            }}
          >
            Clear chat
          </button>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        The Advocate gives legal information and preparation, not legal advice — decisions belong
        with you and a licensed attorney. In an emergency: 911. Any hour: 1-800-799-7233, or text
        START to 88788.
      </p>
    </div>
  );
}
