import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import UploadPanel from "./components/UploadPanel";
import StreamingContainer from "./components/StreamingContainer";
import { usePaperStream } from "./hooks/usePaperStream";

interface StepResult {
  title?: string;
  research_gap?: string;
  core_methodology?: string;
  framework_map?: {
    nodes?: Array<{ id?: string; label?: string; kind?: string }>;
    links?: Array<{ from?: string; to?: string; label?: string }>;
  };
  flow_chart?: {
    title?: string;
    steps?: Array<{ name?: string; detail?: string }>;
  };
  structural_tree?: {
    problem_definition?: string[];
    technical_approach?: string[];
    empirical_evidence?: string[];
  };
}

type ViewKey = "home" | "search" | "recommend" | "polish";

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "首页" },
  { key: "search", label: "搜索" },
  { key: "recommend", label: "推荐" },
  { key: "polish", label: "文字润色" },
];

const SearchPage = () => {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
      <h2 className="text-2xl font-semibold text-slate-800">搜索</h2>
      <p className="mt-2 text-slate-600">输入关键词、作者或研究主题，快速定位论文与相关资料。</p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="例如：多模态检索增强生成、GraphRAG、可解释推荐..."
        />
        <button
          type="button"
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          立即搜索
        </button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">示例结果 01</p>
          <h3 className="mt-2 text-base font-semibold text-slate-800">Retrieval-Augmented Generation: Survey and Advances</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">聚焦 RAG 架构演进、评测方法与产业落地案例，适合综述类写作起步。</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">示例结果 02</p>
          <h3 className="mt-2 text-base font-semibold text-slate-800">GraphRAG for Long-Context Reasoning</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">介绍图结构检索在复杂问答中的优势，并给出知识组织与推理路径设计。</p>
        </article>
      </div>
    </section>
  );
};

const RecommendPage = () => {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
      <h2 className="text-2xl font-semibold text-slate-800">推荐</h2>
      <p className="mt-2 text-slate-600">根据你的研究兴趣与已读论文，生成可执行的阅读与选题建议。</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { title: "方向推荐", body: "跨模态检索 + 领域知识图谱，可提升长文档问答可追溯性。" },
          { title: "论文推荐", body: "优先补读 3 篇基线论文，再进入方法改进型工作。" },
          { title: "实验建议", body: "新增 ablation: 检索粒度、召回深度、重排模型三组对照。" },
        ].map((item) => (
          <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-800">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

const PolishPage = () => {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
      <h2 className="text-2xl font-semibold text-slate-800">文字润色</h2>
      <p className="mt-2 text-slate-600">粘贴段落后获取学术表达优化建议，包括术语统一、逻辑衔接与语气规范。</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="block rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-sm font-medium text-slate-700">原文输入</span>
          <textarea
            className="mt-3 h-40 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            placeholder="请输入需要润色的学术段落..."
          />
        </label>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">润色后（示例）</p>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            To improve robustness in long-context reasoning, we introduce a graph-structured retrieval module that explicitly models entity-level relations and evidence paths.
            Experimental results indicate that this design consistently improves answer faithfulness while preserving response efficiency.
          </p>
        </article>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          开始润色
        </button>
      </div>
    </section>
  );
};

const HomePage = () => {
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
    <>
      <section className="mb-10 rounded-3xl border border-slate-200 bg-slate-50 p-8">
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-blue-700/90">学术助手</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-800 md:text-4xl">论文结构化分析工作台</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">分析结果将以流式方式展示，并自动整理为结构化卡片，便于逐步阅读和理解。</p>
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
    </>
  );
};

const App = () => {
  const [activeView, setActiveView] = useState<ViewKey>("home");

  const CurrentView = useMemo(() => {
    if (activeView === "search") return <SearchPage />;
    if (activeView === "recommend") return <RecommendPage />;
    if (activeView === "polish") return <PolishPage />;
    return <HomePage />;
  }, [activeView]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-[1680px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-10">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 [font-family:Arial,sans-serif]">PerAgent</h1>
            <nav>
              <ul className="flex items-center gap-2">
                {navItems.map((item) => {
                  const isActive = activeView === item.key;
                  return (
                    <li key={item.key} className="relative">
                      {isActive ? (
                        <motion.span
                          layoutId="notebook-nav-active"
                          className="absolute inset-0 rounded-full border border-slate-300/90 bg-slate-200/90"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      ) : null}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 520, damping: 36 }}
                        onClick={() => setActiveView(item.key)}
                        className={`relative z-10 rounded-full px-6 py-2 text-sm font-medium transition ${
                          isActive
                            ? "text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        {item.label}
                      </motion.button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              设置
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              新建
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 pb-12 pt-28 md:px-10">
        <AnimatePresence mode="wait">
          <motion.section
            key={activeView}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {CurrentView}
          </motion.section>
        </AnimatePresence>
      </main>
    </>
  );
};

export default App;

