import { FormEvent, useEffect, useState } from "react";
import { motion } from "framer-motion";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

interface PaperChatDockProps {
  messages: ChatMessage[];
  connected: boolean;
  hasPaper: boolean;
  sending: boolean;
  onSend: (question: string) => void;
}

const AssistantText = ({ text }: { text: string }) => {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (text.length < visible) {
      setVisible(text.length);
      return;
    }
    if (visible >= text.length) return;
    const timer = window.setInterval(() => {
      setVisible((prev) => Math.min(text.length, prev + 1));
    }, 12);
    return () => window.clearInterval(timer);
  }, [text, visible]);

  const isDone = visible >= text.length;
  return (
    <>
      {text.slice(0, visible)}
      {!isDone ? <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-slate-400 align-middle" /> : null}
    </>
  );
};

const PaperChatDock = ({ messages, connected, hasPaper, sending, onSend }: PaperChatDockProps) => {
  const [input, setInput] = useState("");

  const canSend = hasPaper && connected && input.trim().length > 0 && !sending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || !canSend) return;
    onSend(question);
    setInput("");
  };

  return (
    <>
      <section className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">论文追问对话</h3>
          <p className="text-xs text-slate-500">{connected ? "通道已连接" : "通道未连接"}</p>
        </div>

        <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              你可以围绕当前论文继续提问，例如: 这个方法的创新点和局限是什么？
            </div>
          ) : (
            messages.map((msg) => (
              <motion.article
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={msg.role === "user" ? "ml-auto max-w-[88%]" : "max-w-[92%]"}
              >
                <div
                  className={[
                    "rounded-2xl border px-4 py-3 text-sm leading-7",
                    msg.role === "user"
                      ? "border-blue-200 bg-blue-50 text-slate-800"
                      : "border-slate-200 bg-white text-slate-700",
                  ].join(" ")}
                >
                  <p className="mb-1 text-xs font-medium text-slate-500">{msg.role === "user" ? "你" : "论文助手"}</p>
                  <p className="whitespace-pre-wrap">
                    {msg.role === "assistant"
                      ? (msg.content.trim()
                          ? <AssistantText text={msg.content} />
                          : (msg.streaming ? "正在思考中..." : ""))
                      : msg.content}
                  </p>
                </div>
              </motion.article>
            ))
          )}
        </div>
      </section>

      <form
        onSubmit={submit}
        className="fixed bottom-5 left-1/2 z-50 w-[min(860px,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={hasPaper ? "继续追问这篇论文，例如: 请给出可复现实验设计建议。" : "请先上传并分析论文后再提问"}
            className="h-16 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            disabled={!hasPaper || !connected || sending}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="h-16 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {sending ? "回答中..." : "发送"}
          </button>
        </div>
      </form>
    </>
  );
};

export default PaperChatDock;
