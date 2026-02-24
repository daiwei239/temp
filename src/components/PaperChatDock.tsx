import { FormEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
}

export type AnswerMode = "concise" | "detailed";

interface PaperChatDockProps {
  messages: ChatMessage[];
  connected: boolean;
  hasPaper: boolean;
  sending: boolean;
  showInput: boolean;
  onSend: (question: string, mode: AnswerMode) => void;
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

const PaperChatDock = ({ messages, connected, hasPaper, sending, showInput, onSend }: PaperChatDockProps) => {
  const [input, setInput] = useState("");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("concise");
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = hasPaper && connected && input.trim().length > 0 && !sending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || !canSend) return;
    onSend(question, answerMode);
    setInput("");
  };

  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : "";
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, lastMessageContent]);

  return (
    <section className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6 md:p-7">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">论文追问对话</h3>
        <p className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
          {connected ? "通道已连接" : "通道未连接"}
        </p>
      </div>

      <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-500">
            你可以围绕当前论文继续提问，例如：这个方法的创新点和局限是什么？
          </div>
        ) : (
          messages.map((msg) => (
            <motion.article
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={msg.role === "user" ? "ml-auto max-w-[84%]" : "max-w-[90%]"}
            >
              <div
                className={[
                  "rounded-2xl border px-4 py-3 text-[15px] leading-7",
                  msg.role === "user"
                    ? "border-blue-200 bg-blue-50 text-slate-800"
                    : "border-slate-200 bg-white text-slate-700",
                ].join(" ")}
              >
                <p className="mb-1.5 text-xs font-medium text-slate-500">{msg.role === "user" ? "你" : "论文助手"}</p>
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
        <div ref={chatBottomRef} />
      </div>

      {showInput ? (
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-3 text-sm text-slate-600">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <input
                type="radio"
                name="answer-mode"
                value="concise"
                checked={answerMode === "concise"}
                onChange={() => setAnswerMode("concise")}
                disabled={sending}
              />
              精简
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <input
                type="radio"
                name="answer-mode"
                value="detailed"
                checked={answerMode === "detailed"}
                onChange={() => setAnswerMode("detailed")}
                disabled={sending}
              />
              详细
            </label>
          </div>
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder={hasPaper ? "继续追问这篇论文，例如：请给出可复现实验设计建议。" : "请先上传并分析论文后再提问"}
              className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              disabled={!hasPaper || !connected || sending}
            />
            <button
              type="submit"
              disabled={!canSend}
              className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {sending ? "回答中..." : "发送"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
          结构化分析全部完成后可继续追问。
        </p>
      )}
    </section>
  );
};

export default PaperChatDock;
