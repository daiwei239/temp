from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uuid
import json
import os
import httpx
import asyncio

app = FastAPI(title="Paper Analysis Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 璁剧疆 ModelScope API Token锛堥瓟鎼ぞ鍖虹殑 token锛?
MODELSCOPE_API_TOKEN = "ms-0be979b5-11b5-462c-ab46-afa93062154f"
MODELSCOPE_API_URL = "https://api-inference.modelscope.cn/v1/chat/completions"
# 灏濊瘯浣跨敤澶氭ā鎬佹ā鍨嬶紙濡傛灉鏀寔鐨勮瘽锛?
MODEL_NAME = "deepseek-ai/DeepSeek-V3.2"  # DeepSeek 鎺ㄧ悊妯″瀷锛堝皬鍐欐牸寮忥級

# 绠€鍗曞唴瀛樺瓨鍌紝鐢熶骇鐜璇锋浛鎹负鏁版嵁搴撴垨缂撳瓨
PAPERS: Dict[str, Dict[str, Any]] = {}

STEP1_PROMPT_TEMPLATE = """
Role: 你是一名高级学术研究分析助手，擅长科学论文的认识论分析与结构化拆解。
Tone: 客观、严谨、精确、学术化。

[Instruction]: 对上传论文进行分层结构化分析。
[Input Text]: {input_text}

[Requirements]:
1. 将内容拆解为“问题-方法-实验”树状结构。
2. 识别论文聚焦的“研究缺口”。
3. 提炼“方法框架”，不要过度简化技术术语。
4. 严格按 JSON 结构输出，便于前端渲染。
5. 全部字段值必须使用中文表达（包括标题、节点标签、步骤名称、步骤说明）。
6. 禁止口语化表述；可使用“认识论、范式、量化指标”等学术术语。

[Output Format]:
{output_schema}
"""

STEP1_OUTPUT_SCHEMA = """{
  "title": "...",
  "research_gap": "...",
  "core_methodology": "...",
  "framework_map": {
    "nodes": [
      {"id": "n1", "label": "研究问题", "kind": "problem"},
      {"id": "n2", "label": "方法设计", "kind": "method"},
      {"id": "n3", "label": "实验依据", "kind": "evidence"}
    ],
    "links": [
      {"from": "n1", "to": "n2", "label": "驱动"},
      {"from": "n2", "to": "n3", "label": "由...验证"}
    ]
  },
  "flow_chart": {
    "title": "方法流程",
    "steps": [
      {"name": "问题定义", "detail": "..."},
      {"name": "数据/知识准备", "detail": "..."},
      {"name": "建模与优化", "detail": "..."},
      {"name": "评估与分析", "detail": "..."}
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
  """鎺ユ敹璁烘枃 PDF锛岀洰鍓嶄粎淇濆瓨鏂囦欢鍚嶅苟鐢熸垚 paper_id銆?

  TODO:
  - 浣跨敤 pdfminer/pymupdf 鎻愬彇鐪熷疄鏂囨湰
  - 灏嗘彁鍙栧悗鐨勬枃鏈繚瀛樺埌 PAPERS 涓?
  """
  paper_id = str(uuid.uuid4())
  raw_bytes = await request.body()

  # 绠€鍖栵細杩欓噷鏆傛椂涓嶅仛鐪熸鐨?PDF 瑙ｆ瀽锛屽彧鏄ず渚嬪彲鎵ц
  filename = request.headers.get("x-filename", "uploaded.pdf")
  dummy_text = f"Uploaded file: {filename}. Content length: {len(raw_bytes)} bytes."

  PAPERS[paper_id] = {
      "filename": filename,
      "text": dummy_text,
      "step1_result": None,
      "chat_history": [],
  }
  return {"paper_id": paper_id}


@app.websocket("/ws/paper/{paper_id}")
async def paper_stream(ws: WebSocket, paper_id: str) -> None:
  """WebSocket 通道：接收前端 action 并按阶段推送模型结果。"""
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
          # 棰勭暀鍏朵粬闃舵锛?
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
  """阶段一：调用模型执行结构化分析，并以流式形式推送给前端。"""
  paper = PAPERS.get(paper_id)
  if not paper:
      await ws.send_json({"type": "status_change", "msg": "未找到论文，请先上传。"})
      return

  input_text = paper["text"][:20000]  # 闃叉杩囬暱
  prompt = STEP1_PROMPT_TEMPLATE.format(
      input_text=input_text,
      output_schema=STEP1_OUTPUT_SCHEMA,
  )

  await ws.send_json(
      {"type": "status_change", "msg": "正在调用 ModelScope 进行结构化分析..."}
  )

  # 鎸?ModelScope Chat Completions 鎺ュ彛鏍煎紡鏋勯€犺姹?
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {
              "role": "system",
              "content": "你是一名学术研究分析助手，请仅使用中文返回结构化分析结果。",
          },
          {
              "role": "user",
              "content": prompt,
          },
      ],
      "stream": True,
      "temperature": 0.1,
  }

  # 灏濊瘯澶氱鍙兘鐨勮璇佹柟寮?
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
          async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
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
      # 鍏滃簳锛氬鏋滄祦寮忓け璐ワ紝鍐嶈蛋涓€娆￠潪娴佸紡骞朵汉宸ュ垏鐗?      fallback_payload = dict(payload)
      fallback_payload["stream"] = False
      resp = None
      for headers in headers_list:
          try:
              async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
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
                  "msg": f"ModelScope 璇锋眰澶辫触锛堟湭鏀跺埌鍝嶅簲锛夛細{last_error or '鏈煡閿欒'}",
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
              "msg": f"ModelScope 杩斿洖绌哄唴瀹广€俿tatus={last_status or 'unknown'} error={last_error or 'n/a'}",
          }
      )
      return

  result = safe_extract_json(full_text)
  normalized = normalize_step1_result(result)
  if should_localize_to_chinese(normalized):
      await ws.send_json({"type": "status_change", "msg": "妫€娴嬪埌闈炰腑鏂囧唴瀹癸紝姝ｅ湪鑷姩杞崲涓轰腑鏂?.."})
      localized = await localize_result_to_chinese(normalized)
      if localized:
          normalized = normalize_step1_result(localized)
  if paper_id in PAPERS:
      PAPERS[paper_id]["step1_result"] = normalized
  await ws.send_json({"type": "step1_done", "data": normalized})


async def run_paper_chat(ws: WebSocket, paper_id: str, question: str) -> None:
  """围绕当前论文的追问对话，流式返回回答。"""
  await ws.send_json({"type": "status_change", "msg": "正在生成追问回答..."})
  paper = PAPERS.get(paper_id)
  if not paper:
      await ws.send_json({"type": "status_change", "msg": "未找到论文上下文，请先上传并分析。"})
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
          "content": (
              "你是论文研读助手。请围绕给定论文上下文回答用户追问，"
              "使用中文、结构清晰、可执行建议优先；若信息不足请明确说明。"
          ),
      },
      {
          "role": "user",
          "content": (
              "【论文摘要上下文】\n"
              f"{paper_text}\n\n"
              "【结构化分析结果】\n"
              f"{json.dumps(step1_result, ensure_ascii=False)}"
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
                      last_error = "鉴权失败"
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


def safe_extract_json(text: str) -> Dict[str, Any]:
  """从模型返回文本中尽量提取 JSON 结构。"""
  import re

  m = re.search(r"\{[\s\S]*\}", text)
  if not m:
      return {}
  try:
      return json.loads(m.group(0))
  except json.JSONDecodeError:
      return {}


def extract_stream_chunk(payload_obj: Dict[str, Any]) -> str:
  """从流式返回片段中提取文本增量。"""
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
  """兼容不同网关返回格式，提取完整文本。"""
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
  """判断结构化结果是否仍包含较多非中文内容。"""
  if not isinstance(result, dict):
      return False

  import re

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
  """将结构化结果字段值翻译为中文，保持 JSON 结构不变。"""
  translate_prompt = (
      "请把下面 JSON 中所有字符串值翻译成中文，保持键名与结构完全不变，"
      "仅返回 JSON，不要输出解释文字。\n\n"
      f"{json.dumps(result, ensure_ascii=False)}"
  )
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {"role": "system", "content": "你是专业学术翻译助手，请只返回合法 JSON。"},
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
  """标准化模型返回，确保框架图和流程图字段可直接渲染。"""
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
          {"id": "problem", "label": "研究问题", "kind": "problem"},
          {"id": "method", "label": "方法设计", "kind": "method"},
          {"id": "evidence", "label": "实验验证", "kind": "evidence"},
      ]
      if problem_definition:
          valid_nodes[0]["label"] = str(problem_definition[0])[:60]
      if technical_approach:
          valid_nodes[1]["label"] = str(technical_approach[0])[:60]
      if empirical_evidence:
          valid_nodes[2]["label"] = str(empirical_evidence[0])[:60]

  if not valid_links:
      valid_links = [
          {"from": valid_nodes[0]["id"], "to": valid_nodes[1]["id"], "label": "问题驱动方法"},
          {"from": valid_nodes[1]["id"], "to": valid_nodes[2]["id"], "label": "方法获得证据"},
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

  return result


if __name__ == "__main__":
  import uvicorn

  # 浣跨敤 8002 绔彛锛岄伩鍏嶄笌鏈満宸叉湁鏈嶅姟鍐茬獊
  uvicorn.run(app, host="0.0.0.0", port=8002, reload=False)





