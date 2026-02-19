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

# 设置 ModelScope API Token（魔搭社区的 token）
MODELSCOPE_API_TOKEN = "ms-0be979b5-11b5-462c-ab46-afa93062154f"
MODELSCOPE_API_URL = "https://api-inference.modelscope.cn/v1/chat/completions"
# 尝试使用多模态模型（如果支持的话）
MODEL_NAME = "deepseek-ai/DeepSeek-V3.2"  # DeepSeek 推理模型（小写格式）

# 简单内存存储，生产环境请替换为数据库或缓存
PAPERS: Dict[str, Dict[str, Any]] = {}

STEP1_PROMPT_TEMPLATE = """
Role: You are an advanced Academic Research Agent specialized in epistemological analysis and structural deconstruction of scientific literature.
Tone: Objective, analytical, precise, and formally academic.

[Instruction]: Perform a hierarchical structural analysis of the uploaded manuscript.
[Input Text]: {input_text}

[Requirements]:
1. Deconstruct the content into a "Problem-Method-Experiment" tree structure.
2. Identify the specific 'Research Gap' addressed.
3. Extract the 'Methodological Framework' without simplifying the technical jargon.
4. Output the result in strictly structured JSON format for frontend rendering.
5. No colloquialism. Use epistemological, paradigm, quantitative metric when appropriate.

[Output Format]:
{output_schema}
"""

STEP1_OUTPUT_SCHEMA = """{
  "title": "...",
  "research_gap": "...",
  "core_methodology": "...",
  "framework_map": {
    "nodes": [
      {"id": "n1", "label": "Research Problem", "kind": "problem"},
      {"id": "n2", "label": "Method Design", "kind": "method"},
      {"id": "n3", "label": "Experimental Evidence", "kind": "evidence"}
    ],
    "links": [
      {"from": "n1", "to": "n2", "label": "drives"},
      {"from": "n2", "to": "n3", "label": "validated by"}
    ]
  },
  "flow_chart": {
    "title": "Method Workflow",
    "steps": [
      {"name": "Problem Formulation", "detail": "..."},
      {"name": "Data/Knowledge Preparation", "detail": "..."},
      {"name": "Modeling and Optimization", "detail": "..."},
      {"name": "Evaluation and Analysis", "detail": "..."}
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
  """接收论文 PDF，目前仅保存文件名并生成 paper_id。

  TODO:
  - 使用 pdfminer/pymupdf 提取真实文本
  - 将提取后的文本保存到 PAPERS 中
  """
  paper_id = str(uuid.uuid4())
  raw_bytes = await request.body()

  # 简化：这里暂时不做真正的 PDF 解析，只是示例可执行
  filename = request.headers.get("x-filename", "uploaded.pdf")
  dummy_text = f"Uploaded file: {filename}. Content length: {len(raw_bytes)} bytes."

  PAPERS[paper_id] = {
      "filename": filename,
      "text": dummy_text,
  }
  return {"paper_id": paper_id}


@app.websocket("/ws/paper/{paper_id}")
async def paper_stream(ws: WebSocket, paper_id: str) -> None:
  """WebSocket 通道：接收前端 action，并按阶段推送模型结果。"""
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
          # 预留其他阶段：
          # elif action == "reading_path":
          #     await run_step2_with_qwen(ws, paper_id)
          # elif action == "presentation":
          #     await run_step3_with_qwen(ws, paper_id)
  except WebSocketDisconnect:
      return


async def run_step1_with_qwen(ws: WebSocket, paper_id: str) -> None:
  """阶段一：调用魔搭社区 Qwen 模型做结构解析，并以流式形式推送给前端。"""
  paper = PAPERS.get(paper_id)
  if not paper:
      await ws.send_json({"type": "status_change", "msg": "未找到论文，请先上传。"})
      return

  input_text = paper["text"][:20000]  # 防止过长
  prompt = STEP1_PROMPT_TEMPLATE.format(
      input_text=input_text,
      output_schema=STEP1_OUTPUT_SCHEMA,
  )

  await ws.send_json(
      {"type": "status_change", "msg": "正在调用 ModelScope 进行结构化分析..."}
  )

  # 按 ModelScope Chat Completions 接口格式构造请求
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {
              "role": "system",
              "content": "You are an advanced Academic Research Agent specialized in epistemological analysis and structural deconstruction of scientific literature.",
          },
          {
              "role": "user",
              "content": prompt,
          },
      ],
      "stream": True,
      "temperature": 0.1,
  }

  # 尝试多种可能的认证方式
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
      # 兜底：如果流式失败，再走一次非流式并人工切片
      fallback_payload = dict(payload)
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
                  "msg": f"ModelScope 接口错误 {resp.status_code}：{error_detail}",
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
  await ws.send_json({"type": "step1_done", "data": normalized})


def safe_extract_json(text: str) -> Dict[str, Any]:
  """从模型返回的文本中尽量提取 JSON 结构。"""
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
  """兼容不同供应商/网关返回格式，提取完整文本。"""
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


def normalize_step1_result(result: Dict[str, Any]) -> Dict[str, Any]:
  """标准化模型返回：确保框架图/流程图字段存在且可前端直接渲染。"""
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

  # 若模型未产出可用框架图，基于结构树生成兜底框架
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
  flow_steps = flow_chart.get("steps") or []
  if not isinstance(flow_steps, list):
      flow_steps = []

  valid_flow_steps = []
  for s in flow_steps:
      if not isinstance(s, dict):
          continue
      name = str(s.get("name", "")).strip()
      if not name:
          continue
      detail = str(s.get("detail", "")).strip()
      valid_flow_steps.append({"name": name, "detail": detail})

  # 若流程图缺失，使用结构树兜底
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

  # 使用 8002 端口，避免与本机已有服务冲突
  uvicorn.run(app, host="0.0.0.0", port=8002, reload=False)

