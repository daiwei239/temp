import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import UploadPanel from "./components/UploadPanel";
import PaperChatDock, { type ChatMessage } from "./components/PaperChatDock";
import StreamingContainer from "./components/StreamingContainer";
import { usePaperStream } from "./hooks/usePaperStream";
import { getApiBaseUrl } from "./lib/backendUrl";

interface StepResult {
  title?: string;
  paper_meta?: {
    keywords?: string[];
    authors?: string;
    impact_factor?: string;
    publish_year?: string;
  };
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

interface StepCard {
  id: string;
  step: "STEP_APPEAR" | "STEP_EXPAND" | "STEP_FOCUS" | "STEP_FINAL";
  icon: string;
  title: string;
  content: string;
}

interface PaperMetaInfo {
  keywords: string[];
  authors: string;
  impactFactor: string;
  publishYear: string;
}

interface RelatedPaperRec {
  title: string;
  method: string;
  reason: string;
  pdfUrl: string;
}

interface RelatedAuthorRec {
  name: string;
  factors: string;
  reason: string;
}

type ViewKey = "home" | "search" | "recommend" | "polish";

const navItems: Array<{ key: ViewKey; label: string; icon: string; hint: string }> = [
  { key: "home", label: "首页", icon: "⌂", hint: "Dashboard" },
  { key: "search", label: "搜索", icon: "⌕", hint: "Discovery" },
  { key: "recommend", label: "推荐", icon: "★", hint: "Insights" },
  { key: "polish", label: "文字润色", icon: "✎", hint: "Writing" },
];

type DisciplineKey =
  | "cs"
  | "math"
  | "physics"
  | "biology"
  | "economics"
  | "medicine"
  | "chemistry"
  | "materials"
  | "earth"
  | "social";
type JournalDomain =
  | "ai"
  | "systems"
  | "software"
  | "database"
  | "network"
  | "math_opt"
  | "math_stats"
  | "math_ap"
  | "math_pr"
  | "math_nt"
  | "phys_hep"
  | "phys_cond"
  | "phys_quant"
  | "phys_astro"
  | "phys_plasma"
  | "bio_genomics"
  | "bio_neurons"
  | "bio_bm"
  | "bio_pe"
  | "bio_qm"
  | "econ_theory"
  | "econ_em"
  | "econ_gn"
  | "econ_fin"
  | "econ_trade"
  | "med_imaging"
  | "med_bioinfo"
  | "med_neuro"
  | "med_genomics"
  | "med_public"
  | "chem_physical"
  | "chem_theory"
  | "chem_materials"
  | "chem_comp"
  | "chem_spectro"
  | "mat_condensed"
  | "mat_soft"
  | "mat_mtrl"
  | "mat_polymer"
  | "mat_nano"
  | "earth_geophysics"
  | "earth_climate"
  | "earth_atmos"
  | "earth_planet"
  | "earth_ocean"
  | "social_econ"
  | "social_stats"
  | "social_network"
  | "social_policy"
  | "social_behavior";

interface TopVenue {
  id: JournalDomain;
  discipline: DisciplineKey;
  icon: string;
  name: string;
  venue: string;
  accent: string;
}

interface TopPaper {
  id: string;
  domain: JournalDomain;
  title: string;
  summary: string;
  tags: string[];
  relations?: Array<{ from: string; to: string; type: string }>;
  brief?: string[];
  venue: string;
  publishedAt: string;
  pdfUrl: string;
}

const topVenues: TopVenue[] = [
  { id: "ai", discipline: "cs", icon: "🧠", name: "人工智能", venue: "cs.AI", accent: "from-blue-100 to-cyan-100" },
  { id: "systems", discipline: "cs", icon: "🖥️", name: "系统架构", venue: "cs.DC/cs.OS", accent: "from-emerald-100 to-cyan-100" },
  { id: "software", discipline: "cs", icon: "🧩", name: "软件工程", venue: "cs.SE", accent: "from-orange-100 to-amber-100" },
  { id: "database", discipline: "cs", icon: "🗄️", name: "数据管理", venue: "cs.DB", accent: "from-indigo-100 to-purple-100" },
  { id: "network", discipline: "cs", icon: "🌐", name: "网络通信", venue: "cs.NI", accent: "from-sky-100 to-teal-100" },
  { id: "math_opt", discipline: "math", icon: "📐", name: "优化理论", venue: "math.OC", accent: "from-cyan-100 to-sky-100" },
  { id: "math_stats", discipline: "math", icon: "📊", name: "统计学习", venue: "math.ST", accent: "from-emerald-100 to-teal-100" },
  { id: "math_ap", discipline: "math", icon: "🧮", name: "应用数学", venue: "math.AP", accent: "from-amber-100 to-orange-100" },
  { id: "math_pr", discipline: "math", icon: "🎲", name: "概率论", venue: "math.PR", accent: "from-indigo-100 to-violet-100" },
  { id: "math_nt", discipline: "math", icon: "🔢", name: "数论", venue: "math.NT", accent: "from-fuchsia-100 to-purple-100" },
  { id: "phys_hep", discipline: "physics", icon: "⚛️", name: "高能物理", venue: "hep-th", accent: "from-blue-100 to-indigo-100" },
  { id: "phys_cond", discipline: "physics", icon: "🧲", name: "凝聚态", venue: "cond-mat", accent: "from-slate-100 to-cyan-100" },
  { id: "phys_quant", discipline: "physics", icon: "🌀", name: "量子物理", venue: "quant-ph", accent: "from-violet-100 to-indigo-100" },
  { id: "phys_astro", discipline: "physics", icon: "🌌", name: "天体物理", venue: "astro-ph", accent: "from-sky-100 to-indigo-100" },
  { id: "phys_plasma", discipline: "physics", icon: "🔥", name: "等离子体", venue: "physics.plasm-ph", accent: "from-orange-100 to-rose-100" },
  { id: "bio_genomics", discipline: "biology", icon: "🧬", name: "基因组学", venue: "q-bio.GN", accent: "from-emerald-100 to-lime-100" },
  { id: "bio_neurons", discipline: "biology", icon: "🧠", name: "神经科学", venue: "q-bio.NC", accent: "from-cyan-100 to-blue-100" },
  { id: "bio_bm", discipline: "biology", icon: "💊", name: "生物分子", venue: "q-bio.BM", accent: "from-emerald-100 to-teal-100" },
  { id: "bio_pe", discipline: "biology", icon: "🌱", name: "种群生态", venue: "q-bio.PE", accent: "from-lime-100 to-green-100" },
  { id: "bio_qm", discipline: "biology", icon: "🔬", name: "定量方法", venue: "q-bio.QM", accent: "from-teal-100 to-cyan-100" },
  { id: "econ_theory", discipline: "economics", icon: "📘", name: "经济理论", venue: "econ.TH", accent: "from-blue-100 to-slate-100" },
  { id: "econ_em", discipline: "economics", icon: "📉", name: "计量经济", venue: "econ.EM", accent: "from-cyan-100 to-sky-100" },
  { id: "econ_gn", discipline: "economics", icon: "🌍", name: "综合经济", venue: "econ.GN", accent: "from-amber-100 to-yellow-100" },
  { id: "econ_fin", discipline: "economics", icon: "💹", name: "金融经济", venue: "q-fin.EC", accent: "from-green-100 to-emerald-100" },
  { id: "econ_trade", discipline: "economics", icon: "🚢", name: "贸易经济", venue: "q-fin.GN", accent: "from-orange-100 to-amber-100" },
  { id: "med_imaging", discipline: "medicine", icon: "🩻", name: "医学影像", venue: "eess.IV/cs.CV", accent: "from-rose-100 to-orange-100" },
  { id: "med_bioinfo", discipline: "medicine", icon: "🧫", name: "生物信息医学", venue: "q-bio.BM", accent: "from-pink-100 to-rose-100" },
  { id: "med_neuro", discipline: "medicine", icon: "🧠", name: "神经医学", venue: "q-bio.NC", accent: "from-red-100 to-orange-100" },
  { id: "med_genomics", discipline: "medicine", icon: "🧬", name: "医学基因组", venue: "q-bio.GN", accent: "from-fuchsia-100 to-pink-100" },
  { id: "med_public", discipline: "medicine", icon: "🏥", name: "公共健康建模", venue: "q-bio.PE", accent: "from-orange-100 to-amber-100" },
  { id: "chem_physical", discipline: "chemistry", icon: "⚗️", name: "物理化学", venue: "physics.chem-ph", accent: "from-lime-100 to-emerald-100" },
  { id: "chem_theory", discipline: "chemistry", icon: "🧪", name: "化学理论", venue: "chem-ph/stat-mech", accent: "from-green-100 to-teal-100" },
  { id: "chem_materials", discipline: "chemistry", icon: "🧱", name: "化学材料", venue: "cond-mat.mtrl-sci", accent: "from-teal-100 to-cyan-100" },
  { id: "chem_comp", discipline: "chemistry", icon: "💻", name: "计算化学", venue: "physics.comp-ph", accent: "from-cyan-100 to-sky-100" },
  { id: "chem_spectro", discipline: "chemistry", icon: "🌈", name: "光谱与原子", venue: "physics.atom-ph", accent: "from-sky-100 to-blue-100" },
  { id: "mat_condensed", discipline: "materials", icon: "🧲", name: "凝聚态材料", venue: "cond-mat.str-el", accent: "from-slate-100 to-indigo-100" },
  { id: "mat_soft", discipline: "materials", icon: "🧵", name: "软物质材料", venue: "cond-mat.soft", accent: "from-indigo-100 to-violet-100" },
  { id: "mat_mtrl", discipline: "materials", icon: "🏗️", name: "材料科学", venue: "cond-mat.mtrl-sci", accent: "from-violet-100 to-purple-100" },
  { id: "mat_polymer", discipline: "materials", icon: "🧬", name: "高分子材料", venue: "cond-mat.soft", accent: "from-purple-100 to-fuchsia-100" },
  { id: "mat_nano", discipline: "materials", icon: "🔬", name: "纳米材料", venue: "cond-mat.mes-hall", accent: "from-blue-100 to-cyan-100" },
  { id: "earth_geophysics", discipline: "earth", icon: "🌋", name: "地球物理", venue: "physics.geo-ph", accent: "from-amber-100 to-orange-100" },
  { id: "earth_climate", discipline: "earth", icon: "🌦️", name: "气候科学", venue: "physics.ao-ph", accent: "from-cyan-100 to-blue-100" },
  { id: "earth_atmos", discipline: "earth", icon: "☁️", name: "大气科学", venue: "physics.ao-ph", accent: "from-sky-100 to-indigo-100" },
  { id: "earth_planet", discipline: "earth", icon: "🪐", name: "行星科学", venue: "astro-ph.EP", accent: "from-indigo-100 to-violet-100" },
  { id: "earth_ocean", discipline: "earth", icon: "🌊", name: "海洋与流体", venue: "physics.ao-ph", accent: "from-teal-100 to-cyan-100" },
  { id: "social_econ", discipline: "social", icon: "📈", name: "社会经济", venue: "econ.GN", accent: "from-yellow-100 to-amber-100" },
  { id: "social_stats", discipline: "social", icon: "📊", name: "社会统计", venue: "stat.AP", accent: "from-emerald-100 to-cyan-100" },
  { id: "social_network", discipline: "social", icon: "🕸️", name: "社会网络", venue: "cs.SI", accent: "from-blue-100 to-teal-100" },
  { id: "social_policy", discipline: "social", icon: "🏛️", name: "公共政策", venue: "econ.GN", accent: "from-orange-100 to-yellow-100" },
  { id: "social_behavior", discipline: "social", icon: "🧍", name: "行为科学", venue: "q-bio.PE/cs.CY", accent: "from-rose-100 to-orange-100" },
];

const disciplineOptions: Array<{ key: DisciplineKey; label: string }> = [
  { key: "cs", label: "计算机" },
  { key: "math", label: "数学" },
  { key: "physics", label: "物理" },
  { key: "biology", label: "生物" },
  { key: "economics", label: "经济" },
  { key: "medicine", label: "医学" },
  { key: "chemistry", label: "化学" },
  { key: "materials", label: "材料" },
  { key: "earth", label: "地球科学" },
  { key: "social", label: "社会科学" },
];

interface RecommendResponse {
  domain: JournalDomain;
  items: TopPaper[];
  source?: string;
  error?: string;
}

interface ScholarProfile {
  name: string;
  affiliation: string;
  citations: number;
  hIndex: number;
  tags: string[];
  profileUrl: string;
}

function buildScholarMirrorUrl(name: string): string {
  return `https://scholar.lanfanshu.cn/scholar?q=${encodeURIComponent(name)}`;
}

const scholarsByDomain: Partial<Record<JournalDomain, ScholarProfile[]>> = {
  ai: [
    { name: "Yann LeCun", affiliation: "Meta / NYU", citations: 420000, hIndex: 240, tags: ["representation learning", "computer vision"], profileUrl: "https://scholar.google.com/" },
    { name: "Geoffrey Hinton", affiliation: "University of Toronto", citations: 980000, hIndex: 310, tags: ["deep learning", "neural networks"], profileUrl: "https://scholar.google.com/" },
    { name: "Yoshua Bengio", affiliation: "University of Montreal", citations: 760000, hIndex: 280, tags: ["generative models", "deep learning"], profileUrl: "https://scholar.google.com/" },
    { name: "Jitendra Malik", affiliation: "UC Berkeley", citations: 220000, hIndex: 190, tags: ["vision", "scene understanding"], profileUrl: "https://scholar.google.com/" },
    { name: "Fei-Fei Li", affiliation: "Stanford University", citations: 210000, hIndex: 170, tags: ["vision foundation", "medical AI"], profileUrl: "https://scholar.google.com/" },
  ],
  systems: [
    { name: "Ion Stoica", affiliation: "UC Berkeley", citations: 240000, hIndex: 180, tags: ["distributed systems", "cloud"], profileUrl: "https://scholar.google.com/" },
    { name: "Matei Zaharia", affiliation: "Stanford University", citations: 190000, hIndex: 120, tags: ["data systems", "cluster computing"], profileUrl: "https://scholar.google.com/" },
    { name: "Jennifer Rexford", affiliation: "Princeton University", citations: 130000, hIndex: 120, tags: ["networked systems", "internet architecture"], profileUrl: "https://scholar.google.com/" },
    { name: "Andrew S. Tanenbaum", affiliation: "Vrije Universiteit Amsterdam", citations: 170000, hIndex: 105, tags: ["operating systems", "distributed computing"], profileUrl: "https://scholar.google.com/" },
    { name: "Tim Kraska", affiliation: "MIT", citations: 60000, hIndex: 75, tags: ["learned systems", "data infrastructure"], profileUrl: "https://scholar.google.com/" },
  ],
  software: [
    { name: "Mark Harman", affiliation: "University College London", citations: 98000, hIndex: 110, tags: ["search-based SE", "testing"], profileUrl: "https://scholar.google.com/" },
    { name: "Prem Devanbu", affiliation: "UC Davis", citations: 91000, hIndex: 100, tags: ["mining software repositories", "quality"], profileUrl: "https://scholar.google.com/" },
    { name: "Tao Xie", affiliation: "University of Illinois Urbana-Champaign", citations: 87000, hIndex: 95, tags: ["software testing", "program analysis"], profileUrl: "https://scholar.google.com/" },
    { name: "Andreas Zeller", affiliation: "CISPA / Saarland University", citations: 125000, hIndex: 90, tags: ["debugging", "automated repair"], profileUrl: "https://scholar.google.com/" },
    { name: "Thomas Zimmermann", affiliation: "Microsoft Research", citations: 105000, hIndex: 95, tags: ["MSR", "developer productivity"], profileUrl: "https://scholar.google.com/" },
  ],
  database: [
    { name: "Michael Stonebraker", affiliation: "MIT", citations: 170000, hIndex: 120, tags: ["DBMS", "stream processing"], profileUrl: "https://scholar.google.com/" },
    { name: "Joseph M. Hellerstein", affiliation: "UC Berkeley", citations: 120000, hIndex: 120, tags: ["data systems", "query optimization"], profileUrl: "https://scholar.google.com/" },
    { name: "Surajit Chaudhuri", affiliation: "Microsoft", citations: 85000, hIndex: 105, tags: ["query processing", "indexing"], profileUrl: "https://scholar.google.com/" },
    { name: "Tim Kraska", affiliation: "MIT", citations: 60000, hIndex: 75, tags: ["learned index", "data infrastructure"], profileUrl: "https://scholar.google.com/" },
    { name: "Jennifer Widom", affiliation: "Stanford University", citations: 83000, hIndex: 90, tags: ["data stream", "data management"], profileUrl: "https://scholar.google.com/" },
  ],
  network: [
    { name: "Nick McKeown", affiliation: "Stanford University", citations: 160000, hIndex: 115, tags: ["SDN", "switch architecture"], profileUrl: "https://scholar.google.com/" },
    { name: "Hari Balakrishnan", affiliation: "MIT", citations: 190000, hIndex: 140, tags: ["internet systems", "wireless networks"], profileUrl: "https://scholar.google.com/" },
    { name: "Dina Katabi", affiliation: "MIT", citations: 130000, hIndex: 105, tags: ["wireless sensing", "networked systems"], profileUrl: "https://scholar.google.com/" },
    { name: "Vint Cerf", affiliation: "Google", citations: 70000, hIndex: 95, tags: ["internet protocols", "network architecture"], profileUrl: "https://scholar.google.com/" },
    { name: "Sally Floyd", affiliation: "ICSI", citations: 100000, hIndex: 90, tags: ["congestion control", "internet transport"], profileUrl: "https://scholar.google.com/" },
  ],
};

const scholarsByDiscipline: Record<DisciplineKey, ScholarProfile[]> = {
  cs: scholarsByDomain.ai ?? [],
  math: [
    { name: "Terence Tao", affiliation: "UCLA", citations: 120000, hIndex: 95, tags: ["harmonic analysis", "number theory"], profileUrl: "https://scholar.google.com/" },
    { name: "Emmanuel Candes", affiliation: "Stanford University", citations: 180000, hIndex: 120, tags: ["optimization", "high-dimensional statistics"], profileUrl: "https://scholar.google.com/" },
    { name: "Martin Hairer", affiliation: "EPFL", citations: 45000, hIndex: 55, tags: ["stochastic PDE", "probability"], profileUrl: "https://scholar.google.com/" },
  ],
  physics: [
    { name: "Juan Maldacena", affiliation: "IAS", citations: 150000, hIndex: 110, tags: ["string theory", "quantum gravity"], profileUrl: "https://scholar.google.com/" },
    { name: "Nima Arkani-Hamed", affiliation: "IAS", citations: 130000, hIndex: 95, tags: ["particle physics", "amplitudes"], profileUrl: "https://scholar.google.com/" },
    { name: "Xiaowei Zhuang", affiliation: "Harvard University", citations: 100000, hIndex: 130, tags: ["biophysics", "single-molecule"], profileUrl: "https://scholar.google.com/" },
  ],
  biology: [
    { name: "Jennifer Doudna", affiliation: "UC Berkeley", citations: 260000, hIndex: 190, tags: ["CRISPR", "genome editing"], profileUrl: "https://scholar.google.com/" },
    { name: "David Baker", affiliation: "University of Washington", citations: 240000, hIndex: 190, tags: ["protein design", "structural biology"], profileUrl: "https://scholar.google.com/" },
    { name: "Karl Deisseroth", affiliation: "Stanford University", citations: 210000, hIndex: 180, tags: ["optogenetics", "systems neuroscience"], profileUrl: "https://scholar.google.com/" },
  ],
  economics: [
    { name: "Daron Acemoglu", affiliation: "MIT", citations: 320000, hIndex: 185, tags: ["political economy", "growth"], profileUrl: "https://scholar.google.com/" },
    { name: "Esther Duflo", affiliation: "MIT", citations: 210000, hIndex: 145, tags: ["development economics", "field experiments"], profileUrl: "https://scholar.google.com/" },
    { name: "Joshua Angrist", affiliation: "MIT", citations: 260000, hIndex: 170, tags: ["econometrics", "causal inference"], profileUrl: "https://scholar.google.com/" },
  ],
  medicine: [
    { name: "Eric Topol", affiliation: "Scripps Research", citations: 210000, hIndex: 220, tags: ["digital medicine", "AI in healthcare"], profileUrl: "https://scholar.google.com/" },
    { name: "Regina Barzilay", affiliation: "MIT", citations: 120000, hIndex: 90, tags: ["medical AI", "clinical NLP"], profileUrl: "https://scholar.google.com/" },
    { name: "Ziad Obermeyer", affiliation: "UC Berkeley", citations: 65000, hIndex: 70, tags: ["health policy", "clinical prediction"], profileUrl: "https://scholar.google.com/" },
  ],
  chemistry: [
    { name: "Omar Yaghi", affiliation: "UC Berkeley", citations: 260000, hIndex: 250, tags: ["MOF", "materials chemistry"], profileUrl: "https://scholar.google.com/" },
    { name: "Jens Norskov", affiliation: "DTU", citations: 190000, hIndex: 170, tags: ["catalysis", "computational chemistry"], profileUrl: "https://scholar.google.com/" },
    { name: "Martin Karplus", affiliation: "Harvard University", citations: 330000, hIndex: 170, tags: ["molecular dynamics", "theoretical chemistry"], profileUrl: "https://scholar.google.com/" },
  ],
  materials: [
    { name: "John A. Rogers", affiliation: "Northwestern University", citations: 380000, hIndex: 290, tags: ["flexible electronics", "advanced materials"], profileUrl: "https://scholar.google.com/" },
    { name: "Zhenan Bao", affiliation: "Stanford University", citations: 260000, hIndex: 210, tags: ["organic electronics", "polymer materials"], profileUrl: "https://scholar.google.com/" },
    { name: "Ali Javey", affiliation: "UC Berkeley", citations: 230000, hIndex: 200, tags: ["nano materials", "2D materials"], profileUrl: "https://scholar.google.com/" },
  ],
  earth: [
    { name: "Michael E. Mann", affiliation: "University of Pennsylvania", citations: 190000, hIndex: 140, tags: ["climate science", "earth system"], profileUrl: "https://scholar.google.com/" },
    { name: "Corinne Le Quere", affiliation: "University of East Anglia", citations: 140000, hIndex: 120, tags: ["carbon cycle", "climate"], profileUrl: "https://scholar.google.com/" },
    { name: "Susan Solomon", affiliation: "MIT", citations: 230000, hIndex: 150, tags: ["atmospheric chemistry", "climate"], profileUrl: "https://scholar.google.com/" },
  ],
  social: [
    { name: "Nicholas A. Christakis", affiliation: "Yale University", citations: 150000, hIndex: 150, tags: ["social networks", "behavior"], profileUrl: "https://scholar.google.com/" },
    { name: "Matthew O. Jackson", affiliation: "Stanford University", citations: 120000, hIndex: 95, tags: ["network science", "social economics"], profileUrl: "https://scholar.google.com/" },
    { name: "Sendhil Mullainathan", affiliation: "University of Chicago", citations: 220000, hIndex: 150, tags: ["behavioral science", "public policy"], profileUrl: "https://scholar.google.com/" },
  ],
};

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
          className="btn-primary rounded-xl bg-[#8DAFDD] px-6 py-3 text-sm font-medium text-[#6e4a3a] transition hover:bg-[#7FA2D2]"
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
  const [activeDiscipline, setActiveDiscipline] = useState<DisciplineKey>("cs");
  const [activeDomain, setActiveDomain] = useState<JournalDomain>("ai");
  const [papers, setPapers] = useState<TopPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const filteredVenues = useMemo(
    () => topVenues.filter((item) => item.discipline === activeDiscipline),
    [activeDiscipline],
  );

  useEffect(() => {
    const hasCurrent = filteredVenues.some((item) => item.id === activeDomain);
    if (!hasCurrent && filteredVenues[0]) {
      setActiveDomain(filteredVenues[0].id);
    }
  }, [activeDomain, filteredVenues]);

  const currentVenue = useMemo(
    () => filteredVenues.find((item) => item.id === activeDomain) ?? filteredVenues[0] ?? topVenues[0],
    [activeDomain, filteredVenues],
  );
  const scholars = useMemo(
    () => [...(scholarsByDomain[activeDomain] ?? scholarsByDiscipline[activeDiscipline] ?? [])].sort((a, b) => b.citations - a.citations),
    [activeDiscipline, activeDomain],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const url = `${getApiBaseUrl()}/api/recommendations?domain=${activeDomain}&limit=10`;
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as RecommendResponse;
        const next = Array.isArray(data.items) ? data.items : [];
        if (!cancelled) {
          setPapers(next);
          if (data.error) {
            setLoadError("实时数据源暂不可用（arXiv 连接失败），当前无法返回真实最新论文。");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPapers([]);
          setLoadError("暂时无法拉取实时论文列表，请稍后重试。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeDomain]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
      <h2 className="text-2xl font-semibold text-slate-800">推荐</h2>
      <p className="mt-2 text-slate-600">先选择学科类别，再选择方向，按最近时间返回该方向论文与相关学者。</p>

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-slate-700">学科类别</p>
        <div className="flex flex-wrap gap-2">
          {disciplineOptions.map((item) => {
            const active = item.key === activeDiscipline;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveDiscipline(item.key)}
                className={`discipline-chip rounded-full border px-3 py-1.5 text-sm transition-all duration-200 ${
                  active
                    ? "discipline-chip-active border-[#cbc4be] bg-[#f7f4f1] text-[#2f2b28]"
                    : "discipline-chip-inactive border-[#e0dad5] bg-white/70 text-slate-600 hover:border-[#cfc7c0] hover:bg-[#f9f7f4] hover:text-slate-800"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {filteredVenues.map((venue) => {
          const active = venue.id === activeDomain;
          return (
            <button
              key={venue.id}
              type="button"
              onClick={() => setActiveDomain(venue.id)}
              className={`venue-tile rounded-2xl border p-4 text-left transition-all duration-200 ${
                active
                  ? "venue-tile-active border-[#cbc4be] bg-[#f8f6f3]"
                  : "venue-tile-inactive border-[#e3ddd8] bg-[#fbfaf8] hover:-translate-y-[1px] hover:border-[#cfc7c0] hover:bg-white hover:shadow-[0_8px_18px_rgba(43,35,28,0.08)]"
              }`}
            >
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-lg ${venue.accent}`}>
                {venue.icon}
              </div>
              <p className="text-sm font-semibold text-slate-800">{venue.name}</p>
              <p className="mt-1 text-xs text-slate-500">{venue.venue}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {currentVenue.name} 顶刊最新论文
            </p>
            <p className="text-xs text-slate-500">按时间倒序</p>
          </div>

          {loading ? <p className="text-sm text-slate-500">正在加载实时论文...</p> : null}
          {!loading && loadError ? <p className="text-sm text-rose-500">{loadError}</p> : null}
          {!loading && !loadError && papers.length === 0 ? (
            <p className="text-sm text-slate-500">当前类别暂无可展示论文。</p>
          ) : null}

          {papers.map((paper) => (
            <article key={paper.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600">#{paper.id}</span>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-blue-700">{paper.venue}</span>
                <span className="text-slate-500">{paper.publishedAt}</span>
              </div>

              <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                <h3 className="text-xl font-semibold leading-tight text-slate-800 hover:text-blue-700">
                  {paper.title}
                </h3>
              </a>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                {paper.brief && paper.brief.length > 0
                  ? paper.brief[0]
                  : "后端正在生成中文摘要简述，请稍候刷新。"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {paper.tags.slice(0, 5).map((tag) => (
                  <span
                    key={`${paper.id}-${tag}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
                {paper.tags.length > 5 ? (
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">
                    +{paper.tags.length - 5} 更多
                  </span>
                ) : null}
              </div>

              {paper.relations && paper.relations.length > 0 ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-xs font-medium text-slate-600">词条关系图</p>
                  <div className="mt-2 space-y-1.5">
                    {paper.relations.map((rel, idx) => (
                      <div key={`${paper.id}-rel-${idx}`} className="flex items-center gap-2 text-[11px]">
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700">{rel.from}</span>
                        <span className="text-slate-400">→</span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700">{rel.to}</span>
                        <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-cyan-700">{rel.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {paper.brief && paper.brief.length > 0 ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
                  <p className="text-xs font-medium text-slate-600">后端摘要解读</p>
                  <ul className="mt-1.5 space-y-1">
                    {paper.brief.map((line, idx) => (
                      <li key={`${paper.id}-brief-${idx}`} className="text-xs leading-5 text-slate-600">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4">
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  查看PDF
                </a>
              </div>
            </article>
          ))}
        </div>

        <aside className="xl:sticky xl:top-28 xl:h-fit">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">相关学者推荐</h3>
              <span className="text-xs text-slate-500">按引用量排序</span>
            </div>

            <div className="space-y-3">
              {scholars.map((person, index) => {
                const normalizedName = person.name.trim();
                const initials = normalizedName.includes(" ")
                  ? normalizedName
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((token) => token[0])
                      .join("")
                      .toUpperCase()
                  : normalizedName.slice(0, 2).toUpperCase();

                return (
                  <article key={`${activeDomain}-${person.name}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="scholar-avatar inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{person.name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{person.affiliation}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">#{index + 1}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-white px-2 py-1">
                        <p className="text-slate-500">引用量</p>
                        <p className="font-semibold text-slate-700">{person.citations.toLocaleString()}</p>
                      </div>
                      <div className="rounded-md bg-white px-2 py-1">
                        <p className="text-slate-500">h-index</p>
                        <p className="font-semibold text-slate-700">{person.hIndex}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {person.tags.map((tag) => (
                        <span
                          key={`${person.name}-${tag}`}
                          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <a
                      href={buildScholarMirrorUrl(person.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-medium text-blue-700 hover:text-blue-800"
                    >
                      谷歌学术镜像
                    </a>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
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
        <label className="polish-input-wrap block rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-sm font-medium text-slate-700">原文输入</span>
          <textarea
            className="polish-input mt-3 h-40 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#dcc9b8] focus:ring-2 focus:ring-[#F8EFE7]"
            placeholder="请输入需要润色的学术段落..."
          />
        </label>

        <article className="polish-result rounded-2xl border border-[#e7d9cc] bg-[#F8EFE7] p-4">
          <p className="polish-result-title text-sm font-medium text-[#8a5548]">润色后（示例）</p>
          <p className="polish-result-text mt-3 text-sm leading-7 text-slate-700">
            To improve robustness in long-context reasoning, we introduce a graph-structured retrieval module that explicitly models entity-level relations and evidence paths.
            Experimental results indicate that this design consistently improves answer faithfulness while preserving response efficiency.
          </p>
        </article>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="btn-primary rounded-xl bg-[#8DAFDD] px-6 py-3 text-sm font-medium text-[#6e4a3a] transition hover:bg-[#7FA2D2]"
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
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [step1Text, setStep1Text] = useState("");
  const [step1Done, setStep1Done] = useState(false);
  const [step1Data, setStep1Data] = useState<StepResult | null>(null);
  const [step1Cards, setStep1Cards] = useState<StepCard[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [relatedPapersRealtime, setRelatedPapersRealtime] = useState<RelatedPaperRec[]>([]);

  const paperMeta = useMemo<PaperMetaInfo>(() => {
    const modelMeta = step1Data?.paper_meta;
    const keywords = (modelMeta?.keywords ?? []).map((item) => item.trim()).filter(Boolean);

    return {
      keywords: keywords.length > 0 ? Array.from(new Set(keywords)).slice(0, 8) : ["待识别"],
      authors: modelMeta?.authors?.trim() || "待识别",
      impactFactor: modelMeta?.impact_factor?.trim() || "待识别",
      publishYear: modelMeta?.publish_year?.trim() || "待识别",
    };
  }, [step1Data]);

  const inferDomain = (keywords: string[], method?: string): JournalDomain => {
    const text = `${keywords.join(" ")} ${method ?? ""}`.toLowerCase();
    if (/(network|网络|通信|routing|transport|sdn)/.test(text)) return "network";
    if (/(database|数据|检索|query|sql|index)/.test(text)) return "database";
    if (/(software|程序|测试|repair|代码|debug)/.test(text)) return "software";
    if (/(system|系统|分布式|调度|os|kernel|cloud)/.test(text)) return "systems";
    return "ai";
  };

  const relatedPapersFallback = useMemo<RelatedPaperRec[]>(() => {
    if (!step1Done) return [];
    const keywords = paperMeta.keywords.filter((k) => k !== "待识别");
    const key = keywords[0] || "智能研究";
    const methodHint = (step1Data?.core_methodology || "结构化建模与实验验证").slice(0, 42);
    const query = encodeURIComponent(key);
    const fallbackUrl = `https://arxiv.org/search/?query=${query}&searchtype=all`;

    return [
      {
        title: `${key} 的检索增强范式研究`,
        method: `方法：${methodHint} + 检索增强框架`,
        reason: "推荐理由：与当前论文的任务设定和技术路径高度相关，便于快速建立可比基线。",
        pdfUrl: fallbackUrl,
      },
      {
        title: `${key} 场景下的图结构推理方法`,
        method: "方法：图建模、关系推理、证据路径追踪",
        reason: "推荐理由：可用于补强可解释性分析，并为后续实验提供结构化消融维度。",
        pdfUrl: fallbackUrl,
      },
      {
        title: `${key} 方向的高效优化与评测策略`,
        method: "方法：轻量化优化、误差分解、统一评测协议",
        reason: "推荐理由：有助于在计算成本可控前提下提升复现实验效率与结论稳健性。",
        pdfUrl: fallbackUrl,
      },
    ];
  }, [paperMeta.keywords, step1Data?.core_methodology, step1Done]);

  useEffect(() => {
    let cancelled = false;
    if (!step1Done) {
      setRelatedPapersRealtime([]);
      return;
    }
    const run = async () => {
      try {
        const keywords = paperMeta.keywords.filter((k) => k !== "待识别");
        const domain = inferDomain(keywords, step1Data?.core_methodology);
        const resp = await fetch(`${getApiBaseUrl()}/api/recommendations?domain=${domain}&limit=3`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as RecommendResponse;
        const items = (data.items ?? []).slice(0, 3).map((item) => ({
          title: item.title,
          method: `方法：${item.tags.slice(0, 3).join("、") || "后端提取中"}`,
          reason: `推荐理由：发表于 ${item.publishedAt}，与当前主题“${keywords[0] || "研究问题"}”相关。`,
          pdfUrl: item.pdfUrl,
        }));
        if (!cancelled) setRelatedPapersRealtime(items);
      } catch {
        if (!cancelled) setRelatedPapersRealtime([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [paperMeta.keywords, step1Data?.core_methodology, step1Done]);

  const relatedPapers = relatedPapersRealtime.length > 0 ? relatedPapersRealtime : relatedPapersFallback;

  const relatedAuthors = useMemo<RelatedAuthorRec[]>(() => {
    if (!step1Done) return [];
    return [
      {
        name: "Yoshua Bengio",
        factors: "h-index: 280 | 引用量: 760k+",
        reason: "推荐理由：在深度学习与生成建模方向影响力高，适合作为方法论参考作者。",
      },
      {
        name: "Geoffrey Hinton",
        factors: "h-index: 310 | 引用量: 980k+",
        reason: "推荐理由：在表示学习与神经网络优化方面贡献突出，便于追踪基础脉络。",
      },
      {
        name: "Fei-Fei Li",
        factors: "h-index: 170 | 引用量: 210k+",
        reason: "推荐理由：在视觉与通用智能应用研究中有大量高质量成果，可拓展应用视角。",
      },
    ];
  }, [step1Done]);

  const { sendAction, connected } = usePaperStream(paperId, {
    onStatusChange: (msg) => setStatusText(msg),
    onStep1Stream: (chunk) => setStep1Text((prev) => prev + chunk),
    onStep1Done: (data) => {
      setStep1Data(data ?? null);
      setStep1Done(true);
      setStatusText("结构化分析已完成");
    },
    onStep1Card: (card) => {
      if (!card) return;
      setStep1Cards((prev) => [...prev, card as StepCard]);
    },
    onChatStream: (chunk) => {
      setChatPending(true);
      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: `${last.content}${chunk}`,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: chunk,
            streaming: true,
          },
        ];
      });
    },
    onChatDone: (answer) => {
      setChatPending(false);
      setChatMessages((prev) => {
        if (prev.length === 0) {
          return answer
            ? [{ id: `assistant-${Date.now()}`, role: "assistant", content: answer, streaming: false }]
            : prev;
        }
        const last = prev[prev.length - 1];
        if (last.role === "assistant") {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: answer && answer.trim() ? answer : last.content,
            streaming: false,
          };
          return updated;
        }
        return answer
          ? [...prev, { id: `assistant-${Date.now()}`, role: "assistant", content: answer, streaming: false }]
          : prev;
      });
    },
  });

  const handleUploaded = (newPaperId: string) => {
    setPaperId(newPaperId);
    setAnalysisStarted(false);
    setStep1Text("");
    setStep1Data(null);
    setStep1Cards([]);
    setStep1Done(false);
    setChatMessages([]);
    setChatPending(false);
    setStatusText("上传完成，等待开始分析...");
  };

  const handleStartAnalyze = () => {
    if (!paperId) return;
    setAnalysisStarted(true);
    setStep1Text("");
    setStep1Data(null);
    setStep1Cards([]);
    setStep1Done(false);
    setStatusText("正在生成结构化内容...");
    sendAction("analyze_step1");
  };

  const handleSendChat = (question: string) => {
    if (!paperId) return;
    setChatMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: question },
      { id: `assistant-${Date.now() + 1}`, role: "assistant", content: "", streaming: true },
    ]);
    setChatPending(true);
    setStatusText("正在生成追问回答...");
    sendAction("paper_chat", { question });
  };

  return (
    <div className="pb-32">
      {!analysisStarted ? (
        <UploadPanel
          connected={connected}
          hasPaper={Boolean(paperId)}
          statusText={statusText}
          compact={analysisStarted}
          onUploaded={handleUploaded}
          onStartAnalyze={handleStartAnalyze}
        />
      ) : null}

      <StreamingContainer
        streamText={step1Text}
        step1Data={step1Data}
        step1Cards={step1Cards}
        paperMeta={paperMeta}
        connected={connected}
        hasPaper={Boolean(paperId)}
        statusText={statusText}
        step1Done={step1Done}
      />

      {step1Done ? (
        <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">关联研究推荐</h3>
            <p className="text-xs text-slate-500">基于当前论文内容自动生成</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-700">相关论文（3 篇）</h4>
              <div className="mt-3 space-y-3">
                {relatedPapers.map((paper) => (
                  <div key={paper.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <a
                      href={paper.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-slate-800 hover:text-blue-700"
                    >
                      {paper.title}
                    </a>
                    <p className="mt-1 text-xs text-slate-600">{paper.method}</p>
                    <p className="mt-1 text-xs text-slate-500">{paper.reason}</p>
                    <a
                      href={paper.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      查看PDF
                    </a>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-700">相关作者推荐</h4>
              <div className="mt-3 space-y-3">
                {relatedAuthors.map((author) => (
                  <div key={author.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <a
                      href={buildScholarMirrorUrl(author.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-slate-800 hover:text-blue-700"
                    >
                      {author.name}
                    </a>
                    <p className="mt-1 text-xs text-slate-600">{author.factors}</p>
                    <p className="mt-1 text-xs text-slate-500">{author.reason}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {paperId ? (
        <PaperChatDock
          messages={chatMessages}
          hasPaper={Boolean(paperId)}
          connected={connected}
          sending={chatPending}
          showInput={step1Done}
          onSend={handleSendChat}
        />
      ) : null}
    </div>
  );
};

const BrandIcon = () => {
  return (
    <span className="app-brand-icon inline-flex h-8 w-8 items-center justify-center rounded-full">
      <svg viewBox="0 0 28 28" width="22" height="22" aria-hidden="true">
        <circle cx="14" cy="14" r="13" fill="#0a0f16" />
        <circle cx="14" cy="14" r="8" fill="none" stroke="#8DAFDD" strokeWidth="2" />
        <circle cx="11" cy="11" r="1.6" fill="#F6F9FF" />
        <circle cx="17" cy="11" r="1.6" fill="#F6F9FF" />
        <circle cx="14" cy="17" r="1.8" fill="#F6F9FF" />
        <path d="M11 11 L17 11 L14 17 Z" fill="none" stroke="#8DAFDD" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20.5" cy="7.5" r="1.4" fill="#E4A482" />
      </svg>
    </span>
  );
};

const App = () => {
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("peragent-dark-mode");
    if (saved === "1") {
      setDarkMode(true);
      return;
    }
    if (saved === "0") {
      setDarkMode(false);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(prefersDark);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("peragent-dark-mode", darkMode ? "1" : "0");
  }, [darkMode]);

  const CurrentView = useMemo(() => {
    if (activeView === "search") return <SearchPage />;
    if (activeView === "recommend") return <RecommendPage />;
    if (activeView === "polish") return <PolishPage />;
    return <HomePage />;
  }, [activeView]);

  const viewMeta: Record<ViewKey, { title: string; subtitle: string }> = {
    home: {
      title: "ANALYTICAL BOARD",
      subtitle: "论文上传、结构化解析与流式阅读统一工作台",
    },
    search: {
      title: "RESEARCH SEARCH",
      subtitle: "按学科与方向探索高质量研究与作者",
    },
    recommend: {
      title: "SMART RECOMMEND",
      subtitle: "基于方向标签与语义关联生成推荐列表",
    },
    polish: {
      title: "WRITING POLISH",
      subtitle: "将技术段落优化为更规范的学术表达",
    },
  };

  const activeMeta = viewMeta[activeView];

  return (
    <div data-theme={darkMode ? "dark" : "light"} className="app-root min-h-screen bg-[#ece9e7]">
      <div className="app-shell flex min-h-screen w-full overflow-hidden bg-[#ece9e7]">
        <aside className="app-sidebar w-full shrink-0 border-b border-[#d8d2cc] bg-[#e2ded9] md:w-[248px] md:border-b-0 md:border-r">
          <div className="flex h-full flex-col p-5 md:p-6">
            <div className="flex items-center gap-2">
              <BrandIcon />
              <div>
                <p className="app-brand text-sm font-semibold tracking-[0.02em] text-[#181818]">PERAGENT</p>
                <p className="app-brand-sub text-[11px] uppercase tracking-[0.1em] text-[#7f7873]">Research OS</p>
              </div>
            </div>

            <nav className="mt-7">
              <ul className="grid grid-cols-2 gap-2 md:grid-cols-1">
                {navItems.map((item) => {
                  const isActive = activeView === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => setActiveView(item.key)}
                        className={[
                          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                          isActive
                            ? "nav-active border-[#0f0f0f] bg-[#0f0f0f] text-[#ECECEC]"
                            : "nav-inactive border-transparent bg-transparent text-[#43403d] hover:border-[#d5cfca] hover:bg-white/70",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-flex h-6 w-6 items-center justify-center rounded-md text-sm",
                            isActive ? "nav-icon-active bg-white/15 text-[#ECECEC]" : "nav-icon-inactive bg-[#ebe7e4] text-[#3f3a36]",
                          ].join(" ")}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{item.label}</span>
                          <span className={`block truncate text-[10px] ${isActive ? "nav-hint-active text-[#ECECEC]/65" : "text-[#8b847f]"}`}>
                            {item.hint}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="mt-auto pt-6">
              <div className="theme-switch-card rounded-xl border border-[#ddd7d2] bg-[#ebe7e3] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="theme-switch-title truncate text-sm font-semibold text-[#2a2522]">深色模式</p>
                    <p className="theme-switch-desc mt-0.5 text-[11px] text-[#6f6863]">
                      {darkMode ? "已开启，降低眩光" : "已关闭"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="切换深色模式"
                    aria-pressed={darkMode}
                    onClick={() => setDarkMode((prev) => !prev)}
                    className={[
                      "theme-toggle-track relative inline-flex h-7 w-12 items-center rounded-full border transition",
                      darkMode ? "border-[#4b5f78] bg-[#233145]" : "border-[#cfc7c0] bg-[#e7e2dd]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "theme-toggle-thumb inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] transition-transform",
                        darkMode ? "translate-x-6 bg-[#dbe7f8] text-[#223147]" : "translate-x-1 bg-[#f6f2ee] text-[#7b726c]",
                      ].join(" ")}
                    >
                      {darkMode ? "🌙" : "☀"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="app-header app-glass-header border-b border-[#d8d2cc] bg-[#ece9e7]/90 px-4 py-4 backdrop-blur md:px-7 md:py-5">
            <div className="flex items-center justify-between">
              <h1 className="app-title text-3xl font-bold tracking-tight text-[#111111]">{activeMeta.title}</h1>
            </div>
            <p className="app-subtitle mt-2 text-sm text-[#6f6863]">{activeMeta.subtitle}</p>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
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
        </div>
      </div>
    </div>
  );
};

export default App;





