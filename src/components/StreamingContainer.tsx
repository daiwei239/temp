import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { StepKind } from "./MotionCard";

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
  step1Cards?: DisplayCard[];
  paperMeta?: {
    keywords: string[];
    authors: string;
    impactFactor: string;
    publishYear: string;
  };
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

const TypewriterText = ({
  text,
  speed = 14,
  className = "",
}: {
  text: string;
  speed?: number;
  className?: string;
}) => {
  const [chars, setChars] = useState(0);

  useEffect(() => {
    setChars(0);
  }, [text]);

  useEffect(() => {
    if (!text || chars >= text.length) return;
    const timer = window.setInterval(() => {
      setChars((prev) => Math.min(text.length, prev + 1));
    }, speed);
    return () => window.clearInterval(timer);
  }, [chars, speed, text]);

  const done = chars >= text.length;
  const preview = text.slice(0, chars);

  return (
    <span className={className}>
      {preview}
      {!done ? <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-slate-400 align-middle" /> : null}
    </span>
  );
};

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
    title: "阶段一 初步呈现",
    subtitle: "问题线索逐步出现",
    itemClass: "bg-[#f8f8f6] border-[#e9e5e0]",
  },
  STEP_EXPAND: {
    title: "阶段二 路径展开",
    subtitle: "方法内容开始细化",
    itemClass: "bg-[#f8f8f6] border-[#e9e5e0]",
  },
  STEP_FOCUS: {
    title: "阶段三 重点聚焦",
    subtitle: "关键结论被突出展示",
    itemClass: "bg-[#f8f8f6] border-[#e9e5e0]",
  },
  STEP_FINAL: {
    title: "阶段四 最终结果",
    subtitle: "分析结果汇总收束",
    itemClass: "bg-[#f8f8f6] border-[#e9e5e0]",
  },
};

type StageTabKey = "phase_core" | "phase_path" | "phase_detail";

const stageTabs: Array<{
  key: StageTabKey;
  label: string;
  shortLabel: string;
  subtitle: string;
}> = [
  {
    key: "phase_core",
    label: "阶段一：核心提取",
    shortLabel: "核心提取",
    subtitle: "提取论文问题定义与核心对象",
  },
  {
    key: "phase_path",
    label: "阶段二：路径展开",
    shortLabel: "路径展开",
    subtitle: "展开方法链路与技术实现路径",
  },
  {
    key: "phase_detail",
    label: "阶段三：深入细节",
    shortLabel: "深入细节",
    subtitle: "聚焦关键证据与细节结论",
  },
];

const stagePanelTone: Record<StageTabKey, string> = {
  phase_core: "border-[#e8e4df] bg-[#f3f2f0]",
  phase_path: "border-[#e8e4df] bg-[#f3f2f0]",
  phase_detail: "border-[#e8e4df] bg-[#f3f2f0]",
};

const pickNodeEmoji = (kind?: string, label?: string) => {
  const text = `${kind ?? ""} ${label ?? ""}`.toLowerCase();
  if (text.includes("problem") || text.includes("问题")) return "🎯";
  if (text.includes("method") || text.includes("方法")) return "🧩";
  if (text.includes("evidence") || text.includes("实验") || text.includes("证据")) return "📊";
  if (text.includes("data") || text.includes("数据")) return "🗂️";
  return "🔹";
};

const pickStepEmoji = (name?: string) => {
  const text = (name ?? "").toLowerCase();
  if (text.includes("问题")) return "🧭";
  if (text.includes("数据") || text.includes("知识")) return "🗃️";
  if (text.includes("建模") || text.includes("优化") || text.includes("方法")) return "⚙️";
  if (text.includes("评估") || text.includes("分析") || text.includes("实验")) return "📈";
  if (text.includes("结论") || text.includes("总结")) return "✅";
  return "🪄";
};

const detailToBullets = (detail?: string) => {
  const raw = (detail ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [] as string[];
  return raw
    .split(/[。；;，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
};

const fallbackCardIcon = (item: DisplayCard) => {
  const raw = (item.icon || "").trim();
  if (raw && raw !== "??") return raw;
  const title = (item.title || "").toLowerCase();
  if (title.includes("论文标题")) return "📌";
  if (title.includes("研究缺口")) return "🧠";
  if (title.includes("核心方法")) return "🛠️";
  if (title.includes("问题定义")) return "🧭";
  if (title.includes("技术路径")) return "🔧";
  if (title.includes("实证证据")) return "📊";
  if (item.step === "STEP_APPEAR") return "📌";
  if (item.step === "STEP_EXPAND") return "🔧";
  if (item.step === "STEP_FOCUS") return "🛠️";
  return "📊";
};

const StreamingContainer = ({
  streamText,
  step1Data,
  step1Cards = [],
  paperMeta,
  statusText,
  hasPaper,
  connected,
  step1Done,
}: StreamingContainerProps) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const frameworkWrapRef = useRef<HTMLDivElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const [displayedFinalCount, setDisplayedFinalCount] = useState(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [diagramCollapsed, setDiagramCollapsed] = useState(false);
  const [activeStage, setActiveStage] = useState<StageTabKey>("phase_core");
  const [frameworkRenderWidth, setFrameworkRenderWidth] = useState(260);

  const finalCards = useMemo(() => {
    if (step1Cards.length > 0) return step1Cards;
    return step1Data ? buildFinalCards(step1Data) : [];
  }, [step1Cards, step1Data]);
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

  const cards = step1Cards.length > 0
    ? finalCards
    : step1Done
      ? finalCards.slice(0, displayedFinalCount)
      : [];

  const grouped = useMemo(
    () => ({
      STEP_APPEAR: cards.filter((item) => item.step === "STEP_APPEAR"),
      STEP_EXPAND: cards.filter((item) => item.step === "STEP_EXPAND"),
      STEP_FOCUS: cards.filter((item) => item.step === "STEP_FOCUS"),
      STEP_FINAL: cards.filter((item) => item.step === "STEP_FINAL"),
    }),
    [cards],
  );

  const stageCards = useMemo<Record<StageTabKey, DisplayCard[]>>(
    () => ({
      phase_core: grouped.STEP_APPEAR,
      phase_path: grouped.STEP_EXPAND,
      phase_detail: [...grouped.STEP_FOCUS, ...grouped.STEP_FINAL],
    }),
    [grouped],
  );

  const hasAnyStageCards = useMemo(
    () => stageTabs.some((tab) => stageCards[tab.key].length > 0),
    [stageCards],
  );

  const activeStageMeta = useMemo(
    () => stageTabs.find((tab) => tab.key === activeStage) ?? stageTabs[0],
    [activeStage],
  );

  const activeStageCards = stageCards[activeStageMeta.key];

  const currentStageIndex = useMemo(() => {
    if (!hasPaper) return -1;
    if (step1Done) return stageTabs.length - 1;
    if (stageCards.phase_detail.length > 0) return 2;
    if (stageCards.phase_path.length > 0) return 1;
    return 0;
  }, [hasPaper, stageCards.phase_detail.length, stageCards.phase_path.length, step1Done]);

  useEffect(() => {
    if (!hasPaper) {
      setActiveStage("phase_core");
    }
  }, [hasPaper]);

  useEffect(() => {
    if (!step1Done && step1Cards.length === 0 && streamText.length === 0) {
      setActiveStage("phase_core");
    }
  }, [step1Done, step1Cards.length, streamText.length]);

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
    if (!hasPaper) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [typedChars, cards.length, streamText.length, hasPaper]);

  useEffect(() => {
    const el = frameworkWrapRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(260, Math.floor(el.clientWidth));
      setFrameworkRenderWidth(next);
    };
    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const renderItems = (items: DisplayCard[]) => (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.article
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: easeCurve }}
            className={`rounded-xl border px-5 py-4 ${stageMeta[item.step].itemClass}`}
          >
            <h4 className="text-lg font-semibold tracking-wide text-slate-800 md:text-xl">
              <span className="mr-2 font-emoji">{fallbackCardIcon(item)}</span>
              <TypewriterText text={item.title} speed={22} className="text-[#2f2b28]" />
            </h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              <TypewriterText text={item.content} speed={12} />
            </p>
          </motion.article>
        ))}
      </AnimatePresence>
    </div>
  );

  const hasDiagramData = frameworkNodes.length > 0 || flowSteps.length > 0;
  const showRightPanel = step1Done;

  useEffect(() => {
    if (!showRightPanel) {
      setDiagramCollapsed(false);
    }
  }, [showRightPanel]);

  const visibleFrameworkNodes = useMemo(
    () => frameworkNodes.slice(0, frameworkVisibleCount),
    [frameworkNodes, frameworkVisibleCount],
  );
  const visibleFlowSteps = useMemo(
    () => flowSteps.slice(0, flowVisibleCount),
    [flowSteps, flowVisibleCount],
  );
  const detailedFlowSteps = useMemo(
    () =>
      visibleFlowSteps.map((step, index) => ({
        ...step,
        index,
        emoji: pickStepEmoji(step.name),
        bullets: detailToBullets(step.detail),
      })),
    [visibleFlowSteps],
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

  const frameworkCanvasWidth = frameworkRenderWidth;
  const frameworkNodeLayout = useMemo(() => {
    if (visibleFrameworkNodes.length === 0) return [];
    const normalized = visibleFrameworkNodes.map((node, index) => ({
      id: node.id || `node-${index}`,
      label: node.label || "",
      kind: node.kind || "",
      emoji: pickNodeEmoji(node.kind, node.label),
      order: index,
    }));
    const ids = normalized.map((n) => n.id);
    const levelMap = new Map<string, number>(ids.map((id) => [id, 0]));

    // Derive vertical levels from link directions, so arrows align with real graph topology.
    for (let pass = 0; pass < normalized.length + 2; pass += 1) {
      let changed = false;
      visibleFrameworkLinks.forEach((link) => {
        const from = link.from || "";
        const to = link.to || "";
        if (!levelMap.has(from) || !levelMap.has(to)) return;
        const nextLevel = (levelMap.get(from) || 0) + 1;
        if ((levelMap.get(to) || 0) < nextLevel) {
          levelMap.set(to, nextLevel);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const levels = new Map<number, typeof normalized>();
    normalized.forEach((node) => {
      const level = levelMap.get(node.id) || 0;
      const bucket = levels.get(level) || [];
      bucket.push(node);
      levels.set(level, bucket);
    });
    Array.from(levels.values()).forEach((bucket) => bucket.sort((a, b) => a.order - b.order));

    const sidePadding = 10;
    const hGap = 16;
    const levelGap = 42;
    const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);
    let yCursor = 14;
    const result: Array<{
      id: string;
      label: string;
      kind: string;
      emoji: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    sortedLevels.forEach((level) => {
      const bucket = levels.get(level) || [];
      const count = Math.max(1, bucket.length);
      const availableWidth = frameworkCanvasWidth - sidePadding * 2;
      const rawWidth = (availableWidth - hGap * (count - 1)) / count;
      const nodeWidth = Math.max(136, Math.min(240, rawWidth));
      const contentWidth = nodeWidth - 24;
      const approxCharsPerLine = Math.max(6, Math.floor(contentWidth / 12));

      const measured = bucket.map((node) => {
        const lines = Math.max(1, Math.ceil((node.label || "节点").length / approxCharsPerLine));
        const lineCount = Math.min(3, lines);
        const nodeHeight = 50 + (lineCount - 1) * 16;
        return { ...node, nodeHeight };
      });

      const levelHeight = Math.max(...measured.map((n) => n.nodeHeight));
      const totalWidth = nodeWidth * count + hGap * (count - 1);
      const startX = (frameworkCanvasWidth - totalWidth) / 2;

      measured.forEach((node, idx) => {
        result.push({
          id: node.id,
          label: node.label,
          kind: node.kind,
          emoji: node.emoji,
          x: startX + idx * (nodeWidth + hGap),
          y: yCursor,
          width: nodeWidth,
          height: node.nodeHeight,
        });
      });
      yCursor += levelHeight + levelGap;
    });
    return result;
  }, [frameworkCanvasWidth, visibleFrameworkLinks, visibleFrameworkNodes]);

  const frameworkNodeIndex = useMemo(
    () => new Map(frameworkNodeLayout.map((n) => [n.id, n])),
    [frameworkNodeLayout],
  );

  const frameworkCanvasHeight = useMemo(() => {
    const maxBottom = frameworkNodeLayout.reduce((acc, node) => Math.max(acc, node.y + node.height), 0);
    return Math.max(180, maxBottom + 16);
  }, [frameworkNodeLayout]);

  const renderedFrameworkLinks = useMemo(() => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const wrapLabel = (raw: string, maxCharsPerLine: number, maxLines: number) => {
      const src = raw.trim();
      if (!src) return [] as string[];
      const out: string[] = [];
      let cursor = "";
      for (const ch of src) {
        cursor += ch;
        if (cursor.length >= maxCharsPerLine) {
          out.push(cursor);
          cursor = "";
          if (out.length >= maxLines) break;
        }
      }
      if (out.length < maxLines && cursor) out.push(cursor);
      const consumed = out.join("").length;
      if (consumed < src.length && out.length > 0) {
        const last = out[out.length - 1];
        out[out.length - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
      }
      return out;
    };
    const bezierPoint = (
      t: number,
      p0: { x: number; y: number },
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
    ) => {
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x;
      const y =
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y;
      return { x, y };
    };

    const placedLabels: Array<{ x: number; y: number }> = [];
    return visibleFrameworkLinks.map((link, index) => {
      const fromNode = frameworkNodeIndex.get(link.from || "");
      const toNode = frameworkNodeIndex.get(link.to || "");
      if (!fromNode || !toNode) return null;

      const x1 = fromNode.x + fromNode.width / 2;
      const y1 = fromNode.y + fromNode.height;
      const x2 = toNode.x + toNode.width / 2;
      const y2 = toNode.y;
      const dx = Math.abs(x2 - x1);
      const dy = Math.max(24, y2 - y1);
      const bend = clamp(dy * 0.45 + dx * 0.12, 16, 56);
      const c1 = { x: x1, y: y1 + bend };
      const c2 = { x: x2, y: y2 - bend };
      const d = `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`;

      const rawLabel = (link.label || "").trim();
      if (!rawLabel) {
        return { key: `${link.from}-${link.to}-${index}`, d, label: "" };
      }
      const centerX = (x1 + x2) / 2;
      const sideRoom = Math.min(centerX - 8, frameworkCanvasWidth - centerX - 8);
      const maxLabelWidth = clamp(sideRoom * 1.6, 72, 180);
      const maxCharsPerLine = Math.max(6, Math.floor((maxLabelWidth - 16) / 7));
      const labelLines = wrapLabel(rawLabel, maxCharsPerLine, 3);
      if (labelLines.length === 0) {
        return { key: `${link.from}-${link.to}-${index}`, d, label: "" };
      }

      const p = bezierPoint(0.5, { x: x1, y: y1 }, c1, c2, { x: x2, y: y2 });
      const tangentX = x2 - x1;
      const tangentY = y2 - y1;
      const length = Math.max(1, Math.hypot(tangentX, tangentY));
      const normal = { x: -tangentY / length, y: tangentX / length };
      const offset = (Math.abs(tangentX) > 24 ? 14 : 18) * (index % 2 === 0 ? 1 : -1);
      let labelX = p.x + normal.x * offset;
      let labelY = p.y + normal.y * offset;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const collide = placedLabels.some((it) => Math.hypot(it.x - labelX, it.y - labelY) < 22);
        if (!collide) break;
        labelY += 13 * (attempt % 2 === 0 ? 1 : -1);
        labelX += 6 * (attempt % 2 === 0 ? 1 : -1);
      }
      placedLabels.push({ x: labelX, y: labelY });

      const lineWidth = Math.max(...labelLines.map((line) => line.length * 7 + 14));
      const labelWidth = clamp(lineWidth, 72, maxLabelWidth);
      const labelHeight = 12 + labelLines.length * 11;
      labelX = clamp(labelX, labelWidth / 2 + 6, frameworkCanvasWidth - labelWidth / 2 - 6);
      labelY = clamp(labelY, labelHeight / 2 + 6, frameworkCanvasHeight - labelHeight / 2 - 6);

      return {
        key: `${link.from}-${link.to}-${index}`,
        d,
        label: labelLines.join(" "),
        labelLines,
        labelX,
        labelY,
        labelWidth,
        labelHeight,
      };
    }).filter(Boolean) as Array<{
      key: string;
      d: string;
      label: string;
      labelLines?: string[];
      labelX?: number;
      labelY?: number;
      labelWidth?: number;
      labelHeight?: number;
    }>;
  }, [frameworkCanvasHeight, frameworkCanvasWidth, frameworkNodeIndex, visibleFrameworkLinks]);

  const gridClass = showRightPanel
    ? diagramCollapsed
      ? "mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_56px]"
      : "mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]"
    : "mt-6";

  return (
    <section>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">进度导航</p>
            <p className="text-sm font-semibold text-slate-800">Horizontal Stepper</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {progress}%
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-[#dcecff] bg-[#f8fcff] px-3 py-2.5 md:px-4">
          <div className="relative h-7">
            <span className="absolute left-0 top-0 text-[13px] tracking-[0.08em] text-[#8bc7f4]">
              {hasPaper ? "Analysis loading" : "Illustrative mathematics"}
            </span>
            <span className="absolute left-1/2 top-0 -translate-x-1/2 text-sm font-semibold text-[#73bdf2]">
              {progress}%
            </span>
            <div className="absolute inset-x-0 top-5 h-px bg-[#cde6fb]" />
            <motion.div
              className="absolute left-0 top-5 h-px bg-[#7dc4f4]"
              initial={{ width: 0 }}
              animate={{ width: `${displayedProgress}%` }}
              transition={{ duration: 0.45, ease: easeCurve }}
            />
            <div className="absolute right-0 top-1 h-5 border-r border-dashed border-[#acd4f4]" />
          </div>
        </div>

        <ol className="mt-4 flex items-center">
          {stageTabs.map((tab, index) => {
            const reached = index <= currentStageIndex;
            const active = activeStage === tab.key;
            return (
              <li key={tab.key} className="flex flex-1 items-center">
                <button
                  type="button"
                  disabled={!hasPaper}
                  onClick={() => setActiveStage(tab.key)}
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition",
                    active
                      ? "border-[#ee9f79] bg-[#ee9f79] text-[#6e4a3a]"
                      : reached
                        ? "border-[#f2c5ae] bg-[#fff4ed] text-[#d77f56]"
                        : "border-[#ddd8d2] bg-white text-[#8c847d]",
                    !hasPaper ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                >
                  {index + 1}
                </button>
                {index < stageTabs.length - 1 ? (
                  <span
                    className={[
                      "mx-1 h-[2px] flex-1 rounded-full transition-colors",
                      index < currentStageIndex ? "bg-[#ee9f79]" : "bg-[#ddd8d2]",
                    ].join(" ")}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {stageTabs.map((tab) => {
            const active = activeStage === tab.key;
            const count = stageCards[tab.key].length;
            return (
              <button
                key={tab.key}
                type="button"
                disabled={!hasPaper}
                onClick={() => setActiveStage(tab.key)}
                className={[
                  "rounded-xl border px-2 py-2 text-left transition",
                  active
                    ? "border-[#f2c6af] bg-[#fff4ed]"
                    : "border-[#e5dfd9] bg-[#f7f5f3] hover:border-[#d8d1cb] hover:bg-white",
                  !hasPaper ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                <p className="text-xs font-semibold text-[#4c4640]">{tab.shortLabel}</p>
                <p className="mt-0.5 text-[11px] text-[#958d86]">{count > 0 ? `${count} 张` : "待生成"}</p>
              </button>
            );
          })}
        </div>
      </div>

      <section className={gridClass}>
        <div className="space-y-5">
        {!hasPaper
          ? null
          : !step1Done && step1Cards.length === 0
            ? null
            : !hasAnyStageCards
              ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                  正在整理结果结构，请稍候...
                </div>
              )
              : activeStageCards.length === 0
                ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                    {activeStageMeta.label} 暂无卡片，请切换其他阶段或等待继续生成。
                  </div>
                )
                : (
                  <motion.article
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: easeCurve }}
                    className={`rounded-2xl border p-6 md:p-7 ${stagePanelTone[activeStageMeta.key]}`}
                  >
                    <header className="mb-4 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e38f67]">
                        {activeStageMeta.label}
                      </p>
                      <h3 className="text-lg font-semibold text-[#2f2b28]">{activeStageMeta.shortLabel}</h3>
                      <p className="text-sm leading-6 text-[#6f6761]">{activeStageMeta.subtitle}</p>
                    </header>
                    {renderItems(activeStageCards)}
                  </motion.article>
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-blue-50/40 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/85 px-3 py-2 backdrop-blur">
              {!diagramCollapsed ? (
                <p className="text-sm font-semibold text-slate-700">
                  🗺️ 分析流程总览
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setDiagramCollapsed((prev) => !prev)}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                {diagramCollapsed ? "展开" : "收起"}
              </button>
            </div>

            {diagramCollapsed ? (
              <div className="flex h-24 items-center justify-center text-xs text-slate-500">🧾 图谱</div>
            ) : (
              <div className="space-y-5 p-4">
                <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <h4 className="mb-3 text-xs font-semibold tracking-[0.12em] text-slate-500">📄 论文基本信息</h4>
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-slate-500">作者</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{paperMeta?.authors || "待识别"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-slate-500">影响因子</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{paperMeta?.impactFactor || "待识别"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-slate-500">发表年份</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{paperMeta?.publishYear || "待识别"}</span>
                    </div>
                    <div className="pt-1">
                      <p className="mb-2 text-slate-500">关键词</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(paperMeta?.keywords?.length ? paperMeta.keywords : ["待识别"]).map((keyword, idx) => (
                          <span
                            key={`${keyword}-${idx}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {hasDiagramData ? (
                <section className="grid grid-cols-3 gap-2">
                  <article className="rounded-xl border border-blue-100 bg-blue-50/70 px-2 py-2 text-center">
                    <p className="text-[11px] text-slate-500">节点数</p>
                    <p className="text-sm font-semibold text-slate-700">{visibleFrameworkNodes.length}</p>
                  </article>
                  <article className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-2 py-2 text-center">
                    <p className="text-[11px] text-slate-500">关系数</p>
                    <p className="text-sm font-semibold text-slate-700">{visibleFrameworkLinks.length}</p>
                  </article>
                  <article className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-2 py-2 text-center">
                    <p className="text-[11px] text-slate-500">步骤数</p>
                    <p className="text-sm font-semibold text-slate-700">{visibleFlowSteps.length}</p>
                  </article>
                </section>
                ) : null}

                {/* 整体框架图暂时隐藏 */}

                {hasDiagramData ? (
                <section>
                  <h4 className="mb-2 text-xs font-semibold tracking-[0.12em] text-slate-500">
                    🧪 {step1Data?.flow_chart?.title || "流程图"}
                  </h4>
                  <ol className="space-y-3">
                    {detailedFlowSteps.map((step) => (
                      <li key={`${step.name}-${step.index}`} className="relative pl-8">
                        <span className="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 bg-white text-xs">
                          {step.emoji}
                        </span>
                        {step.index < detailedFlowSteps.length - 1 ? (
                          <span className="absolute left-3 top-8 h-[calc(100%-8px)] w-px bg-gradient-to-b from-blue-300 to-cyan-200" />
                        ) : null}
                        <article className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/90 via-cyan-50/75 to-white px-3 py-3 shadow-sm">
                          <p className="text-sm font-semibold text-slate-800">
                            第 {step.index + 1} 步: <TypewriterText text={step.name || "流程步骤"} speed={20} />
                          </p>
                          {step.detail ? (
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              <TypewriterText text={step.detail} speed={12} />
                            </p>
                          ) : null}
                          {step.bullets.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {step.bullets.map((bullet, idx) => (
                                <span
                                  key={`${step.name}-tag-${idx}`}
                                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                                >
                                  {idx === 0 ? "输入" : idx === 1 ? "处理" : "产出"}: {bullet}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      </li>
                    ))}
                  </ol>
                </section>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      ) : null}
      </section>
    </section>
  );
};

export default StreamingContainer;



