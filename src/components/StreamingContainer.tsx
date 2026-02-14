import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MotionCard, { type StepKind } from "./MotionCard";

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

const buildFinalCards = (data: StepResult): DisplayCard[] => {
  const cards: DisplayCard[] = [];

  if (data.title) {
    cards.push({
      id: "final-title",
      step: "STEP_APPEAR",
      icon: "📌",
      title: "论文标题",
      content: data.title,
    });
  }
  if (data.research_gap) {
    cards.push({
      id: "final-gap",
      step: "STEP_EXPAND",
      icon: "🧠",
      title: "研究缺口",
      content: data.research_gap,
    });
  }
  if (data.core_methodology) {
    cards.push({
      id: "final-method",
      step: "STEP_FOCUS",
      icon: "🛠",
      title: "核心方法",
      content: data.core_methodology,
    });
  }

  const tree = data.structural_tree;
  tree?.problem_definition?.forEach((item, index) => {
    cards.push({
      id: `pd-${index}`,
      step: "STEP_APPEAR",
      icon: "🧭",
      title: `问题定义 ${index + 1}`,
      content: item,
    });
  });
  tree?.technical_approach?.forEach((item, index) => {
    cards.push({
      id: `ta-${index}`,
      step: "STEP_EXPAND",
      icon: "🔧",
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
  { title: string; subtitle: string; itemClass: string }
> = {
  STEP_APPEAR: {
    title: "STEP_APPEAR 初步呈现",
    subtitle: "问题线索逐步出现",
    itemClass: "bg-blue-50/60 border-blue-100",
  },
  STEP_EXPAND: {
    title: "STEP_EXPAND 路径展开",
    subtitle: "方法内容开始细化",
    itemClass: "bg-cyan-50/60 border-cyan-100",
  },
  STEP_FOCUS: {
    title: "STEP_FOCUS 重点聚焦",
    subtitle: "关键结论被突出展示",
    itemClass: "bg-indigo-50/60 border-indigo-100",
  },
  STEP_FINAL: {
    title: "STEP_FINAL 最终结果",
    subtitle: "分析结果汇总收束",
    itemClass: "bg-emerald-50/60 border-emerald-100",
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
  const progressTimerRef = useRef<number | null>(null);
  const [displayedFinalCount, setDisplayedFinalCount] = useState(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [diagramCollapsed, setDiagramCollapsed] = useState(false);

  const finalCards = useMemo(() => (step1Data ? buildFinalCards(step1Data) : []), [step1Data]);
  const frameworkNodes = useMemo(
    () => step1Data?.framework_map?.nodes?.filter((n) => (n?.label ?? "").trim()) ?? [],
    [step1Data],
  );
  const frameworkLinks = useMemo(
    () => step1Data?.framework_map?.links?.filter((l) => (l?.from ?? "").trim() && (l?.to ?? "").trim()) ?? [],
    [step1Data],
  );
  const flowSteps = useMemo(
    () => step1Data?.flow_chart?.steps?.filter((s) => (s?.name ?? "").trim()) ?? [],
    [step1Data],
  );

  useEffect(() => {
    if (typedChars >= streamText.length) return;
    const timer = window.setInterval(() => {
      setTypedChars((prev) => Math.min(streamText.length, prev + 2));
    }, 20);
    return () => window.clearInterval(timer);
  }, [streamText.length, typedChars]);

  useEffect(() => {
    if (!step1Done) {
      setDisplayedFinalCount(0);
      return;
    }
    if (finalCards.length === 0) {
      setDisplayedFinalCount(0);
      return;
    }

    setDisplayedFinalCount(0);
    const interval = window.setInterval(() => {
      setDisplayedFinalCount((prev) => {
        if (prev >= finalCards.length) {
          window.clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 220);

    return () => window.clearInterval(interval);
  }, [finalCards.length, step1Done]);

  const cards = step1Done ? finalCards.slice(0, displayedFinalCount) : [];
  const streamPreview = streamText.slice(0, typedChars);

  const grouped = useMemo(
    () => ({
      STEP_APPEAR: cards.filter((item) => item.step === "STEP_APPEAR"),
      STEP_EXPAND: cards.filter((item) => item.step === "STEP_EXPAND"),
      STEP_FOCUS: cards.filter((item) => item.step === "STEP_FOCUS"),
      STEP_FINAL: cards.filter((item) => item.step === "STEP_FINAL"),
    }),
    [cards],
  );

  const flowVisibleCount = useMemo(() => {
    if (!step1Done || flowSteps.length === 0) return 0;
    if (finalCards.length === 0) return flowSteps.length;
    const ratio = Math.min(1, displayedFinalCount / finalCards.length);
    return Math.max(1, Math.ceil(ratio * flowSteps.length));
  }, [displayedFinalCount, finalCards.length, flowSteps.length, step1Done]);

  const frameworkVisibleCount = useMemo(() => {
    if (!step1Done || frameworkNodes.length === 0) return 0;
    if (finalCards.length === 0) return frameworkNodes.length;
    const ratio = Math.min(1, displayedFinalCount / finalCards.length);
    return Math.max(1, Math.ceil(ratio * frameworkNodes.length));
  }, [displayedFinalCount, finalCards.length, frameworkNodes.length, step1Done]);

  const targetProgress = useMemo(() => {
    if (!hasPaper) return 0;

    if (step1Done) {
      if (finalCards.length === 0) return 100;
      const revealRatio = Math.min(1, displayedFinalCount / finalCards.length);
      return Math.round(86 + revealRatio * 14);
    }

    if (!connected) return 6;
    if (typedChars === 0) return 12;
    return Math.min(84, 14 + Math.round(typedChars / 35));
  }, [connected, displayedFinalCount, finalCards.length, hasPaper, step1Done, typedChars]);

  useEffect(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
    }
    progressTimerRef.current = window.setInterval(() => {
      setDisplayedProgress((prev) => {
        const nextTarget = Math.max(prev, targetProgress);
        const delta = nextTarget - prev;
        if (Math.abs(delta) < 0.4) return nextTarget;
        return prev + delta * 0.12;
      });
    }, 40);

    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, [targetProgress]);

  const progress = Math.round(displayedProgress);

  useEffect(() => {
    if (!step1Done || cards.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cards.length, step1Done]);

  const renderItems = (items: DisplayCard[], step: StepKind) => (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.article
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: easeCurve }}
            className={`rounded-xl border px-5 py-4 ${stageMeta[step].itemClass}`}
          >
            <h4 className="text-lg font-semibold tracking-wide text-slate-800 md:text-xl">
              <span className="mr-2">{item.icon}</span>
              <span className="text-blue-700">{item.title}</span>
            </h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.content}</p>
          </motion.article>
        ))}
      </AnimatePresence>
    </div>
  );

  const stepOrder: StepKind[] = ["STEP_APPEAR", "STEP_EXPAND", "STEP_FOCUS", "STEP_FINAL"];
  const visibleSteps = hasPaper ? stepOrder.filter((step) => grouped[step].length > 0) : [];

  const hasDiagramData = frameworkNodes.length > 0 || flowSteps.length > 0;
  const showRightPanel = step1Done && hasDiagramData;

  useEffect(() => {
    if (!showRightPanel) {
      setDiagramCollapsed(false);
    }
  }, [showRightPanel]);

  const progressTrackHeight = useMemo(() => {
    const base = 220;
    const growth = (Math.max(1, cards.length) + flowVisibleCount) * 20;
    return Math.max(base, Math.min(620, base + growth));
  }, [cards.length, flowVisibleCount]);

  const visibleFrameworkNodes = useMemo(
    () => frameworkNodes.slice(0, frameworkVisibleCount),
    [frameworkNodes, frameworkVisibleCount],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleFrameworkNodes.map((n) => n.id).filter(Boolean)),
    [visibleFrameworkNodes],
  );
  const visibleFrameworkLinks = useMemo(
    () =>
      frameworkLinks.filter(
        (l) => l.from && l.to && visibleNodeIds.has(l.from) && visibleNodeIds.has(l.to),
      ),
    [frameworkLinks, visibleNodeIds],
  );

  const frameworkNodeLayout = useMemo(
    () =>
      visibleFrameworkNodes.map((node, index) => ({
        id: node.id || `node-${index}`,
        label: node.label || "",
        x: 20,
        y: 14 + index * 78,
        width: 220,
        height: 50,
      })),
    [visibleFrameworkNodes],
  );

  const frameworkNodeIndex = useMemo(
    () => new Map(frameworkNodeLayout.map((n) => [n.id, n])),
    [frameworkNodeLayout],
  );

  const frameworkCanvasHeight = useMemo(
    () => Math.max(140, frameworkNodeLayout.length * 78),
    [frameworkNodeLayout.length],
  );

  const gridClass = showRightPanel
    ? diagramCollapsed
      ? "mt-8 grid gap-6 md:grid-cols-[52px_minmax(0,1fr)_56px]"
      : "mt-8 grid gap-6 md:grid-cols-[52px_minmax(0,1fr)_320px]"
    : "mt-8 grid gap-6 md:grid-cols-[52px_minmax(0,1fr)]";

  return (
    <section className={gridClass}>
      <aside className="md:sticky md:top-28 md:h-fit">
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-semibold text-slate-500">{progress}%</p>
          <div
            className="relative w-2 overflow-hidden rounded-full bg-slate-200 transition-all duration-500"
            style={{ height: `${progressTrackHeight}px` }}
          >
            <motion.div
              className="absolute top-0 w-full rounded-full bg-blue-600"
              initial={{ height: 0, transformOrigin: "top" }}
              animate={{ height: `${displayedProgress}%` }}
              transition={{ duration: 0.5, ease: easeCurve }}
            />
          </div>
        </div>
      </aside>

      <div className="space-y-5">
        {!hasPaper ? null : !step1Done ? (
          <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
          >
            <h3 className="text-sm font-semibold text-slate-700">实时生成中</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {streamPreview || "正在等待模型返回内容..."}
              <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-slate-400 align-middle" />
            </p>
          </motion.article>
        ) : visibleSteps.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            正在整理结果结构，请稍候...
          </div>
        ) : (
          visibleSteps.map((step) => (
            <MotionCard key={step} step={step} title={stageMeta[step].title} subtitle={stageMeta[step].subtitle} active>
              {renderItems(grouped[step], step)}
            </MotionCard>
          ))
        )}

        <p className="text-xs text-slate-500">
          {!hasPaper
            ? "等待上传论文。"
            : !connected
              ? "正在连接分析通道。"
              : step1Done && displayedFinalCount < finalCards.length
                ? "正在平滑整理结果..."
                : statusText}
        </p>

        <div ref={bottomRef} />
      </div>

      {showRightPanel ? (
        <aside className="md:sticky md:top-28 md:h-fit">
          <div className="rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              {!diagramCollapsed ? <p className="text-sm font-semibold text-slate-700">研究流程图</p> : null}
              <button
                type="button"
                onClick={() => setDiagramCollapsed((prev) => !prev)}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                {diagramCollapsed ? "展开" : "收起"}
              </button>
            </div>

            {diagramCollapsed ? (
              <div className="flex h-24 items-center justify-center text-xs text-slate-500">图谱</div>
            ) : (
              <div className="space-y-5 p-4">
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">整体框架图</h4>
                  <div className="relative rounded-xl border border-slate-200 bg-white p-2">
                    <svg
                      width="100%"
                      height={frameworkCanvasHeight}
                      viewBox={`0 0 260 ${frameworkCanvasHeight}`}
                      className="absolute left-0 top-0"
                    >
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                      </defs>
                      {visibleFrameworkLinks.map((link, index) => {
                        const fromNode = frameworkNodeIndex.get(link.from || "");
                        const toNode = frameworkNodeIndex.get(link.to || "");
                        if (!fromNode || !toNode) return null;
                        const x = fromNode.x + fromNode.width / 2;
                        const y1 = fromNode.y + fromNode.height;
                        const y2 = toNode.y;
                        const c1 = y1 + 18;
                        const c2 = y2 - 18;
                        return (
                          <g key={`${link.from}-${link.to}-${index}`}>
                            <path
                              d={`M ${x} ${y1} C ${x} ${c1}, ${x} ${c2}, ${x} ${y2}`}
                              stroke="#94a3b8"
                              strokeWidth="1.4"
                              fill="none"
                              markerEnd="url(#arrow)"
                            />
                            {link.label ? (
                              <text x={x + 8} y={(y1 + y2) / 2} fontSize="10" fill="#94a3b8">
                                {link.label}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </svg>
                    <div className="relative" style={{ height: `${frameworkCanvasHeight}px` }}>
                      {frameworkNodeLayout.map((node) => (
                        <div
                          key={node.id}
                          className="absolute rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-slate-700"
                          style={{
                            left: `${node.x}px`,
                            top: `${node.y}px`,
                            width: `${node.width}px`,
                            minHeight: `${node.height}px`,
                          }}
                        >
                          {node.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {step1Data?.flow_chart?.title || "流程图"}
                  </h4>
                  <ol className="space-y-2">
                    {flowSteps.slice(0, flowVisibleCount).map((step, index) => (
                      <li key={`${step.name}-${index}`} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-800">{index + 1}. {step.name}</p>
                        {step.detail ? <p className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</p> : null}
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </section>
  );
};

export default StreamingContainer;
