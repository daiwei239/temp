import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MotionCard, { type StepKind } from "./MotionCard";

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

interface StreamingContainerProps {
  streamText: string;
  step1Data: StepResult | null;
  statusText: string;
  hasPaper: boolean;
  connected: boolean;
  step1Done: boolean;
}

interface DisplayCard {
  id: string;
  step: StepKind;
  icon: string;
  title: string;
  content: string;
}

const easeCurve: [number, number, number, number] = [0.2, 0, 0, 1];

const buildStreamingCards = (streamText: string): DisplayCard[] => {
  const normalized = streamText.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const slices = normalized.match(/.{1,120}([。！？；]|$)/g) ?? [normalized];
  return slices.map((slice, index) => {
    const step: StepKind =
      index % 4 === 0
        ? "STEP_APPEAR"
        : index % 4 === 1
          ? "STEP_EXPAND"
          : index % 4 === 2
            ? "STEP_FOCUS"
            : "STEP_FINAL";
    return {
      id: `stream-${index}`,
      step,
      icon: step === "STEP_APPEAR" ? "🧭" : step === "STEP_EXPAND" ? "🧪" : step === "STEP_FOCUS" ? "🔬" : "✅",
      title: `分析片段 ${String(index + 1).padStart(2, "0")}`,
      content: slice.trim(),
    };
  });
};

const buildFinalCards = (data: StepResult): DisplayCard[] => {
  const cards: DisplayCard[] = [];

  if (data.title) {
    cards.push({
      id: "final-title",
      step: "STEP_APPEAR",
      icon: "📘",
      title: "论文标题",
      content: data.title,
    });
  }
  if (data.research_gap) {
    cards.push({
      id: "final-gap",
      step: "STEP_EXPAND",
      icon: "🎯",
      title: "研究缺口",
      content: data.research_gap,
    });
  }
  if (data.core_methodology) {
    cards.push({
      id: "final-method",
      step: "STEP_FOCUS",
      icon: "🧠",
      title: "核心方法",
      content: data.core_methodology,
    });
  }

  const tree = data.structural_tree;
  tree?.problem_definition?.forEach((item, index) => {
    cards.push({
      id: `pd-${index}`,
      step: "STEP_APPEAR",
      icon: "⚠️",
      title: `问题定义 ${index + 1}`,
      content: item,
    });
  });
  tree?.technical_approach?.forEach((item, index) => {
    cards.push({
      id: `ta-${index}`,
      step: "STEP_EXPAND",
      icon: "🛠️",
      title: `技术路径 ${index + 1}`,
      content: item,
    });
  });
  tree?.empirical_evidence?.forEach((item, index) => {
    cards.push({
      id: `ee-${index}`,
      step: "STEP_FINAL",
      icon: "📊",
      title: `实证证据 ${index + 1}`,
      content: item,
    });
  });

  return cards;
};

const stageMeta: Record<
  StepKind,
  { title: string; subtitle: string; titleColor: string }
> = {
  STEP_APPEAR: {
    title: "STEP_APPEAR 首次显现",
    subtitle: "问题线索逐步浮现",
    titleColor: "text-blue-700",
  },
  STEP_EXPAND: {
    title: "STEP_EXPAND 路径展开",
    subtitle: "方法内容向右衔接",
    titleColor: "text-cyan-700",
  },
  STEP_FOCUS: {
    title: "STEP_FOCUS 重点聚焦",
    subtitle: "关键结论被突出强调",
    titleColor: "text-indigo-700",
  },
  STEP_FINAL: {
    title: "STEP_FINAL 最终呈现",
    subtitle: "结果柔和收束",
    titleColor: "text-emerald-700",
  },
};

const StreamingContainer = ({
  streamText,
  step1Data,
  statusText,
  hasPaper,
  connected,
  step1Done,
}: StreamingContainerProps) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const cards = useMemo(
    () => (step1Done && step1Data ? buildFinalCards(step1Data) : buildStreamingCards(streamText)),
    [step1Done, step1Data, streamText],
  );

  const grouped = useMemo(
    () => ({
      STEP_APPEAR: cards.filter((item) => item.step === "STEP_APPEAR"),
      STEP_EXPAND: cards.filter((item) => item.step === "STEP_EXPAND"),
      STEP_FOCUS: cards.filter((item) => item.step === "STEP_FOCUS"),
      STEP_FINAL: cards.filter((item) => item.step === "STEP_FINAL"),
    }),
    [cards],
  );

  const progress = useMemo(() => {
    if (!hasPaper) return 0;
    if (step1Done) return 100;
    if (cards.length === 0) return connected ? 8 : 4;
    return Math.min(95, Math.max(10, Math.round((cards.length / 12) * 100)));
  }, [cards.length, connected, hasPaper, step1Done]);

  useEffect(() => {
    if (cards.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cards.length]);

  const renderItems = (items: DisplayCard[]) => (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.article
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: easeCurve }}
            className="rounded-xl border border-slate-200/70 bg-white px-5 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.06)]"
          >
            <h4 className="text-lg font-semibold tracking-wide text-slate-800 md:text-xl">
              <span className="mr-2">{item.icon}</span>
              <span className="text-blue-700">{item.title}</span>
            </h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {item.content}
            </p>
          </motion.article>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <section className="mt-8 space-y-5">
      <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.07)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">StreamingContainer</h2>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
            进度 {progress}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <motion.div
            className="h-full bg-blue-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: easeCurve }}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {!hasPaper
            ? "等待上传论文。"
            : !connected
              ? "正在连接分析通道。"
              : statusText}
        </p>
      </div>

      {(["STEP_APPEAR", "STEP_EXPAND", "STEP_FOCUS", "STEP_FINAL"] as StepKind[]).map((step) => (
        <MotionCard
          key={step}
          step={step}
          title={stageMeta[step].title}
          subtitle={stageMeta[step].subtitle}
          active={grouped[step].length > 0}
        >
          {grouped[step].length > 0 ? (
            renderItems(grouped[step])
          ) : (
            <p className={`text-sm ${stageMeta[step].titleColor} opacity-75`}>该步骤等待内容生成...</p>
          )}
        </MotionCard>
      ))}

      <div ref={bottomRef} />
    </section>
  );
};

export default StreamingContainer;
