import { useState } from "react";
import UploadPanel from "./components/UploadPanel";
import StreamingContainer from "./components/StreamingContainer";
import { usePaperStream } from "./hooks/usePaperStream";

interface StepResult {
  title?: string;
  research_gap?: string;
  core_methodology?: string;
  structural_tree?: {
    problem_definition?: string[];
    technical_approach?: string[];
    empirical_evidence?: string[];
  };
}

const App = () => {
  const [paperId, setPaperId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("等待上传论文...");
  const [step1Text, setStep1Text] = useState("");
  const [step1Done, setStep1Done] = useState(false);
  const [step1Data, setStep1Data] = useState<StepResult | null>(null);

  const { sendAction, connected } = usePaperStream(paperId, {
    onStatusChange: (msg) => setStatusText(msg),
    onStep1Stream: (chunk) => setStep1Text((prev) => prev + chunk),
    onStep1Done: (data) => {
      setStep1Data(data ?? null);
      setStep1Done(true);
      setStatusText("结构化分析已完成");
    },
  });

  const handleUploaded = (newPaperId: string) => {
    setPaperId(newPaperId);
    setStep1Text("");
    setStep1Data(null);
    setStep1Done(false);
    setStatusText("上传完成，等待开始分析...");
  };

  const handleStartAnalyze = () => {
    if (!paperId) return;
    setStep1Text("");
    setStep1Data(null);
    setStep1Done(false);
    setStatusText("正在生成结构化内容...");
    sendAction("analyze_step1");
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12 md:px-10">
      <section className="mb-10 rounded-3xl border border-slate-200/70 bg-white/85 p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-blue-700/90">
          Academic Agent
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-800 md:text-4xl">
          论文结构化分析工作台
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          流式结果将自动转为中文卡片，按步骤展示，并持续给出分析进度。
        </p>
      </section>

      <UploadPanel
        connected={connected}
        hasPaper={Boolean(paperId)}
        statusText={statusText}
        onUploaded={handleUploaded}
        onStartAnalyze={handleStartAnalyze}
      />

      <StreamingContainer
        streamText={step1Text}
        step1Data={step1Data}
        connected={connected}
        hasPaper={Boolean(paperId)}
        statusText={statusText}
        step1Done={step1Done}
      />
    </main>
  );
};

export default App;
