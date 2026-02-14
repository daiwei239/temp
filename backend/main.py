from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uuid
import json
import os
import httpx

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
              await run_step1_with_qwen(ws, paper_id)
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
      await ws.send_json({"type": "status_change", "msg": "Paper not found."})
      return

  input_text = paper["text"][:20000]  # 防止过长
  prompt = STEP1_PROMPT_TEMPLATE.format(
      input_text=input_text,
      output_schema=STEP1_OUTPUT_SCHEMA,
  )

  await ws.send_json(
      {"type": "status_change", "msg": "Calling ModelScope Qwen for structural analysis..."}
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
      "stream": False,
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
  
  resp = None
  last_error = None
  
  for headers in headers_list:
      try:
          async with httpx.AsyncClient(timeout=60) as client:
              resp = await client.post(
                  MODELSCOPE_API_URL,
                  headers=headers,
                  json=payload,
              )
              if resp.status_code == 200:
                  break  # 成功则跳出
              elif resp.status_code == 401:
                  last_error = f"Auth failed with headers: {headers.get('Authorization', '')[:20]}..."
                  continue  # 尝试下一种认证方式
              else:
                  break  # 其他错误也跳出
      except httpx.HTTPError as e:
          last_error = str(e)
          continue
  if resp is None or resp.status_code != 200:
      error_detail = resp.text[:500]  # 显示更多错误信息
      try:
          error_json = resp.json()
          error_detail = json.dumps(error_json, ensure_ascii=False, indent=2)
      except:
          pass
      
      await ws.send_json(
          {
              "type": "status_change",
              "msg": f"ModelScope error {resp.status_code}: {error_detail}",
          }
      )
      return

  data = resp.json()
  # ModelScope Chat Completions 返回格式与 OpenAI 类似：choices[0].message.content
  try:
      content = data["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError):
      await ws.send_json(
          {
              "type": "status_change",
              "msg": "ModelScope response format unexpected.",
          }
      )
      return

  full_text = ""
  # 为了前端有“流式”体验，这里把完整内容切片发送
  chunk_size = 80
  for i in range(0, len(content), chunk_size):
      chunk = content[i : i + chunk_size]
      full_text += chunk
      await ws.send_json({"type": "step1_stream", "content": chunk})

  # 尝试从内容中提取 JSON 结构（如果模型按要求返回了 JSON）
  result = safe_extract_json(full_text)
  await ws.send_json({"type": "step1_done", "data": result})


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


if __name__ == "__main__":
  import uvicorn

  # 使用 8002 端口，避免与本机已有服务冲突
  uvicorn.run(app, host="0.0.0.0", port=8002, reload=False)

