import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import UploadPanel from "./components/UploadPanel";
import PaperChatDock, { type AnswerMode, type ChatMessage } from "./components/PaperChatDock";
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

interface RelatedAuthorRec {
  name: string;
  factors: string;
  reason: string;
}

interface AuthUser {
  id: number;
  username: string;
  phone?: string | null;
  display_name?: string;
  bio?: string;
  avatar_emoji?: string;
  created_at: string;
  last_login_at?: string | null;
}

interface AuthResponse {
  ok: boolean;
  user: AuthUser;
}

interface AuthMeResponse {
  ok: boolean;
  user: AuthUser;
  preference?: {
    research_topics?: string[];
    recent_keywords?: string;
  };
  stats?: {
    conversation_count?: number;
    message_count?: number;
    last_chat_at?: string | null;
  };
}

interface PersistedHistoryItem {
  id: number;
  user_id: number;
  conversation_id?: number | null;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PersistedHistoryResponse {
  ok: boolean;
  items: PersistedHistoryItem[];
}

interface ConversationItem {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationListResponse {
  ok: boolean;
  items: ConversationItem[];
}

type ViewKey = "home" | "search" | "recommend" | "polish";

function formatServerTime(value?: string | null): string {
  if (!value) return "";
  const raw = value.trim();
  if (!raw) return "";
  const withZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const dt = new Date(withZone);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString();
}

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "首页" },
  { key: "search", label: "搜索" },
  { key: "recommend", label: "推荐" },
  { key: "polish", label: "文字润色" },
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
  { id: "ai", discipline: "cs", icon: "🧠", name: "ACL", venue: "NLP 顶会", accent: "from-blue-100 to-cyan-100" },
  { id: "systems", discipline: "cs", icon: "🖥️", name: "ICLR", venue: "机器学习顶会", accent: "from-emerald-100 to-cyan-100" },
  { id: "software", discipline: "cs", icon: "🧩", name: "ICSE", venue: "软件工程顶会", accent: "from-orange-100 to-amber-100" },
  { id: "database", discipline: "cs", icon: "🗄️", name: "SIGMOD", venue: "数据库顶会", accent: "from-indigo-100 to-purple-100" },
  { id: "network", discipline: "cs", icon: "🌐", name: "INFOCOM", venue: "网络通信顶会", accent: "from-sky-100 to-teal-100" },
  { id: "math_opt", discipline: "math", icon: "📐", name: "Annals of Mathematics", venue: "数学顶刊", accent: "from-cyan-100 to-sky-100" },
  { id: "math_stats", discipline: "math", icon: "📊", name: "JASA", venue: "统计学顶刊", accent: "from-emerald-100 to-teal-100" },
  { id: "math_ap", discipline: "math", icon: "🧮", name: "SIAM Review", venue: "应用数学顶刊", accent: "from-amber-100 to-orange-100" },
  { id: "math_pr", discipline: "math", icon: "🎲", name: "PTRF", venue: "概率论顶刊", accent: "from-indigo-100 to-violet-100" },
  { id: "math_nt", discipline: "math", icon: "🔢", name: "Inventiones Mathematicae", venue: "数论顶刊", accent: "from-fuchsia-100 to-purple-100" },
  { id: "phys_hep", discipline: "physics", icon: "⚛️", name: "Physical Review Letters", venue: "综合物理顶刊", accent: "from-blue-100 to-indigo-100" },
  { id: "phys_cond", discipline: "physics", icon: "🧲", name: "Nature Physics", venue: "凝聚态/基础物理顶刊", accent: "from-slate-100 to-cyan-100" },
  { id: "phys_quant", discipline: "physics", icon: "🌀", name: "PRX Quantum", venue: "量子信息顶刊", accent: "from-violet-100 to-indigo-100" },
  { id: "phys_astro", discipline: "physics", icon: "🌌", name: "The Astrophysical Journal", venue: "天体物理顶刊", accent: "from-sky-100 to-indigo-100" },
  { id: "phys_plasma", discipline: "physics", icon: "🔥", name: "Nuclear Fusion", venue: "等离子体顶刊", accent: "from-orange-100 to-rose-100" },
  { id: "bio_genomics", discipline: "biology", icon: "🧬", name: "Nature Genetics", venue: "基因组学顶刊", accent: "from-emerald-100 to-lime-100" },
  { id: "bio_neurons", discipline: "biology", icon: "🧠", name: "Neuron", venue: "神经科学顶刊", accent: "from-cyan-100 to-blue-100" },
  { id: "bio_bm", discipline: "biology", icon: "💊", name: "Cell", venue: "生命科学顶刊", accent: "from-emerald-100 to-teal-100" },
  { id: "bio_pe", discipline: "biology", icon: "🌱", name: "Ecology Letters", venue: "生态学顶刊", accent: "from-lime-100 to-green-100" },
  { id: "bio_qm", discipline: "biology", icon: "🔬", name: "Nature Methods", venue: "生物方法学顶刊", accent: "from-teal-100 to-cyan-100" },
  { id: "econ_theory", discipline: "economics", icon: "📘", name: "Econometrica", venue: "经济学顶刊", accent: "from-blue-100 to-slate-100" },
  { id: "econ_em", discipline: "economics", icon: "📉", name: "AER", venue: "经济学顶刊", accent: "from-cyan-100 to-sky-100" },
  { id: "econ_gn", discipline: "economics", icon: "🌍", name: "QJE", venue: "经济学顶刊", accent: "from-amber-100 to-yellow-100" },
  { id: "econ_fin", discipline: "economics", icon: "💹", name: "Journal of Finance", venue: "金融学顶刊", accent: "from-green-100 to-emerald-100" },
  { id: "econ_trade", discipline: "economics", icon: "🚢", name: "JIE", venue: "国际贸易顶刊", accent: "from-orange-100 to-amber-100" },
  { id: "med_imaging", discipline: "medicine", icon: "🩻", name: "Radiology", venue: "医学影像顶刊", accent: "from-rose-100 to-orange-100" },
  { id: "med_bioinfo", discipline: "medicine", icon: "🧫", name: "JAMIA", venue: "医学信息学顶刊", accent: "from-pink-100 to-rose-100" },
  { id: "med_neuro", discipline: "medicine", icon: "🧠", name: "The Lancet Neurology", venue: "神经医学顶刊", accent: "from-red-100 to-orange-100" },
  { id: "med_genomics", discipline: "medicine", icon: "🧬", name: "Nature Medicine", venue: "医学顶刊", accent: "from-fuchsia-100 to-pink-100" },
  { id: "med_public", discipline: "medicine", icon: "🏥", name: "The Lancet Public Health", venue: "公共卫生顶刊", accent: "from-orange-100 to-amber-100" },
  { id: "chem_physical", discipline: "chemistry", icon: "⚗️", name: "JACS", venue: "化学顶刊", accent: "from-lime-100 to-emerald-100" },
  { id: "chem_theory", discipline: "chemistry", icon: "🧪", name: "Angewandte Chemie", venue: "化学顶刊", accent: "from-green-100 to-teal-100" },
  { id: "chem_materials", discipline: "chemistry", icon: "🧱", name: "Chem", venue: "化学顶刊", accent: "from-teal-100 to-cyan-100" },
  { id: "chem_comp", discipline: "chemistry", icon: "💻", name: "Journal of Chemical Theory and Computation", venue: "计算化学顶刊", accent: "from-cyan-100 to-sky-100" },
  { id: "chem_spectro", discipline: "chemistry", icon: "🌈", name: "Analytical Chemistry", venue: "分析化学顶刊", accent: "from-sky-100 to-blue-100" },
  { id: "mat_condensed", discipline: "materials", icon: "🧲", name: "Advanced Materials", venue: "材料顶刊", accent: "from-slate-100 to-indigo-100" },
  { id: "mat_soft", discipline: "materials", icon: "🧵", name: "Nature Materials", venue: "材料顶刊", accent: "from-indigo-100 to-violet-100" },
  { id: "mat_mtrl", discipline: "materials", icon: "🏗️", name: "Materials Today", venue: "材料顶刊", accent: "from-violet-100 to-purple-100" },
  { id: "mat_polymer", discipline: "materials", icon: "🧬", name: "Progress in Polymer Science", venue: "高分子顶刊", accent: "from-purple-100 to-fuchsia-100" },
  { id: "mat_nano", discipline: "materials", icon: "🔬", name: "Nano Letters", venue: "纳米材料顶刊", accent: "from-blue-100 to-cyan-100" },
  { id: "earth_geophysics", discipline: "earth", icon: "🌋", name: "Geophysical Research Letters", venue: "地球科学顶刊", accent: "from-amber-100 to-orange-100" },
  { id: "earth_climate", discipline: "earth", icon: "🌦️", name: "Nature Climate Change", venue: "气候科学顶刊", accent: "from-cyan-100 to-blue-100" },
  { id: "earth_atmos", discipline: "earth", icon: "☁️", name: "Journal of Climate", venue: "大气科学顶刊", accent: "from-sky-100 to-indigo-100" },
  { id: "earth_planet", discipline: "earth", icon: "🪐", name: "Icarus", venue: "行星科学顶刊", accent: "from-indigo-100 to-violet-100" },
  { id: "earth_ocean", discipline: "earth", icon: "🌊", name: "Journal of Physical Oceanography", venue: "海洋科学顶刊", accent: "from-teal-100 to-cyan-100" },
  { id: "social_econ", discipline: "social", icon: "📈", name: "ASR", venue: "社会学顶刊", accent: "from-yellow-100 to-amber-100" },
  { id: "social_stats", discipline: "social", icon: "📊", name: "JRSS Series B", venue: "社会统计顶刊", accent: "from-emerald-100 to-cyan-100" },
  { id: "social_network", discipline: "social", icon: "🕸️", name: "Social Networks", venue: "社会网络顶刊", accent: "from-blue-100 to-teal-100" },
  { id: "social_policy", discipline: "social", icon: "🏛️", name: "Policy Studies Journal", venue: "公共政策顶刊", accent: "from-orange-100 to-yellow-100" },
  { id: "social_behavior", discipline: "social", icon: "🧍", name: "American Journal of Sociology", venue: "行为/社会学顶刊", accent: "from-rose-100 to-orange-100" },
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

interface SearchPaper {
  id: string;
  domain?: JournalDomain;
  title: string;
  summary: string;
  tags: string[];
  relations?: Array<{ from: string; to: string; type: string }>;
  brief?: string[];
  venue?: string;
  publishedAt: string;
  pdfUrl: string;
}

interface SearchResponse {
  query: string;
  optimized_query?: string;
  items: SearchPaper[];
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

function buildTagRelations(tags: string[], domain: string): Array<{ from: string; to: string; type: string }> {
  const uniq = Array.from(new Set(tags.filter(Boolean))).slice(0, 4);
  if (uniq.length === 0) return [{ from: domain, to: "topic", type: "domain-topic" }];
  const rel: Array<{ from: string; to: string; type: string }> = [];
  if (uniq.length >= 2) rel.push({ from: uniq[0], to: uniq[1], type: "method-support" });
  if (uniq.length >= 3) rel.push({ from: uniq[1], to: uniq[2], type: "evidence-validation" });
  rel.push({ from: domain, to: uniq[0], type: "domain-topic" });
  return rel.slice(0, 3);
}

function buildBriefSentences(title: string, summary: string, tags: string[]): string[] {
  const clean = (summary || "").replace(/\s+/g, " ").trim();
  const tagText = tags.slice(0, 3).join("、") || "相关主题";
  return [
    `论文主题：${title}。`,
    `核心内容：${clean || "该论文围绕关键问题提出结构化方法。"}。`,
    `关键词：${tagText}。`,
  ];
}

const PaperShowCard = ({ paper }: { paper: TopPaper }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
);

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

const SearchPage = ({ currentUser }: { currentUser: AuthUser | null }) => {
  const [query, setQuery] = useState("");
  const [optimizedQuery, setOptimizedQuery] = useState("");
  const [userKeywords, setUserKeywords] = useState<string[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchPaper[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser?.id) {
      setUserKeywords([]);
      setCloudError("");
      return;
    }
    const run = async () => {
      setCloudLoading(true);
      setCloudError("");
      try {
        const resp = await fetch(`${getApiBaseUrl()}/api/auth/me?user_id=${currentUser.id}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as AuthMeResponse;
        const recent = (data.preference?.recent_keywords || "")
          .split(/[,\s，、;；]+/)
          .map((x) => x.trim())
          .filter(Boolean);
        const topics = Array.isArray(data.preference?.research_topics) ? data.preference!.research_topics! : [];
        const merged = Array.from(new Set([...recent, ...topics])).slice(0, 24);
        if (!cancelled) setUserKeywords(merged);
      } catch {
        if (!cancelled) {
          setUserKeywords([]);
          setCloudError("近期关键词读取失败");
        }
      } finally {
        if (!cancelled) setCloudLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const cloudItems = useMemo(
    () =>
      userKeywords.map((word, idx) => {
        const tier = idx % 4;
        const toneClass =
          tier === 0
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : tier === 1
              ? "border-cyan-200 bg-cyan-50 text-cyan-700"
              : tier === 2
                ? "border-slate-200 bg-white text-slate-700"
                : "border-indigo-200 bg-indigo-50 text-indigo-700";
        return { word, toneClass };
      }),
    [userKeywords],
  );

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setSearchError("请输入关键词后再搜索");
      setSearchResults([]);
      setOptimizedQuery("");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/search?q=${encodeURIComponent(q)}&limit=10`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as SearchResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      setSearchResults(items);
      setOptimizedQuery((data.optimized_query || "").trim());
      if (data.error && items.length === 0) {
        setSearchError("检索服务暂不可用，请稍后重试");
      } else if (items.length === 0) {
        setSearchError("未检索到相关论文，请尝试更换关键词");
      }
    } catch {
      setSearchResults([]);
      setOptimizedQuery("");
      setSearchError("搜索失败，请检查后端服务或稍后重试");
    } finally {
      setSearchLoading(false);
    }
  };

  const normalizedSearchPapers = useMemo<TopPaper[]>(
    () =>
      searchResults.slice(0, 10).map((item) => ({
        id: item.id,
        domain: (item.domain || "ai") as JournalDomain,
        title: item.title,
        summary: item.summary,
        tags: Array.isArray(item.tags) ? item.tags : [],
        relations: Array.isArray(item.relations) ? item.relations : buildTagRelations(item.tags || [], "search"),
        brief: Array.isArray(item.brief) && item.brief.length > 0 ? item.brief : buildBriefSentences(item.title, item.summary, item.tags || []),
        venue: item.venue || "Scholar",
        publishedAt: item.publishedAt || "N/A",
        pdfUrl: item.pdfUrl,
      })),
    [searchResults],
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-10 md:p-12">
      <div className="w-full max-w-[1120px]">
        <div className="space-y-2.5">
          <h2 className="text-2xl font-semibold text-slate-800">搜索</h2>
          <p className="max-w-[960px] text-slate-600">输入关键词、作者或研究主题，快速定位论文与相关资料，并结合近期兴趣优化检索。</p>
        </div>

        <div className="mt-8 grid w-full grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_192px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            className="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="例如：多模态检索增强生成、GraphRAG、可解释推荐..."
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searchLoading}
            className="h-[52px] rounded-xl bg-blue-600 px-6 text-base font-semibold text-white transition hover:bg-blue-700"
          >
            {searchLoading ? "搜索中..." : "立即搜索"}
          </button>
        </div>

        {searchError ? <p className="mt-3 text-sm text-rose-600">{searchError}</p> : null}
        {optimizedQuery ? (
          <p className="mt-3 text-sm text-slate-600">
            学术化检索词：
            <span className="ml-1 font-medium text-slate-800">{optimizedQuery}</span>
          </p>
        ) : null}

        {searchResults.length > 0 ? (
          <div className="mt-12 grid w-full gap-5">
            {normalizedSearchPapers.map((paper) => <PaperShowCard key={paper.id} paper={paper} />)}
          </div>
        ) : null}

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">近期关键词词云</h3>
            <span className="text-xs text-slate-500">{currentUser ? "基于你的近期偏好" : "登录后可展示个人词云"}</span>
          </div>

          {cloudLoading ? <p className="text-sm text-slate-500">正在生成词云...</p> : null}
          {!cloudLoading && cloudError ? <p className="text-sm text-rose-500">{cloudError}</p> : null}
          {!cloudLoading && !cloudError && cloudItems.length === 0 ? (
            <p className="text-sm text-slate-500">暂无关键词数据。你可以先在首页完成论文分析和追问。</p>
          ) : null}
          {!cloudLoading && !cloudError && cloudItems.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {cloudItems.map((item, idx) => (
                <span
                  key={`${item.word}-${idx}`}
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${item.toneClass}`}
                >
                  {item.word}
                </span>
              ))}
            </div>
          ) : null}
        </section>
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
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white"
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
              className={`rounded-2xl border p-4 text-left transition ${
                active ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white/70 hover:bg-white"
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
            <PaperShowCard key={paper.id} paper={paper} />
          ))}
        </div>

        <aside className="xl:sticky xl:top-28 xl:h-fit">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">相关学者推荐</h3>
              <span className="text-xs text-slate-500">按引用量排序</span>
            </div>

            <div className="space-y-3">
              {scholars.map((person, index) => (
                <article key={`${activeDomain}-${person.name}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{person.affiliation}</p>
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
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
};

const PolishPage = () => {
  const [inputText, setInputText] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState<DisciplineKey>("cs");
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Array<{ style: string; text: string }>>([]);

  const venueOptions = useMemo(
    () => topVenues.filter((v) => v.discipline === selectedDiscipline).slice(0, 5),
    [selectedDiscipline],
  );

  useEffect(() => {
    setSelectedVenues(venueOptions.length > 0 ? [venueOptions[0].id] : []);
  }, [selectedDiscipline, venueOptions]);

  const venueNameMap = useMemo(() => {
    const map = new Map<string, string>();
    topVenues.forEach((v) => map.set(v.id, `${v.name}（${v.venue}）`));
    return map;
  }, []);

  const runPolish = async () => {
    const text = inputText.trim();
    if (!text) {
      setError("请先输入需要润色的内容");
      return;
    }
    const styles = selectedVenues;
    if (styles.length === 0) {
      setError("请至少勾选一种顶刊类别");
      return;
    }
    setPending(true);
    setError("");
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, styles }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        detail?: string;
        items?: Array<{ style: string; text: string }>;
      };
      if (!resp.ok) throw new Error(data.detail || "润色失败");
      setResults(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "润色失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-8">
      <h2 className="text-2xl font-semibold text-slate-800">文字润色</h2>
      <p className="mt-2 text-slate-600">输入原文后选择学科与顶刊类别（每个学科5类），右侧展示对应规范译文。</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="block rounded-2xl border border-slate-200 bg-white p-4">
          <span className="text-sm font-medium text-slate-700">原文输入</span>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="mt-3 h-40 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            placeholder="请输入需要润色的学术段落..."
          />
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {disciplineOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedDiscipline(item.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedDiscipline === item.key
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {venueOptions.map((venue) => (
                <label key={venue.id} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedVenues.includes(venue.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVenues((prev) => Array.from(new Set([...prev, venue.id])));
                      } else {
                        setSelectedVenues((prev) => prev.filter((id) => id !== venue.id));
                      }
                    }}
                  />
                  {venue.name}（{venue.venue}）
                </label>
              ))}
            </div>
          </div>
        </label>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">规范译文</p>
          <div className="mt-3 space-y-3">
            {results.length === 0 ? (
              <p className="text-sm leading-7 text-slate-600">等待生成结果...</p>
            ) : (
              results.map((item) => (
                <div key={item.style} className="rounded-xl border border-emerald-200 bg-white/80 p-3">
                  <p className="text-xs font-semibold tracking-wide text-emerald-700">
                    {venueNameMap.get(item.style) || item.style}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{item.text}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={runPolish}
          disabled={pending}
          className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          {pending ? "生成中..." : "开始润色"}
        </button>
      </div>
    </section>
  );
};

const HomePage = ({ currentUser }: { currentUser: AuthUser | null }) => {
  const [paperId, setPaperId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("等待上传论文...");
  const [step1Text, setStep1Text] = useState("");
  const [step1Done, setStep1Done] = useState(false);
  const [step1Data, setStep1Data] = useState<StepResult | null>(null);
  const [step1Cards, setStep1Cards] = useState<StepCard[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [persistedHistory, setPersistedHistory] = useState<PersistedHistoryItem[]>([]);
  const [persistedConversations, setPersistedConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [relatedPapersRealtime, setRelatedPapersRealtime] = useState<TopPaper[]>([]);
  const [lastTraceKey, setLastTraceKey] = useState("");

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

  const relatedPapersFallback = useMemo<TopPaper[]>(() => {
    if (!step1Done) return [];
    const keywords = paperMeta.keywords.filter((k) => k !== "待识别");
    const key = keywords[0] || "智能研究";
    const methodHint = (step1Data?.core_methodology || "结构化建模与实验验证").slice(0, 42);
    const query = encodeURIComponent(key);
    const fallbackUrl = `https://arxiv.org/search/?query=${query}&searchtype=all`;

    return [
      {
        id: "HOME-FB-01",
        domain: "ai",
        title: `${key} 的检索增强范式研究`,
        summary: `${methodHint} + 检索增强框架，强调任务设定对齐与可比基线构建。`,
        tags: ["retrieval", "framework", "baseline"],
        relations: buildTagRelations(["retrieval", "framework", "baseline"], "ai"),
        brief: buildBriefSentences(`${key} 的检索增强范式研究`, `${methodHint} + 检索增强框架`, ["retrieval", "framework"]),
        venue: "HOME",
        publishedAt: "N/A",
        pdfUrl: fallbackUrl,
      },
      {
        id: "HOME-FB-02",
        domain: "ai",
        title: `${key} 场景下的图结构推理方法`,
        summary: "图建模、关系推理、证据路径追踪，可补强可解释性分析。",
        tags: ["graph", "reasoning", "evidence"],
        relations: buildTagRelations(["graph", "reasoning", "evidence"], "ai"),
        brief: buildBriefSentences(`${key} 场景下的图结构推理方法`, "图建模、关系推理、证据路径追踪", ["graph", "reasoning"]),
        venue: "HOME",
        publishedAt: "N/A",
        pdfUrl: fallbackUrl,
      },
      {
        id: "HOME-FB-03",
        domain: "ai",
        title: `${key} 方向的高效优化与评测策略`,
        summary: "轻量化优化、误差分解、统一评测协议，强调效率与稳健性。",
        tags: ["optimization", "evaluation", "efficiency"],
        relations: buildTagRelations(["optimization", "evaluation", "efficiency"], "ai"),
        brief: buildBriefSentences(`${key} 方向的高效优化与评测策略`, "轻量化优化、误差分解、统一评测协议", ["optimization", "evaluation"]),
        venue: "HOME",
        publishedAt: "N/A",
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
        const items = (data.items ?? []).slice(0, 3);
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

  useEffect(() => {
    if (!currentUser || !step1Done) return;
    const topics = paperMeta.keywords.filter((k) => k !== "待识别").slice(0, 8);
    if (topics.length === 0) return;
    const recentKeywords = topics.join(", ");
    const traceKey = `${currentUser.id}|${topics.join("|")}|${step1Data?.core_methodology ?? ""}`;
    if (traceKey === lastTraceKey) return;

    let cancelled = false;
    const run = async () => {
      try {
        const resp = await fetch(`${getApiBaseUrl()}/api/auth/preferences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: currentUser.id,
            research_topics: topics,
            recent_keywords: recentKeywords,
          }),
        });
        if (!cancelled && resp.ok) setLastTraceKey(traceKey);
      } catch {
        // ignore trace failure
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [currentUser, step1Done, paperMeta.keywords, step1Data?.core_methodology, lastTraceKey]);

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

  const historyMessages = useMemo(
    () =>
      chatMessages.filter(
        (msg) => msg.role === "user" || (msg.role === "assistant" && msg.content.trim().length > 0),
      ),
    [chatMessages],
  );

  const fetchPersistedConversations = async (userId: number) => {
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/chat/conversations?user_id=${userId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ConversationListResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      setPersistedConversations(items);
      if (items.length === 0) {
        setActiveConversationId(null);
        setPersistedHistory([]);
      } else if (!activeConversationId || !items.some((x) => x.id === activeConversationId)) {
        setActiveConversationId(items[0].id);
      }
    } catch {
      setPersistedConversations([]);
    }
  };

  const fetchConversationMessages = async (userId: number, conversationId: number) => {
    try {
      const resp = await fetch(
        `${getApiBaseUrl()}/api/chat/messages?user_id=${userId}&conversation_id=${conversationId}`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as PersistedHistoryResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      setPersistedHistory(items);
      setChatMessages(
        items.map((item) => ({
          id: `db-msg-${item.id}`,
          role: item.role,
          content: item.content,
          streaming: false,
        })),
      );
    } catch {
      setPersistedHistory([]);
      setChatMessages([]);
    }
  };

  const openConversation = async (conversationId: number) => {
    setActiveConversationId(conversationId);
    if (!currentUser) return;
    await fetchConversationMessages(currentUser.id, conversationId);
  };

  const createConversationFromUpload = async (userId: number, fileName?: string) => {
    const rawTitle = (fileName || "新上传论文").replace(/\.pdf$/i, "").trim();
    const title = `论文：${rawTitle || "新上传论文"}`.slice(0, 200);
    const resp = await fetch(`${getApiBaseUrl()}/api/chat/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, title }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { ok?: boolean; item?: ConversationItem };
    return data.item ?? null;
  };

  useEffect(() => {
    if (!currentUser) {
      setPersistedConversations([]);
      setPersistedHistory([]);
      setActiveConversationId(null);
      return;
    }
    setActiveConversationId(null);
    setPersistedHistory([]);
    fetchPersistedConversations(currentUser.id);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !activeConversationId) return;
    fetchConversationMessages(currentUser.id, activeConversationId);
  }, [activeConversationId, currentUser]);

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
    onConversationCreated: (conversation) => {
      if (!conversation?.id) return;
      setActiveConversationId(conversation.id);
      if (currentUser) {
        fetchPersistedConversations(currentUser.id);
      }
    },
  });

  const handleUploaded = async (newPaperId: string, fileName?: string) => {
    setPaperId(newPaperId);
    setStep1Text("");
    setStep1Data(null);
    setStep1Cards([]);
    setStep1Done(false);
    setChatMessages([]);
    setChatPending(false);
    setStatusText("上传完成，等待开始分析...");

    if (currentUser) {
      try {
        const conv = await createConversationFromUpload(currentUser.id, fileName);
        await fetchPersistedConversations(currentUser.id);
        if (conv?.id) {
          setActiveConversationId(conv.id);
          await fetchConversationMessages(currentUser.id, conv.id);
        }
      } catch {
        // ignore; user can still create conversation on first follow-up message
      }
    }
  };

  const handleStartAnalyze = () => {
    if (!paperId) return;
    setStep1Text("");
    setStep1Data(null);
    setStep1Cards([]);
    setStep1Done(false);
    setStatusText("正在生成结构化内容...");
    sendAction("analyze_step1");
  };

  const handleSendChat = (question: string, mode: AnswerMode) => {
    if (!paperId) return;
    const safeConversationId =
      activeConversationId && persistedConversations.some((conv) => conv.id === activeConversationId)
        ? activeConversationId
        : null;
    setChatMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: question },
      { id: `assistant-${Date.now() + 1}`, role: "assistant", content: "", streaming: true },
    ]);
    setChatPending(true);
    setStatusText("正在生成追问回答...");
    sendAction("paper_chat", {
      question,
      answer_mode: mode,
      user_id: currentUser?.id,
      conversation_id: safeConversationId,
    });
  };

  useEffect(() => {
    if (!currentUser || chatPending) return;
    fetchPersistedConversations(currentUser.id);
    if (activeConversationId) {
      fetchConversationMessages(currentUser.id, activeConversationId);
    }
  }, [chatMessages.length, chatPending, currentUser, activeConversationId]);

  return (
    <div className={`pb-32 transition-all duration-300 ${historyCollapsed ? "lg:pl-20" : "lg:pl-[22rem]"}`}>
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
                  <PaperShowCard key={paper.id} paper={paper} />
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

      {paperId || activeConversationId || chatMessages.length > 0 ? (
        <PaperChatDock
          messages={chatMessages}
          hasPaper={Boolean(paperId)}
          connected={connected}
          sending={chatPending}
          showInput={step1Done}
          onSend={handleSendChat}
        />
      ) : null}

      <aside
        className={`fixed left-4 top-24 z-30 hidden h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur md:flex md:flex-col ${
          historyCollapsed ? "w-[72px]" : "w-80"
        } transition-all duration-300`}
      >
        <div
          className={`flex border-b border-slate-200 ${
            historyCollapsed ? "items-center justify-center px-2 py-2.5" : "items-center justify-between px-3 py-2"
          }`}
        >
          {!historyCollapsed ? <h3 className="text-sm font-semibold text-slate-800">历史对话</h3> : null}
          <button
            type="button"
            onClick={() => setHistoryCollapsed((prev) => !prev)}
            className={`rounded-md font-medium leading-none whitespace-nowrap text-slate-600 hover:bg-slate-100 ${
              historyCollapsed ? "px-3 py-1.5 text-base" : "px-1.5 py-1 text-sm"
            }`}
          >
            {historyCollapsed ? "›" : "收起"}
          </button>
        </div>

        {!historyCollapsed ? (
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveConversationId(null);
                    setPersistedHistory([]);
                    setChatMessages([]);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + 新建对话
                </button>
                {persistedConversations.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    暂无历史会话。发送第一条追问后会自动创建会话。
                  </p>
                ) : (
                  persistedConversations.map((conv) => (
                    <button
                      key={`conv-${conv.id}`}
                      type="button"
                      onClick={() => {
                        openConversation(conv.id);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left ${
                        activeConversationId === conv.id
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-slate-50 hover:bg-white"
                      }`}
                    >
                      <p className="line-clamp-1 text-xs font-semibold text-slate-800">{conv.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{formatServerTime(conv.updated_at)}</p>
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                {historyMessages.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    暂无历史对话。登录后可永久保存并跨次查看历史会话。
                  </p>
                ) : (
                  historyMessages.map((msg, idx) => (
                    <article key={`${msg.id}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="mb-1 text-[11px] font-medium text-slate-500">{msg.role === "user" ? "用户" : "助手"}</p>
                      <p className="line-clamp-4 text-xs leading-5 text-slate-700">{msg.content}</p>
                    </article>
                  ))
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-2 text-[15px] font-semibold tracking-[0.02em] text-slate-500 [writing-mode:vertical-rl]">
            历史对话
          </div>
        )}
      </aside>
    </div>
  );
};
const App = () => {
  const AUTH_STORAGE_KEY = "peragent_auth_user_v1";
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [authPhone, setAuthPhone] = useState("");
  const [authSmsCode, setAuthSmsCode] = useState("");
  const [smsDebugCode, setSmsDebugCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileAvatarEmoji, setProfileAvatarEmoji] = useState("👤");
  const [profileTopics, setProfileTopics] = useState<string[]>([]);
  const [profileKeywords, setProfileKeywords] = useState("");
  const [profileStats, setProfileStats] = useState<{ conversation_count: number; message_count: number; last_chat_at: string | null }>({
    conversation_count: 0,
    message_count: 0,
    last_chat_at: null,
  });

  const CurrentView = useMemo(() => {
    if (activeView === "search") return <SearchPage currentUser={currentUser} />;
    if (activeView === "recommend") return <RecommendPage />;
    if (activeView === "polish") return <PolishPage />;
    return <HomePage currentUser={currentUser} />;
  }, [activeView, currentUser]);

  const openAuth = () => {
    setAuthOpen(true);
    setAuthError("");
    setSmsCooldown(0);
  };

  useEffect(() => {
    if (smsCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setSmsCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCooldown]);

  const normalizePhone = (raw: string) => {
    const s = raw.replace(/\s+/g, "").replace(/-/g, "");
    if (s.startsWith("+86")) return s.slice(3);
    if (s.startsWith("86") && s.length === 13) return s.slice(2);
    return s;
  };

  const fetchUserProfile = async (userId: number) => {
    const resp = await fetch(`${getApiBaseUrl()}/api/auth/me?user_id=${userId}`);
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { detail?: string };
      throw new Error(err.detail || "读取用户资料失败");
    }
    const data = (await resp.json()) as AuthMeResponse;
    if (!data.user) throw new Error("用户资料为空");
    setCurrentUser(data.user);
    setProfileDisplayName(data.user.display_name || data.user.username);
    setProfileBio(data.user.bio || "");
    setProfileAvatarEmoji(data.user.avatar_emoji || "👤");
    setProfileTopics(Array.isArray(data.preference?.research_topics) ? data.preference.research_topics : []);
    setProfileKeywords(data.preference?.recent_keywords || "");
    setProfileStats({
      conversation_count: data.stats?.conversation_count ?? 0,
      message_count: data.stats?.message_count ?? 0,
      last_chat_at: data.stats?.last_chat_at ?? null,
    });
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as AuthUser;
      if (!cached?.id) return;
      fetchUserProfile(cached.id).catch(() => {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setCurrentUser(null);
      });
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [currentUser]);

  const handleSendSmsCode = async () => {
    const phone = normalizePhone(authPhone);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setAuthError("手机号格式不正确，仅支持中国大陆手机号");
      return;
    }
    if (smsCooldown > 0) return;
    setAuthPending(true);
    setAuthError("");
    setSmsDebugCode("");
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/auth/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await resp.json()) as { detail?: string; cooldown_seconds?: number; debug_code?: string };
      if (!resp.ok) throw new Error(data.detail || "发送验证码失败");
      setSmsCooldown(data.cooldown_seconds ?? 60);
      if (data.debug_code) {
        setSmsDebugCode(data.debug_code);
        setAuthSmsCode(data.debug_code);
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "发送验证码失败");
    } finally {
      setAuthPending(false);
    }
  };

  const handleVerifySmsLogin = async () => {
    const phone = normalizePhone(authPhone);
    const code = authSmsCode.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setAuthError("手机号格式不正确，仅支持中国大陆手机号");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setAuthError("请输入 6 位数字验证码");
      return;
    }
    setAuthPending(true);
    setAuthError("");
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/auth/sms/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = (await resp.json()) as Partial<AuthResponse> & { detail?: string };
      if (!resp.ok || !data.user) {
        throw new Error(data.detail || "验证码登录失败");
      }
      setCurrentUser(data.user);
      await fetchUserProfile(data.user.id);
      setAuthOpen(false);
      setAuthSmsCode("");
      setAuthError("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "验证码登录失败");
    } finally {
      setAuthPending(false);
    }
  };

  const openProfile = () => {
    if (!currentUser) {
      openAuth();
      return;
    }
    setProfileMsg("");
    fetchUserProfile(currentUser.id).catch((e) => {
      setProfileMsg(e instanceof Error ? e.message : "读取资料失败");
    });
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    setProfilePending(true);
    setProfileMsg("");
    try {
      const resp = await fetch(`${getApiBaseUrl()}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.id,
          display_name: profileDisplayName,
          bio: profileBio,
          avatar_emoji: profileAvatarEmoji,
        }),
      });
      const data = (await resp.json()) as Partial<AuthResponse> & { detail?: string };
      if (!resp.ok || !data.user) {
        throw new Error(data.detail || "保存资料失败");
      }
      setCurrentUser(data.user);
      setProfileMsg("个人信息已保存");
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : "保存资料失败");
    } finally {
      setProfilePending(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setProfileOpen(false);
    setProfileMsg("");
    setProfileTopics([]);
    setProfileKeywords("");
    setProfileStats({ conversation_count: 0, message_count: 0, last_chat_at: null });
  };

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
              title="个人中心"
              aria-label="个人中心入口"
              onClick={openProfile}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {currentUser ? currentUser.avatar_emoji || currentUser.username.slice(0, 1).toUpperCase() : "登录"}
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

      {authOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">手机号登录 / 注册</h3>
                <p className="mt-1 text-xs text-slate-500">首次使用将自动创建账号，后续用同一手机号直接登录。</p>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                关闭
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">手机号（+86）</span>
                <input
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  placeholder="请输入 11 位手机号"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={authSmsCode}
                  onChange={(e) => setAuthSmsCode(e.target.value)}
                  placeholder="请输入 6 位验证码"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={handleSendSmsCode}
                  disabled={authPending || smsCooldown > 0}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {smsCooldown > 0 ? `${smsCooldown}s` : "获取验证码"}
                </button>
              </div>
              {authError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{authError}</div>
              ) : null}
              {smsDebugCode ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  联调验证码：{smsDebugCode}
                </div>
              ) : null}
              <button
                type="button"
                onClick={handleVerifySmsLogin}
                disabled={authPending}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {authPending ? "处理中..." : "登录 / 注册"}
              </button>
              <p className="text-center text-[11px] text-slate-500">
                仅支持中国大陆手机号。验证码 5 分钟内有效，首次验证会自动注册。
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen && currentUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">个人信息</h3>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                关闭
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                <label className="text-xs text-slate-600">头像</label>
                <input
                  value={profileAvatarEmoji}
                  onChange={(e) => setProfileAvatarEmoji(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                <label className="text-xs text-slate-600">用户名</label>
                <p className="text-sm text-slate-700">{currentUser.username}</p>
              </div>
              <div className="grid grid-cols-[84px_1fr] items-center gap-2">
                <label className="text-xs text-slate-600">显示名</label>
                <input
                  value={profileDisplayName}
                  onChange={(e) => setProfileDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-[84px_1fr] items-start gap-2">
                <label className="pt-2 text-xs text-slate-600">简介</label>
                <textarea
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-700">用户痕迹</p>
                <p className="mt-1 text-xs text-slate-600">研究方向：{profileTopics.length ? profileTopics.join("、") : "暂无"}</p>
                <p className="mt-1 text-xs text-slate-600">近期关键词：{profileKeywords || "暂无"}</p>
                <p className="mt-1 text-xs text-slate-600">历史会话：{profileStats.conversation_count} 个</p>
                <p className="mt-1 text-xs text-slate-600">累计消息：{profileStats.message_count} 条</p>
                <p className="mt-1 text-xs text-slate-600">
                  最近对话：{profileStats.last_chat_at ? formatServerTime(profileStats.last_chat_at) : "暂无"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  最近登录：{currentUser.last_login_at ? formatServerTime(currentUser.last_login_at) : "首次登录"}
                </p>
              </div>
              {profileMsg ? <p className="text-xs text-slate-600">{profileMsg}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={profilePending}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  {profilePending ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default App;





