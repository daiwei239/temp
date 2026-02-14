import { motion, type Variants } from "framer-motion";
import type { PropsWithChildren } from "react";

export type StepKind =
  | "STEP_APPEAR"
  | "STEP_EXPAND"
  | "STEP_FOCUS"
  | "STEP_FINAL";

interface MotionCardProps extends PropsWithChildren {
  step: StepKind;
  title: string;
  subtitle: string;
  active?: boolean;
}

const easeCurve: [number, number, number, number] = [0.2, 0, 0, 1];

const stepVariants: Record<StepKind, Variants> = {
  STEP_APPEAR: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.28, ease: easeCurve },
    },
  },
  STEP_EXPAND: {
    hidden: { opacity: 0, x: 40 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.32, ease: easeCurve },
    },
  },
  STEP_FOCUS: {
    hidden: { scale: 0.97, opacity: 0.9 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.24, ease: easeCurve },
    },
  },
  STEP_FINAL: {
    hidden: { opacity: 0, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      transition: { duration: 0.3, ease: easeCurve },
    },
  },
};

const toneByStep: Record<StepKind, string> = {
  STEP_APPEAR: "border-blue-100 bg-blue-50/70",
  STEP_EXPAND: "border-cyan-100 bg-cyan-50/70",
  STEP_FOCUS: "border-indigo-100 bg-indigo-50/70",
  STEP_FINAL: "border-emerald-100 bg-emerald-50/70",
};

const MotionCard = ({ step, title, subtitle, active, children }: MotionCardProps) => {
  return (
    <motion.article
      layout
      initial="hidden"
      animate="visible"
      variants={stepVariants[step]}
      className={[
        "rounded-2xl border p-6 md:p-7",
        active ? toneByStep[step] : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <header className="mb-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700/90">
          {step}
        </p>
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <p className="text-sm leading-6 text-slate-600">{subtitle}</p>
      </header>
      {children}
    </motion.article>
  );
};

export default MotionCard;
