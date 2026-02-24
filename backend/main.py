from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uuid
import json
import os
import io
import httpx
import asyncio
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus
app = FastAPI(title="Paper Analysis Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 鐠佸墽鐤?ModelScope API Token閿涘牓鐡熼幖銇為崠铏规畱 token閿?
MODELSCOPE_API_TOKEN = "ms-0be979b5-11b5-462c-ab46-afa93062154f"
MODELSCOPE_API_URL = "https://api-inference.modelscope.cn/v1/chat/completions"
# 鐏忔繆鐦担璺ㄦ暏婢舵碍膩閹焦膩閸ㄥ绱欐俊鍌涚亯閺€瀵旈惃鍕樈閿?
MODEL_NAME = "deepseek-ai/DeepSeek-V3.2"  # DeepSeek 閹恒劎鎮婂Ο鈥崇€烽敍鍫濈毈閸愭瑦鐗稿蹇ョ礆

# 缁犫偓閸楁洖鍞寸€涙ê鐡ㄩ崒绱濋悽鐔堕獓閻滅拠閿嬫禌閹硅礋閺佺増宓佹惔鎾村灗缂傛挸鐡?
PAPERS: Dict[str, Dict[str, Any]] = {}

ARXIV_DOMAIN_QUERY: Dict[str, str] = {
  "ai": "cat:cs.AI",
  "systems": "cat:cs.DC OR cat:cs.OS",
  "software": "cat:cs.SE",
  "database": "cat:cs.DB",
  "network": "cat:cs.NI",
  "math_opt": "cat:math.OC",
  "math_stats": "cat:math.ST OR cat:stat.TH",
  "math_ap": "cat:math.AP",
  "math_pr": "cat:math.PR",
  "math_nt": "cat:math.NT",
  "phys_hep": "cat:hep-th",
  "phys_cond": "cat:cond-mat.mtrl-sci OR cat:cond-mat.stat-mech",
  "phys_quant": "cat:quant-ph",
  "phys_astro": "cat:astro-ph.GA",
  "phys_plasma": "cat:physics.plasm-ph",
  "bio_genomics": "cat:q-bio.GN",
  "bio_neurons": "cat:q-bio.NC",
  "bio_bm": "cat:q-bio.BM",
  "bio_pe": "cat:q-bio.PE",
  "bio_qm": "cat:q-bio.QM",
  "econ_theory": "cat:econ.TH",
  "econ_em": "cat:econ.EM",
  "econ_gn": "cat:econ.GN",
  "econ_fin": "cat:q-fin.EC",
  "econ_trade": "cat:q-fin.GN",
  "med_imaging": "cat:eess.IV OR cat:cs.CV",
  "med_bioinfo": "cat:q-bio.BM OR cat:q-bio.GN",
  "med_neuro": "cat:q-bio.NC",
  "med_genomics": "cat:q-bio.GN",
  "med_public": "cat:q-bio.PE",
  "chem_physical": "cat:physics.chem-ph",
  "chem_theory": "cat:physics.chem-ph OR cat:cond-mat.stat-mech",
  "chem_materials": "cat:cond-mat.mtrl-sci",
  "chem_comp": "cat:physics.comp-ph",
  "chem_spectro": "cat:physics.atom-ph",
  "mat_condensed": "cat:cond-mat.str-el",
  "mat_soft": "cat:cond-mat.soft",
  "mat_mtrl": "cat:cond-mat.mtrl-sci",
  "mat_polymer": "cat:cond-mat.soft",
  "mat_nano": "cat:cond-mat.mes-hall",
  "earth_geophysics": "cat:physics.geo-ph",
  "earth_climate": "cat:physics.ao-ph",
  "earth_atmos": "cat:physics.ao-ph",
  "earth_planet": "cat:astro-ph.EP",
  "earth_ocean": "cat:physics.ao-ph",
  "social_econ": "cat:econ.GN OR cat:econ.EM",
  "social_stats": "cat:stat.AP",
  "social_network": "cat:cs.SI",
  "social_policy": "cat:econ.GN",
  "social_behavior": "cat:q-bio.PE OR cat:cs.CY",
}

ARXIV_DOMAIN_VENUE: Dict[str, str] = {
  "ai": "AI",
  "systems": "SYSTEMS",
  "software": "SE",
  "database": "DB",
  "network": "NET",
  "math_opt": "MATH-OC",
  "math_stats": "MATH-ST",
  "math_ap": "MATH-AP",
  "math_pr": "MATH-PR",
  "math_nt": "MATH-NT",
  "phys_hep": "HEP-TH",
  "phys_cond": "COND-MAT",
  "phys_quant": "QUANT-PH",
  "phys_astro": "ASTRO-PH",
  "phys_plasma": "PLASMA",
  "bio_genomics": "QBIO-GN",
  "bio_neurons": "QBIO-NC",
  "bio_bm": "QBIO-BM",
  "bio_pe": "QBIO-PE",
  "bio_qm": "QBIO-QM",
  "econ_theory": "ECON-TH",
  "econ_em": "ECON-EM",
  "econ_gn": "ECON-GN",
  "econ_fin": "QFIN-EC",
  "econ_trade": "QFIN-GN",
  "med_imaging": "MED-IMG",
  "med_bioinfo": "MED-BIO",
  "med_neuro": "MED-NEURO",
  "med_genomics": "MED-GENO",
  "med_public": "MED-PUBLIC",
  "chem_physical": "CHEM-PH",
  "chem_theory": "CHEM-TH",
  "chem_materials": "CHEM-MTRL",
  "chem_comp": "CHEM-COMP",
  "chem_spectro": "CHEM-SPEC",
  "mat_condensed": "MAT-COND",
  "mat_soft": "MAT-SOFT",
  "mat_mtrl": "MAT-SCI",
  "mat_polymer": "MAT-POLY",
  "mat_nano": "MAT-NANO",
  "earth_geophysics": "EARTH-GEO",
  "earth_climate": "EARTH-CLIMATE",
  "earth_atmos": "EARTH-ATM",
  "earth_planet": "EARTH-PLANET",
  "earth_ocean": "EARTH-OCEAN",
  "social_econ": "SOC-ECON",
  "social_stats": "SOC-STAT",
  "social_network": "SOC-NET",
  "social_policy": "SOC-POLICY",
  "social_behavior": "SOC-BEHAV",
}

ARXIV_API_BASES = [
  # Primary
  "https://export.arxiv.org",
  # Mirror/fallback
  "https://arxiv.org",
  "http://export.arxiv.org",
  "http://arxiv.org",
]


def _split_keywords(raw: str) -> list[str]:
  if not raw:
      return []
  items = re.split(r"[,;，；、/]\s*|\s{2,}", raw)
  cleaned: list[str] = []
  for item in items:
      token = item.strip().strip(".。；,;")
      if not token:
          continue
      if len(token) < 2 or len(token) > 48:
          continue
      cleaned.append(token)
  # de-duplicate while keeping order
  dedup = list(dict.fromkeys(cleaned))
  return dedup[:10]


def _extract_keywords_from_text(text: str) -> list[str]:
  head = (text or "")[:12000]
  patterns = [
      r"(?im)^\s*(?:keywords?|index terms?)\s*[:：]\s*(.+)$",
      r"(?im)^\s*关键词\s*[:：]\s*(.+)$",
  ]
  for pattern in patterns:
      m = re.search(pattern, head)
      if not m:
          continue
      kws = _split_keywords(m.group(1))
      if kws:
          return kws
  return []


def _extract_year_from_text(text: str) -> str:
  head = (text or "")[:15000]
  candidates = re.findall(r"\b(19\d{2}|20\d{2})\b", head)
  for y in candidates:
      year = int(y)
      if 1900 <= year <= 2100:
          return str(year)
  return ""


def _extract_authors_from_text(text: str) -> str:
  lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
  if not lines:
      return ""
  # Heuristic: in the first few lines, pick a likely author line.
  for line in lines[:14]:
      lowered = line.lower()
      if any(k in lowered for k in ["abstract", "摘要", "keywords", "关键词", "introduction", "doi", "arxiv"]):
          continue
      if re.search(r"\d", line):
          continue
      if len(line) < 4 or len(line) > 120:
          continue
      # Typical separators for author lists.
      if any(sep in line for sep in [",", "，", " and ", "、"]):
          return line
  return ""


def extract_basic_meta(raw_bytes: bytes, extracted_text: str, filename: str) -> Dict[str, Any]:
  meta: Dict[str, Any] = {
      "authors": "待识别",
      "impact_factor": "待识别",
      "publish_year": "待识别",
      "keywords": [],
  }

  try:
      from pypdf import PdfReader  # type: ignore

      reader = PdfReader(io.BytesIO(raw_bytes))
      info = reader.metadata or {}
      author = str(info.get("/Author", "")).strip()
      if author:
          meta["authors"] = author
      creation = str(info.get("/CreationDate", "")).strip()
      y = re.search(r"(19\d{2}|20\d{2})", creation)
      if y:
          meta["publish_year"] = y.group(1)
  except Exception:
      pass

  kws = _extract_keywords_from_text(extracted_text)
  if kws:
      meta["keywords"] = kws

  if meta["authors"] == "待识别":
      guessed_authors = _extract_authors_from_text(extracted_text)
      if guessed_authors:
          meta["authors"] = guessed_authors

  if meta["publish_year"] == "待识别":
      guessed_year = _extract_year_from_text(extracted_text)
      if guessed_year:
          meta["publish_year"] = guessed_year

  return meta


def normalize_paper_meta(meta: Dict[str, Any] | None) -> Dict[str, Any]:
  data = meta if isinstance(meta, dict) else {}

  authors = str(data.get("authors", "")).strip() or "待识别"
  impact_factor = str(data.get("impact_factor", "")).strip() or "待识别"
  publish_year = str(data.get("publish_year", "")).strip() or "待识别"

  keywords = data.get("keywords", [])
  if isinstance(keywords, str):
      keywords = _split_keywords(keywords)
  elif isinstance(keywords, list):
      keywords = [str(k).strip() for k in keywords if str(k).strip()]
  else:
      keywords = []

  keywords = list(dict.fromkeys(keywords))[:10]
  if not keywords:
      keywords = ["待识别"]

  return {
      "authors": authors,
      "impact_factor": impact_factor,
      "publish_year": publish_year,
      "keywords": keywords,
  }


def _safe_text(elem: ET.Element | None) -> str:
  if elem is None or elem.text is None:
      return ""
  return elem.text.strip()


def build_brief_sentences(title: str, summary: str, tags: list[str]) -> list[str]:
  clean_summary = re.sub(r"\s+", " ", summary or "").strip()
  parts = [p.strip() for p in re.split(r"[.!?]", clean_summary) if p.strip()]
  first = parts[0] if parts else ""
  second = parts[1] if len(parts) > 1 else ""
  tag_text = "、".join(tags[:3]) if tags else "相关主题"

  brief: list[str] = [f"论文主题：{title[:72]}。"]
  if first:
      brief.append(f"核心内容：{first[:120]}。")
  if second:
      brief.append(f"补充说明：{second[:120]}。")
  brief.append(f"关键词：{tag_text}。")
  return brief[:3]


def build_tag_relations(tags: list[str], domain: str) -> list[Dict[str, str]]:
  uniq = list(dict.fromkeys(tags))[:4]
  if not uniq:
      return [{"from": domain, "to": "topic", "type": "domain-topic"}]
  rel: list[Dict[str, str]] = []
  if len(uniq) >= 2:
      rel.append({"from": uniq[0], "to": uniq[1], "type": "method-support"})
  if len(uniq) >= 3:
      rel.append({"from": uniq[1], "to": uniq[2], "type": "evidence-validation"})
  rel.append({"from": domain, "to": uniq[0], "type": "domain-topic"})
  return rel[:3]


def parse_arxiv_feed(xml_text: str, domain: str) -> list[Dict[str, Any]]:
  root = ET.fromstring(xml_text)
  ns = {"atom": "http://www.w3.org/2005/Atom"}
  entries = root.findall("atom:entry", ns)
  venue = ARXIV_DOMAIN_VENUE.get(domain, domain.upper())

  items: list[Dict[str, Any]] = []
  for idx, entry in enumerate(entries):
      title = _safe_text(entry.find("atom:title", ns)).replace("\n", " ")
      summary = _safe_text(entry.find("atom:summary", ns)).replace("\n", " ")
      published = _safe_text(entry.find("atom:published", ns))
      if published:
          published = published[:10]

      abs_url = _safe_text(entry.find("atom:id", ns))
      pdf_url = ""
      for link in entry.findall("atom:link", ns):
          if link.attrib.get("title") == "pdf":
              pdf_url = link.attrib.get("href", "").strip()
              break
      if not pdf_url and abs_url:
          pdf_url = abs_url.replace("/abs/", "/pdf/") + ".pdf"

      tags = []
      for cat in entry.findall("atom:category", ns):
          term = cat.attrib.get("term", "").strip()
          if term:
              tags.append(term)
      tags = list(dict.fromkeys(tags))[:6]

      paper_id = f"{venue}-{str(idx + 1).zfill(2)}"
      items.append(
          {
              "id": paper_id,
              "domain": domain,
              "title": title,
              "summary": summary,
              "tags": tags,
              "relations": build_tag_relations(tags, domain),
              "brief": build_brief_sentences(title, summary, tags),
              "venue": venue,
              "publishedAt": published or "鏈煡鏃ユ湡",
              "pdfUrl": pdf_url,
          }
      )
  return items


@app.get("/api/recommendations")
async def get_recommendations(
  domain: str = Query("ai"),
  limit: int = Query(10, ge=1, le=20),
) -> Dict[str, Any]:
  domain_key = domain.strip().lower()
  if domain_key not in ARXIV_DOMAIN_QUERY:
      domain_key = "ai"
  query = quote_plus(ARXIV_DOMAIN_QUERY[domain_key])

  api_path = (
      "/api/query"
      f"?search_query={query}"
      "&sortBy=submittedDate&sortOrder=descending"
      f"&max_results={limit}"
  )

  last_error = "unknown"
  tried_sources: list[str] = []
  for base in ARXIV_API_BASES:
      url = f"{base}{api_path}"
      tried_sources.append(base)
      try:
          async with httpx.AsyncClient(timeout=20, trust_env=False, follow_redirects=True) as client:
              resp = await client.get(url)
          if resp.status_code != 200:
              last_error = f"{base}:http_{resp.status_code}"
              continue
          items = parse_arxiv_feed(resp.text, domain_key)
          if not items:
              last_error = f"{base}:parse_empty"
              continue
          return {
              "domain": domain_key,
              "items": items,
              "source": base,
              "tried_sources": tried_sources,
          }
      except Exception as e:
          last_error = f"{base}:{str(e)[:80]}"
          continue

  return {
      "domain": domain_key,
      "items": [],
      "source": "none",
      "tried_sources": tried_sources,
      "error": f"all_sources_failed:{last_error}",
  }


def extract_pdf_text(raw_bytes: bytes) -> str:
  """Best-effort PDF text extraction from uploaded bytes."""
  # Try pypdf first.
  try:
      from pypdf import PdfReader  # type: ignore

      reader = PdfReader(io.BytesIO(raw_bytes))
      parts = []
      for page in reader.pages:
          text = page.extract_text() or ""
          if text.strip():
              parts.append(text)
      merged = "\n".join(parts).strip()
      if merged:
          return merged
  except Exception:
      pass

  # Fallback to PyPDF2.
  try:
      from PyPDF2 import PdfReader as LegacyPdfReader  # type: ignore

      reader = LegacyPdfReader(io.BytesIO(raw_bytes))
      parts = []
      for page in reader.pages:
          text = page.extract_text() or ""
          if text.strip():
              parts.append(text)
      merged = "\n".join(parts).strip()
      if merged:
          return merged
  except Exception:
      pass

  # Fallback to PyMuPDF.
  try:
      import fitz  # type: ignore

      doc = fitz.open(stream=raw_bytes, filetype="pdf")
      parts = []
      for page in doc:
          text = page.get_text("text") or ""
          if text.strip():
              parts.append(text)
      merged = "\n".join(parts).strip()
      if merged:
          return merged
  except Exception:
      pass

  return ""

STEP1_PROMPT_TEMPLATE = """
Role: 浣犳槸涓€鍚嶉珮绾у鏈爺绌跺垎鏋愬姪鎵嬶紝鎿呴暱绉戝璁烘枃鐨勮璇嗚鍒嗘瀽涓庣粨鏋勫寲鎷嗚В銆?
Tone: 瀹㈣銆佷弗璋ㄣ€佺簿纭€佸鏈寲銆?

[Instruction]: 瀵逛笂浼犺鏂囪繘琛屽垎灞傜粨鏋勫寲鍒嗘瀽銆?
[Input Text]: {input_text}

[Requirements]:
1. 灏嗗唴瀹规媶瑙ｄ负鈥滈棶棰?鏂规硶-瀹為獙鈥濇爲鐘剁粨鏋勩€?
2. 璇嗗埆璁烘枃鑱氱劍鐨勨€滅爺绌剁己鍙ｂ€濄€?
3. 鎻愮偧鈥滄柟娉曟鏋垛€濓紝涓嶈杩囧害绠€鍖栨妧鏈湳璇€?
4. 涓ユ牸鎸?JSON 缁撴瀯杈撳嚭锛屼究浜庡墠绔覆鏌撱€?
5. 鍏ㄩ儴瀛楁鍊煎繀椤讳娇鐢ㄤ腑鏂囪〃杈撅紙鍖呮嫭鏍囬銆佽妭鐐规爣绛俱€佹楠ゅ悕绉般€佹楠よ鏄庯級銆?
6. 绂佹鍙ｈ鍖栬〃杩帮紱鍙娇鐢ㄢ€滆璇嗚銆佽寖寮忋€侀噺鍖栨寚鏍団€濈瓑瀛︽湳鏈銆?

[Output Format]:
{output_schema}
"""

STEP1_OUTPUT_SCHEMA = """{
  "title": "...",
  "paper_meta": {
    "authors": "...",
    "impact_factor": "...",
    "publish_year": "...",
    "keywords": ["..."]
  },
  "research_gap": "...",
  "core_methodology": "...",
  "framework_map": {
    "nodes": [
      {"id": "n1", "label": "鐮旂┒闂", "kind": "problem"},
      {"id": "n2", "label": "鏂规硶璁捐", "kind": "method"},
      {"id": "n3", "label": "瀹為獙渚濇嵁", "kind": "evidence"}
    ],
    "links": [
      {"from": "n1", "to": "n2", "label": "椹卞姩"},
      {"from": "n2", "to": "n3", "label": "鐢?..楠岃瘉"}
    ]
  },
  "flow_chart": {
    "title": "鏂规硶娴佺▼",
    "steps": [
      {"name": "闂瀹氫箟", "detail": "..."},
      {"name": "鏁版嵁/鐭ヨ瘑鍑嗗", "detail": "..."},
      {"name": "寤烘ā涓庝紭鍖?, "detail": "..."},
      {"name": "璇勪及涓庡垎鏋?, "detail": "..."}
    ]
  },
  "structural_tree": {
    "problem_definition": ["..."],
    "technical_approach": ["..."],
    "empirical_evidence": ["..."]
  }
}"""


@app.post("/api/paper/upload")
async def upload_paper(request: Request) -> Dict[str, str]:
  """Internal helper."""

  # TODO:
  # - improve PDF extraction robustness (pdfminer/pymupdf fallback)
  # - persist parsed paper context instead of in-memory only
  #
  paper_id = str(uuid.uuid4())
  raw_bytes = await request.body()

  filename = request.headers.get("x-filename", "uploaded.pdf")
  extracted_text = extract_pdf_text(raw_bytes)
  if not extracted_text.strip():
      extracted_text = f"Uploaded file: {filename}. Content length: {len(raw_bytes)} bytes."

  PAPERS[paper_id] = {
      "filename": filename,
      "text": extracted_text[:300000],
      "meta": extract_basic_meta(raw_bytes, extracted_text, filename),
      "raw_size": len(raw_bytes),
      "step1_result": None,
      "chat_history": [],
  }
  return {"paper_id": paper_id}


@app.websocket("/ws/paper/{paper_id}")
async def paper_stream(ws: WebSocket, paper_id: str) -> None:
  """Internal helper."""
  await ws.accept()
  try:
      while True:
          msg = await ws.receive_json()
          action = msg.get("action")

          if action == "analyze_step1":
              try:
                  await run_step1_with_qwen(ws, paper_id)
              except Exception as e:
                  await ws.send_json(
                      {
                          "type": "status_change",
                          "msg": f"后端分析过程出错：{str(e)}",
                      }
                  )
          # 妫板嫮鏆€閸忔湹绮梼鑸甸敍?
          elif action == "paper_chat":
              try:
                  question = str(msg.get("question", "")).strip()
                  await run_paper_chat(ws, paper_id, question)
              except Exception as e:
                  await ws.send_json(
                      {
                          "type": "status_change",
                          "msg": f"追问处理失败：{str(e)}",
                      }
                  )
          # elif action == "reading_path":
          #     await run_step2_with_qwen(ws, paper_id)
          # elif action == "presentation":
          #     await run_step3_with_qwen(ws, paper_id)
  except WebSocketDisconnect:
      return


async def run_step1_with_qwen(ws: WebSocket, paper_id: str) -> None:
  """Step 1: run structured analysis and stream incremental output to frontend."""
  paper = PAPERS.get(paper_id)
  if not paper:
      await ws.send_json({"type": "status_change", "msg": "未找到论文，请先上传。"})
      return

  input_text = paper["text"][:20000]  # limit context
  prompt = STEP1_PROMPT_TEMPLATE.format(
      input_text=input_text,
      output_schema=STEP1_OUTPUT_SCHEMA,
  )

  await ws.send_json(
      {"type": "status_change", "msg": "正在调用 ModelScope 执行结构化分析..."}
  )

  # 閹?ModelScope Chat Completions 閹恒儱褰涢弽鐓庣础閺嬪嫰鈧姾濮?
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {
              "role": "system",
              "content": "你是论文研究分析助手，请仅使用中文返回结构化分析结果。",
          },
          {
              "role": "user",
              "content": prompt,
          },
      ],
      "stream": True,
      "temperature": 0.1,
  }

  # 鐏忔繆鐦径姘遍崣鍏橀惃鍕拠浣规煙瀵?
  headers_list = [
      {
          "Authorization": f"Bearer {MODELSCOPE_API_TOKEN}",
          "Content-Type": "application/json",
      },
      {
          "Authorization": f"Bearer {MODELSCOPE_API_TOKEN}",
          "Content-Type": "application/json",
          "X-DashScope-SDK": "modelscope",
      },
      {
          "Authorization": f"token {MODELSCOPE_API_TOKEN}",
          "Content-Type": "application/json",
      },
  ]
  
  full_text = ""
  last_error = None
  last_status = None
  streamed = False

  for headers in headers_list:
      try:
          async with httpx.AsyncClient(timeout=35, trust_env=False) as client:
              async with client.stream(
                  "POST",
                  MODELSCOPE_API_URL,
                  headers=headers,
                  json=payload,
              ) as resp:
                  last_status = resp.status_code
                  if resp.status_code == 401:
                      last_error = f"Auth failed with headers: {headers.get('Authorization', '')[:20]}..."
                      continue
                  if resp.status_code != 200:
                      raw = await resp.aread()
                      last_error = raw.decode("utf-8", errors="ignore")[:500]
                      break

                  async for line in resp.aiter_lines():
                      line = (line or "").strip()
                      if not line:
                          continue
                      if line.startswith("data:"):
                          line = line[5:].strip()
                      if line == "[DONE]":
                          break
                      try:
                          payload_obj = json.loads(line)
                      except json.JSONDecodeError:
                          continue

                      chunk = extract_stream_chunk(payload_obj)
                      if not chunk:
                          continue
                      streamed = True
                      full_text += chunk
                      await ws.send_json({"type": "step1_stream", "content": chunk})
                      await asyncio.sleep(0.01)

                  if streamed:
                      break

      except httpx.HTTPError as e:
          last_error = str(e)
          continue

  if not streamed:
      # Fallback: if streaming fails, retry once with non-stream mode and chunk it to frontend.
      fallback_payload = dict(payload)
      fallback_payload["stream"] = False
      resp = None
      for headers in headers_list:
          try:
              async with httpx.AsyncClient(timeout=35, trust_env=False) as client:
                  resp = await client.post(
                      MODELSCOPE_API_URL,
                      headers=headers,
                      json=fallback_payload,
                  )
                  if resp.status_code == 200:
                      break
                  if resp.status_code == 401:
                      last_error = f"Auth failed with headers: {headers.get('Authorization', '')[:20]}..."
                      continue
                  break
          except httpx.HTTPError as e:
              last_error = str(e)
              continue

      if resp is None:
          await ws.send_json(
              {
                  "type": "status_change",
                  "msg": f"ModelScope 请求失败（未收到响应）：{last_error or '未知错误'}",
              }
          )
          return

      if resp.status_code != 200:
          error_detail = resp.text[:500]
          try:
              error_json = resp.json()
              error_detail = json.dumps(error_json, ensure_ascii=False, indent=2)
          except Exception:
              pass
          await ws.send_json(
              {
                  "type": "status_change",
                  "msg": f"ModelScope 接口错误 {resp.status_code}: {error_detail}",
              }
          )
          return

      data = resp.json()
      content = extract_nonstream_content(data)
      if not content:
          await ws.send_json(
              {
                  "type": "status_change",
                  "msg": "ModelScope 返回格式异常。",
              }
          )
          return

      chunk_size = 40
      for i in range(0, len(content), chunk_size):
          chunk = content[i : i + chunk_size]
          full_text += chunk
          await ws.send_json({"type": "step1_stream", "content": chunk})
          await asyncio.sleep(0.015)

  if not full_text.strip():
      await ws.send_json(
          {
              "type": "status_change",
              "msg": f"ModelScope 返回空内容。status={last_status or 'unknown'} error={last_error or 'n/a'}",
          }
      )
      return

  result = safe_extract_json(full_text)
  normalized = normalize_step1_result(result)
  if should_localize_to_chinese(normalized):
      await ws.send_json({"type": "status_change", "msg": "检测到非中文内容，正在自动转为中文..."})
      localized = await localize_result_to_chinese(normalized)
      if localized:
          normalized = normalize_step1_result(localized)

  base_meta = normalize_paper_meta(paper.get("meta"))
  model_meta = normalize_paper_meta(normalized.get("paper_meta"))
  merged_meta = dict(base_meta)
  if model_meta.get("authors") != "待识别":
      merged_meta["authors"] = model_meta["authors"]
  if model_meta.get("impact_factor") != "待识别":
      merged_meta["impact_factor"] = model_meta["impact_factor"]
  if model_meta.get("publish_year") != "待识别":
      merged_meta["publish_year"] = model_meta["publish_year"]
  if model_meta.get("keywords") and model_meta["keywords"] != ["待识别"]:
      merged_meta["keywords"] = model_meta["keywords"]
  normalized["paper_meta"] = merged_meta

  if paper_id in PAPERS:
      PAPERS[paper_id]["step1_result"] = normalized
  for card in build_step1_cards(normalized):
      await ws.send_json({"type": "step1_card", "card": card})
      await asyncio.sleep(0.06)
  await ws.send_json({"type": "step1_done", "data": normalized})


async def run_paper_chat(ws: WebSocket, paper_id: str, question: str) -> None:
  """Answer follow-up questions for the current paper via streaming."""
  await ws.send_json({"type": "status_change", "msg": "姝ｅ湪鐢熸垚杩介棶鍥炵瓟..."})
  paper = PAPERS.get(paper_id)
  if not paper:
      await ws.send_json({"type": "status_change", "msg": "未找到论文上下文，请先上传并完成分析。"})
      await ws.send_json({"type": "chat_done", "answer": ""})
      return
  if not question:
      await ws.send_json({"type": "status_change", "msg": "问题为空，请输入后再发送。"})
      await ws.send_json({"type": "chat_done", "answer": ""})
      return

  step1_result = paper.get("step1_result") or {}
  paper_text = str(paper.get("text", ""))[:12000]
  history = paper.get("chat_history") or []
  if not isinstance(history, list):
      history = []

  messages = [
      {
          "role": "system",
          "content": "你是论文研究助手。请围绕给定论文上下文回答用户追问，使用中文，结构清晰，信息不足时要明确说明。",
      },
      {
          "role": "user",
          "content": (
              "【论文摘要上下文】\n"
              + f"{paper_text}\n\n"
              + "【结构化分析结果】\n"
              + f"{json.dumps(step1_result, ensure_ascii=False)}"
          ),
      },
  ]
  messages.extend(history[-8:])
  messages.append({"role": "user", "content": question})

  payload = {
      "model": MODEL_NAME,
      "messages": messages,
      "stream": True,
      "temperature": 0.2,
  }
  headers_list = [
      {"Authorization": f"Bearer {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"},
      {
          "Authorization": f"Bearer {MODELSCOPE_API_TOKEN}",
          "Content-Type": "application/json",
          "X-DashScope-SDK": "modelscope",
      },
      {"Authorization": f"token {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"},
  ]

  full_text = ""
  streamed = False
  last_error = None

  for headers in headers_list:
      try:
          async with httpx.AsyncClient(timeout=35, trust_env=False) as client:
              async with client.stream("POST", MODELSCOPE_API_URL, headers=headers, json=payload) as resp:
                  if resp.status_code == 401:
                      last_error = "閴存潈澶辫触"
                      continue
                  if resp.status_code != 200:
                      raw = await resp.aread()
                      last_error = raw.decode("utf-8", errors="ignore")[:300]
                      continue

                  async for line in resp.aiter_lines():
                      line = (line or "").strip()
                      if not line:
                          continue
                      if line.startswith("data:"):
                          line = line[5:].strip()
                      if line == "[DONE]":
                          break
                      try:
                          payload_obj = json.loads(line)
                      except json.JSONDecodeError:
                          continue
                      chunk = extract_stream_chunk(payload_obj)
                      if not chunk:
                          continue
                      streamed = True
                      full_text += chunk
                      await ws.send_json({"type": "chat_stream", "content": chunk})
                      await asyncio.sleep(0.01)

                  if streamed:
                      break
      except Exception as e:
          last_error = str(e)
          continue

  if not streamed:
      fallback_payload = dict(payload)
      fallback_payload["stream"] = False
      for headers in headers_list:
          try:
              async with httpx.AsyncClient(timeout=35, trust_env=False) as client:
                  resp = await client.post(MODELSCOPE_API_URL, headers=headers, json=fallback_payload)
                  if resp.status_code != 200:
                      continue
                  content = extract_nonstream_content(resp.json())
                  if not content:
                      continue
                  full_text = content
                  for i in range(0, len(content), 36):
                      chunk = content[i : i + 36]
                      await ws.send_json({"type": "chat_stream", "content": chunk})
                      await asyncio.sleep(0.012)
                  streamed = True
                  break
          except Exception as e:
              last_error = str(e)
              continue

  answer = full_text.strip()
  if not answer:
      answer = "暂时未获取到有效回答，请稍后重试。"
      await ws.send_json({"type": "status_change", "msg": f"追问回答失败：{last_error or '未知错误'}"})
      await ws.send_json({"type": "chat_stream", "content": answer})

  history.append({"role": "user", "content": question})
  history.append({"role": "assistant", "content": answer})
  paper["chat_history"] = history[-20:]
  await ws.send_json({"type": "chat_done", "answer": answer})


def build_step1_cards(result: Dict[str, Any]) -> list[Dict[str, str]]:
  """Build backend-driven cards so frontend can render per-title incrementally."""
  cards: list[Dict[str, str]] = []
  if not isinstance(result, dict):
      return cards

  def push(card_id: str, step: str, icon: str, title: str, content: str) -> None:
      content = (content or "").strip()
      title = (title or "").strip()
      if not title or not content:
          return
      cards.append(
          {
              "id": card_id,
              "step": step,
              "icon": icon,
              "title": title,
              "content": content,
          }
      )

  push("final-title", "STEP_APPEAR", "\U0001F4CC", "论文标题", str(result.get("title", "")))
  push("final-gap", "STEP_EXPAND", "\U0001F9E0", "研究缺口", str(result.get("research_gap", "")))
  push("final-method", "STEP_FOCUS", "\U0001F6E0", "核心方法", str(result.get("core_methodology", "")))

  tree = result.get("structural_tree") or {}
  if isinstance(tree, dict):
      for idx, item in enumerate(tree.get("problem_definition") or []):
          push(f"pd-{idx}", "STEP_APPEAR", "\U0001F9ED", f"问题定义 {idx + 1}", str(item))
      for idx, item in enumerate(tree.get("technical_approach") or []):
          push(f"ta-{idx}", "STEP_EXPAND", "\U0001F527", f"技术路径 {idx + 1}", str(item))
      for idx, item in enumerate(tree.get("empirical_evidence") or []):
          push(f"ee-{idx}", "STEP_FINAL", "\U0001F4CA", f"实证证据 {idx + 1}", str(item))

  return cards


def safe_extract_json(text: str) -> Dict[str, Any]:
  """Internal helper."""
  m = re.search(r"\{[\s\S]*\}", text)
  if not m:
      return {}
  try:
      return json.loads(m.group(0))
  except json.JSONDecodeError:
      return {}


def extract_stream_chunk(payload_obj: Dict[str, Any]) -> str:
  """Internal helper."""
  try:
      choice = payload_obj.get("choices", [])[0]
  except Exception:
      return ""

  delta = choice.get("delta")
  if isinstance(delta, dict):
      content = delta.get("content")
      if isinstance(content, str):
          return content

  message = choice.get("message")
  if isinstance(message, dict):
      content = message.get("content")
      if isinstance(content, str):
          return content

  content = choice.get("text")
  if isinstance(content, str):
      return content

  # Some providers wrap stream delta in payload.output.choices
  output = payload_obj.get("output")
  if isinstance(output, dict):
      try:
          choice = output.get("choices", [])[0]
      except Exception:
          choice = {}
      if isinstance(choice, dict):
          delta = choice.get("delta")
          if isinstance(delta, dict):
              content = delta.get("content")
              if isinstance(content, str):
                  return content
          message = choice.get("message")
          if isinstance(message, dict):
              content = message.get("content")
              if isinstance(content, str):
                  return content
          content = choice.get("text")
          if isinstance(content, str):
              return content

      text = output.get("text")
      if isinstance(text, str):
          return text

  return ""


def extract_nonstream_content(payload_obj: Dict[str, Any]) -> str:
  """Extract non-streaming text content from different gateway response formats."""
  if not isinstance(payload_obj, dict):
      return ""

  # OpenAI-like: {"choices":[{"message":{"content":"..."}}]}
  try:
      c = payload_obj.get("choices", [])[0]
      msg = c.get("message", {})
      content = msg.get("content")
      if isinstance(content, str) and content.strip():
          return content
      if isinstance(content, list):
          joined = "".join(
              p.get("text", "") for p in content if isinstance(p, dict)
          )
          if joined.strip():
              return joined
      txt = c.get("text")
      if isinstance(txt, str) and txt.strip():
          return txt
  except Exception:
      pass

  # Some gateways: {"output":{"choices":[{"message":{"content":"..."}}]}}
  output = payload_obj.get("output")
  if isinstance(output, dict):
      try:
          c = output.get("choices", [])[0]
          msg = c.get("message", {})
          content = msg.get("content")
          if isinstance(content, str) and content.strip():
              return content
          txt = c.get("text")
          if isinstance(txt, str) and txt.strip():
              return txt
      except Exception:
          pass

      # Some models return {"output":{"text":"..."}}
      txt = output.get("text")
      if isinstance(txt, str) and txt.strip():
          return txt

  return ""


def should_localize_to_chinese(result: Dict[str, Any]) -> bool:
  """Check whether structured result still contains mostly non-Chinese text."""
  if not isinstance(result, dict):
      return False

  text_parts = [
      str(result.get("title", "")),
      str(result.get("research_gap", "")),
      str(result.get("core_methodology", "")),
  ]

  structural_tree = result.get("structural_tree") or {}
  if isinstance(structural_tree, dict):
      for key in ("problem_definition", "technical_approach", "empirical_evidence"):
          val = structural_tree.get(key) or []
          if isinstance(val, list):
              text_parts.extend(str(x) for x in val)
          else:
              text_parts.append(str(val))

  flow_chart = result.get("flow_chart") or {}
  if isinstance(flow_chart, dict):
      text_parts.append(str(flow_chart.get("title", "")))
      steps = flow_chart.get("steps") or []
      if isinstance(steps, list):
          for s in steps:
              if isinstance(s, dict):
                  text_parts.append(str(s.get("name", "")))
                  text_parts.append(str(s.get("detail", "")))

  merged = "\n".join(p.strip() for p in text_parts if p and str(p).strip())
  if not merged:
      return False

  chinese_chars = re.findall(r"[\u4e00-\u9fff]", merged)
  latin_chars = re.findall(r"[A-Za-z]", merged)
  if not latin_chars:
      return False
  return len(chinese_chars) < len(latin_chars)


async def localize_result_to_chinese(result: Dict[str, Any]) -> Dict[str, Any]:
  """Translate structured result values to Chinese while preserving JSON schema."""
  translate_prompt = (
      "请将下面 JSON 中所有字符串值翻译为中文，并保持键名与结构不变。"
      "仅返回 JSON，不要输出解释性文字。\n\n"
      f"{json.dumps(result, ensure_ascii=False)}"
  )
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {"role": "system", "content": "你是专业学术翻译助手，请仅返回合法 JSON。"},
          {"role": "user", "content": translate_prompt},
      ],
      "stream": False,
      "temperature": 0.0,
  }
  headers_list = [
      {"Authorization": f"Bearer {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"},
      {
          "Authorization": f"Bearer {MODELSCOPE_API_TOKEN}",
          "Content-Type": "application/json",
          "X-DashScope-SDK": "modelscope",
      },
      {"Authorization": f"token {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"},
  ]

  for headers in headers_list:
      try:
          async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
              resp = await client.post(MODELSCOPE_API_URL, headers=headers, json=payload)
              if resp.status_code != 200:
                  continue
              content = extract_nonstream_content(resp.json())
              parsed = safe_extract_json(content)
              if isinstance(parsed, dict) and parsed:
                  return parsed
      except Exception:
          continue

  return {}


def normalize_step1_result(result: Dict[str, Any]) -> Dict[str, Any]:
  """Internal helper."""
  if not isinstance(result, dict):
      result = {}

  structural_tree = result.get("structural_tree") or {}
  if not isinstance(structural_tree, dict):
      structural_tree = {}

  problem_definition = structural_tree.get("problem_definition") or []
  technical_approach = structural_tree.get("technical_approach") or []
  empirical_evidence = structural_tree.get("empirical_evidence") or []

  if not isinstance(problem_definition, list):
      problem_definition = [str(problem_definition)]
  if not isinstance(technical_approach, list):
      technical_approach = [str(technical_approach)]
  if not isinstance(empirical_evidence, list):
      empirical_evidence = [str(empirical_evidence)]

  framework_map = result.get("framework_map") or {}
  if not isinstance(framework_map, dict):
      framework_map = {}

  nodes = framework_map.get("nodes") or []
  links = framework_map.get("links") or []

  if not isinstance(nodes, list):
      nodes = []
  if not isinstance(links, list):
      links = []

  valid_nodes = []
  for idx, n in enumerate(nodes):
      if not isinstance(n, dict):
          continue
      label = str(n.get("label", "")).strip()
      if not label:
          continue
      node_id = str(n.get("id", f"n{idx + 1}")).strip() or f"n{idx + 1}"
      kind = str(n.get("kind", "")).strip() or "method"
      valid_nodes.append({"id": node_id, "label": label, "kind": kind})

  valid_links = []
  for l in links:
      if not isinstance(l, dict):
          continue
      src = str(l.get("from", "")).strip()
      dst = str(l.get("to", "")).strip()
      if not src or not dst:
          continue
      label = str(l.get("label", "")).strip()
      valid_links.append({"from": src, "to": dst, "label": label})

  if not valid_nodes:
      valid_nodes = [
          {"id": "problem", "label": "鐮旂┒闂", "kind": "problem"},
          {"id": "method", "label": "鏂规硶璁捐", "kind": "method"},
          {"id": "evidence", "label": "瀹為獙楠岃瘉", "kind": "evidence"},
      ]
      if problem_definition:
          valid_nodes[0]["label"] = str(problem_definition[0])[:60]
      if technical_approach:
          valid_nodes[1]["label"] = str(technical_approach[0])[:60]
      if empirical_evidence:
          valid_nodes[2]["label"] = str(empirical_evidence[0])[:60]

  if not valid_links:
      valid_links = [
          {"from": valid_nodes[0]["id"], "to": valid_nodes[1]["id"], "label": "闂椹卞姩鏂规硶"},
          {"from": valid_nodes[1]["id"], "to": valid_nodes[2]["id"], "label": "鏂规硶鑾峰緱璇佹嵁"},
      ]

  flow_chart = result.get("flow_chart") or {}
  if not isinstance(flow_chart, dict):
      flow_chart = {}

  flow_title = str(flow_chart.get("title", "")).strip() or "研究流程图"
  if flow_title.lower() in {"workflow", "flow chart", "flowchart", "method workflow"}:
      flow_title = "研究流程图"

  flow_steps = flow_chart.get("steps") or []
  if not isinstance(flow_steps, list):
      flow_steps = []

  flow_name_map = {
      "problem formulation": "问题定义",
      "data/knowledge preparation": "数据/知识准备",
      "modeling and optimization": "建模与优化",
      "evaluation and analysis": "评估与分析",
      "problem definition": "问题定义",
      "method design": "方法设计",
      "experimental evidence": "实验依据",
  }

  valid_flow_steps = []
  for s in flow_steps:
      if not isinstance(s, dict):
          continue
      name = str(s.get("name", "")).strip()
      if not name:
          continue
      lowered = name.lower()
      if lowered in flow_name_map:
          name = flow_name_map[lowered]
      detail = str(s.get("detail", "")).strip()
      valid_flow_steps.append({"name": name, "detail": detail})

  if not valid_flow_steps:
      fallback_steps = [
          ("问题定义", problem_definition[0] if problem_definition else "识别关键研究问题"),
          ("技术路径", technical_approach[0] if technical_approach else "设计核心方法并实现"),
          ("实验验证", empirical_evidence[0] if empirical_evidence else "在基准数据上完成评估"),
      ]
      valid_flow_steps = [{"name": n, "detail": str(d)[:120]} for n, d in fallback_steps]

  result["structural_tree"] = {
      "problem_definition": [str(x) for x in problem_definition if str(x).strip()],
      "technical_approach": [str(x) for x in technical_approach if str(x).strip()],
      "empirical_evidence": [str(x) for x in empirical_evidence if str(x).strip()],
  }
  result["framework_map"] = {"nodes": valid_nodes, "links": valid_links}
  result["flow_chart"] = {"title": flow_title, "steps": valid_flow_steps}
  result["paper_meta"] = normalize_paper_meta(result.get("paper_meta"))

  return result


if __name__ == "__main__":
  import uvicorn

  # 娴ｈ法鏁?8002 缁斿經閿涘矂浼╅崗宥勭瑢閺堟簚瀹稿弶婀侀張宥呭閸愯尙鐛?
  uvicorn.run(app, host="0.0.0.0", port=8002, reload=False)









