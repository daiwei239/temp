from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import uuid
import json
import os
import io
import httpx
import asyncio
import re
import base64
import hashlib
import hmac
import html
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, quote


def _load_env_file() -> None:
  candidates = [
      os.path.join(os.path.dirname(__file__), ".env"),
      os.path.join(os.getcwd(), ".env"),
  ]
  for path in candidates:
      if not os.path.exists(path):
          continue
      try:
          with open(path, "r", encoding="utf-8") as f:
              for raw in f:
                  line = raw.strip()
                  if not line or line.startswith("#") or "=" not in line:
                      continue
                  key, value = line.split("=", 1)
                  key = key.strip().lstrip("\ufeff")
                  value = value.strip().strip('"').strip("'")
                  if key and key not in os.environ:
                      os.environ[key] = value
      except Exception:
          continue


_load_env_file()
try:
  from database import (
      init_db,
      register_user,
      verify_login,
      save_chat_record,
      get_chat_history,
      create_conversation,
      list_conversations,
      get_conversation_messages,
      get_user_by_id,
      update_user_profile,
      update_research_topics,
      get_user_preference,
      get_user_stats,
      sms_rate_check,
      create_sms_code,
      validate_sms_code,
      create_or_get_user_by_phone,
  )
  AUTH_READY = True
  AUTH_INIT_ERROR = ""
except Exception as e:
  AUTH_READY = False
  AUTH_INIT_ERROR = str(e)

app = FastAPI(title="Paper Analysis Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterRequest(BaseModel):
  username: str = Field(..., min_length=3, max_length=64)
  password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
  username: str = Field(..., min_length=3, max_length=64)
  password: str = Field(..., min_length=6, max_length=128)


class ConversationCreateRequest(BaseModel):
  user_id: int = Field(..., ge=1)
  title: str = Field("新对话", min_length=1, max_length=200)


class ProfileUpdateRequest(BaseModel):
  user_id: int = Field(..., ge=1)
  display_name: Optional[str] = Field(default=None, max_length=100)
  bio: Optional[str] = Field(default=None, max_length=500)
  avatar_emoji: Optional[str] = Field(default=None, max_length=16)


class PreferenceUpdateRequest(BaseModel):
  user_id: int = Field(..., ge=1)
  research_topics: List[str] = Field(default_factory=list)
  recent_keywords: Optional[str] = Field(default=None, max_length=500)


class SmsSendRequest(BaseModel):
  phone: str = Field(..., min_length=11, max_length=20)


class SmsVerifyRequest(BaseModel):
  phone: str = Field(..., min_length=11, max_length=20)
  code: str = Field(..., min_length=4, max_length=8)


class PolishRequest(BaseModel):
  text: str = Field(..., min_length=1, max_length=8000)
  styles: List[str] = Field(default_factory=list)


@app.on_event("startup")
async def on_startup() -> None:
  if AUTH_READY:
      init_db()


def _user_payload(user: Any) -> Dict[str, Any]:
  return {
      "id": user.id,
      "username": user.username,
      "phone": user.phone,
      "display_name": user.display_name or user.username,
      "bio": user.bio or "",
      "avatar_emoji": user.avatar_emoji or "👤",
      "created_at": user.created_at.isoformat(),
      "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
  }


def _build_conversation_title(question: str) -> str:
  raw = (question or "").strip()
  if not raw:
      return "新对话"
  single_line = re.sub(r"\s+", " ", raw)
  concise = re.sub(r"[。！？!?；;，,]+$", "", single_line)
  if len(concise) > 28:
      concise = f"{concise[:28].rstrip()}..."
  return concise or "新对话"


def _normalize_cn_phone(phone: str) -> str:
  value = re.sub(r"\s+", "", phone or "")
  value = value.replace("-", "")
  if value.startswith("+86"):
      value = value[3:]
  if value.startswith("86") and len(value) == 13:
      value = value[2:]
  return value


def _is_valid_cn_phone(phone: str) -> bool:
  return re.fullmatch(r"^1[3-9]\d{9}$", phone) is not None


def _gen_sms_code(length: int = 6) -> str:
  import random
  return "".join(str(random.randint(0, 9)) for _ in range(length))


def _percent_encode(value: str) -> str:
  return quote(str(value), safe="~")


async def _send_sms_aliyun(phone: str, code: str, minutes: int = 5) -> tuple[bool, str]:
  access_key_id = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID", "").strip()
  access_key_secret = os.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "").strip()
  sign_name = os.getenv("ALIYUN_SMS_SIGN_NAME", "").strip()
  template_code = os.getenv("ALIYUN_SMS_TEMPLATE_CODE", "").strip()
  if not access_key_id or not access_key_secret or not sign_name or not template_code:
      return False, "短信服务未配置完整"

  # 测试模式：只落库验证码，不实际发短信
  test_mode = os.getenv("ALIYUN_SMS_TEST_MODE", "0").strip().lower() in {"1", "true", "yes", "on"}
  if test_mode:
      return True, "ok"

  timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
  nonce = str(uuid.uuid4())
  include_min = os.getenv("ALIYUN_SMS_TEMPLATE_INCLUDE_MIN", "0").strip().lower() in {"1", "true", "yes", "on"}
  template_payload = {"code": code}
  if include_min:
      template_payload["min"] = str(minutes)
  template_param = json.dumps(template_payload, ensure_ascii=False, separators=(",", ":"))
  params = {
      "Action": "SendSms",
      "Version": "2017-05-25",
      "RegionId": "cn-hangzhou",
      "PhoneNumbers": phone,
      "SignName": sign_name,
      "TemplateCode": template_code,
      "TemplateParam": template_param,
      "Format": "JSON",
      "SignatureMethod": "HMAC-SHA1",
      "SignatureVersion": "1.0",
      "SignatureNonce": nonce,
      "Timestamp": timestamp,
      "AccessKeyId": access_key_id,
  }
  canonicalized = "&".join(f"{_percent_encode(k)}={_percent_encode(params[k])}" for k in sorted(params.keys()))
  string_to_sign = f"POST&%2F&{_percent_encode(canonicalized)}"
  signature = base64.b64encode(
      hmac.new(f"{access_key_secret}&".encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1).digest()
  ).decode("utf-8")
  payload = dict(params)
  payload["Signature"] = signature

  try:
      async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
          resp = await client.post("https://dysmsapi.aliyuncs.com/", data=payload)
      if resp.status_code != 200:
          raw = resp.text[:300]
          return False, f"sms_http_{resp.status_code}:{raw}"
      data = resp.json()
      if data.get("Code") == "OK":
          return True, "ok"
      return False, f"{data.get('Code', 'SMS_ERROR')}:{data.get('Message', '')}"
  except Exception as e:
      return False, f"sms_exception:{str(e)}"


@app.post("/api/auth/register")
async def auth_register(payload: RegisterRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      user = register_user(payload.username, payload.password)
      return {
          "ok": True,
          "user": _user_payload(user),
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"register_failed: {str(e)}")


@app.post("/api/auth/login")
async def auth_login(payload: LoginRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      user = verify_login(payload.username, payload.password)
      if user is None:
          raise HTTPException(status_code=401, detail="用户名或密码错误")
      return {
          "ok": True,
          "user": _user_payload(user),
      }
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"login_failed: {str(e)}")


@app.post("/api/auth/sms/send")
async def auth_sms_send(payload: SmsSendRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      phone = _normalize_cn_phone(payload.phone)
      if not _is_valid_cn_phone(phone):
          raise HTTPException(status_code=400, detail="手机号格式不正确，仅支持中国大陆手机号")
      ok, msg = sms_rate_check(phone=phone, cooldown_seconds=60, daily_limit=10)
      if not ok:
          raise HTTPException(status_code=429, detail=msg)
      code = _gen_sms_code(6)
      test_mode = os.getenv("ALIYUN_SMS_TEST_MODE", "0").strip().lower() in {"1", "true", "yes", "on"}
      send_ok, send_msg = await _send_sms_aliyun(phone, code, minutes=5)
      if not send_ok:
          raise HTTPException(status_code=500, detail=f"短信发送失败：{send_msg}")
      create_sms_code(phone=phone, code=code, purpose="login", ttl_minutes=5)
      result: Dict[str, Any] = {"ok": True, "cooldown_seconds": 60, "expires_minutes": 5}
      if test_mode:
          result["debug_code"] = code
      return result
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"sms_send_failed: {str(e)}")


@app.post("/api/auth/sms/verify")
async def auth_sms_verify(payload: SmsVerifyRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      phone = _normalize_cn_phone(payload.phone)
      code = str(payload.code or "").strip()
      if not _is_valid_cn_phone(phone):
          raise HTTPException(status_code=400, detail="手机号格式不正确，仅支持中国大陆手机号")
      if re.fullmatch(r"^\d{6}$", code) is None:
          raise HTTPException(status_code=400, detail="验证码格式不正确")
      valid = validate_sms_code(phone=phone, code=code, purpose="login")
      if not valid:
          raise HTTPException(status_code=401, detail="验证码错误或已过期")
      user = create_or_get_user_by_phone(phone)
      return {"ok": True, "user": _user_payload(user)}
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"sms_verify_failed: {str(e)}")


@app.get("/api/auth/me")
async def auth_me(user_id: int = Query(..., ge=1)) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      user = get_user_by_id(user_id)
      if user is None:
          raise HTTPException(status_code=404, detail="用户不存在")
      pref = get_user_preference(user_id)
      stats = get_user_stats(user_id)
      return {
          "ok": True,
          "user": _user_payload(user),
          "preference": {
              "research_topics": list(pref.research_topics or []) if pref else [],
              "recent_keywords": (pref.recent_keywords or "") if pref else "",
          },
          "stats": stats,
      }
  except HTTPException:
      raise
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"me_failed: {str(e)}")


@app.put("/api/auth/profile")
async def auth_update_profile(payload: ProfileUpdateRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      user = update_user_profile(
          user_id=payload.user_id,
          display_name=payload.display_name,
          bio=payload.bio,
          avatar_emoji=payload.avatar_emoji,
      )
      return {"ok": True, "user": _user_payload(user)}
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"profile_update_failed: {str(e)}")


@app.put("/api/auth/preferences")
async def auth_update_preferences(payload: PreferenceUpdateRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      pref = update_research_topics(
          user_id=payload.user_id,
          research_topics=payload.research_topics,
          recent_keywords=payload.recent_keywords,
      )
      return {
          "ok": True,
          "preference": {
              "user_id": pref.user_id,
              "research_topics": list(pref.research_topics or []),
              "recent_keywords": pref.recent_keywords or "",
          },
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"preferences_update_failed: {str(e)}")


def _extract_chat_content(payload_obj: Dict[str, Any]) -> str:
  try:
      choices = payload_obj.get("choices") or []
      if not choices:
          return ""
      message = choices[0].get("message") or {}
      return str(message.get("content") or "").strip()
  except Exception:
      return ""


def _polish_fallback(text: str, style: str) -> str:
  if style:
      return (
          f"This manuscript is revised to align with the writing style of {style}. "
          "We clarify the problem statement, present the core methodology with consistent terminology, "
          "and report the main findings in a concise and technically rigorous manner."
      )
  return text


@app.post("/api/polish")
async def polish_text(payload: PolishRequest) -> Dict[str, Any]:
  raw_text = (payload.text or "").strip()
  if not raw_text:
      raise HTTPException(status_code=400, detail="请输入需要润色的内容")
  selected_styles = [str(s).strip().lower() for s in (payload.styles or []) if str(s).strip()]
  selected_styles = list(dict.fromkeys(selected_styles))
  if not selected_styles:
      selected_styles = ["ai"]

  style_prompt = {
      "ai": "人工智能顶刊风格：突出问题定义、方法创新点、实验结论和可复现性。",
      "systems": "系统顶刊风格：突出系统约束、架构设计、复杂度与部署可行性。",
      "software": "软件工程顶刊风格：突出问题建模、工程流程、评测设计与威胁分析。",
      "database": "数据库顶刊风格：突出数据模型、查询优化、吞吐与延迟指标。",
      "network": "网络顶刊风格：突出网络场景、协议设计、链路约束与实验对比。",
      "math_opt": "优化方向顶刊风格：突出形式化定义、目标函数、收敛与复杂度。",
      "math_stats": "统计学习顶刊风格：突出假设条件、估计性质、泛化与置信度分析。",
      "math_ap": "应用数学顶刊风格：突出模型构造、推导过程与适用边界。",
      "math_pr": "概率论顶刊风格：突出随机过程、分布性质与理论证明结构。",
      "math_nt": "数论顶刊风格：突出定义、命题结构与严谨论证链路。",
      "phys_hep": "高能物理顶刊风格：突出理论设定、参数解释与结果物理意义。",
      "phys_cond": "凝聚态顶刊风格：突出材料/体系设定、机制分析与实验对照。",
      "phys_quant": "量子物理顶刊风格：突出量子模型、算符表达与实验可验证性。",
      "phys_astro": "天体物理顶刊风格：突出观测背景、模型假设与数据解释。",
      "phys_plasma": "等离子体顶刊风格：突出方程体系、边界条件与仿真结果。",
      "bio_genomics": "基因组学顶刊风格：突出数据集、生物学假设、统计验证与解释。",
      "bio_neurons": "神经科学顶刊风格：突出研究问题、实验设计、机制解释与结果稳健性。",
      "bio_bm": "生物分子顶刊风格：突出分子机制、实验流程与定量结论。",
      "bio_pe": "种群生态顶刊风格：突出生态模型、参数估计与外推限制。",
      "bio_qm": "生物定量方法顶刊风格：突出建模、误差分析与可重复性。",
      "econ_theory": "经济理论顶刊风格：突出模型假设、命题推导与政策含义。",
      "econ_em": "计量经济顶刊风格：突出识别策略、估计方法与稳健性检验。",
      "econ_gn": "综合经济顶刊风格：突出问题背景、实证设计与结果解释。",
      "econ_fin": "金融经济顶刊风格：突出市场机制、风险度量与经验结果。",
      "econ_trade": "贸易经济顶刊风格：突出贸易机制、识别路径与政策含义。",
      "med_imaging": "医学影像顶刊风格：突出临床任务、模型设计、指标与泛化能力。",
      "med_bioinfo": "医学信息学顶刊风格：突出数据处理流程、模型解释性与临床价值。",
      "med_neuro": "神经医学顶刊风格：突出研究假设、实验流程与临床意义。",
      "med_genomics": "医学基因组顶刊风格：突出变异解释、统计证据与生物学关联。",
      "med_public": "公共健康顶刊风格：突出研究设计、因果识别与政策启示。",
      "chem_physical": "物理化学顶刊风格：突出反应机理、模型参数与实验验证。",
      "chem_theory": "理论化学顶刊风格：突出理论框架、推导结构与适用范围。",
      "chem_materials": "化学材料顶刊风格：突出材料制备、结构表征与性能对比。",
      "chem_comp": "计算化学顶刊风格：突出模拟设定、参数选择与结果解释。",
      "chem_spectro": "光谱化学顶刊风格：突出谱学方法、峰位解释与验证结果。",
      "mat_condensed": "凝聚态材料顶刊风格：突出材料体系、机理阐释与对照实验。",
      "mat_soft": "软物质材料顶刊风格：突出结构演化、流变特性与实验分析。",
      "mat_mtrl": "材料科学顶刊风格：突出工艺参数、性能指标与机理分析。",
      "mat_polymer": "高分子材料顶刊风格：突出聚合机制、结构性质关系与应用潜力。",
      "mat_nano": "纳米材料顶刊风格：突出纳米结构设计、表征与性能提升。",
      "earth_geophysics": "地球物理顶刊风格：突出地球物理模型、观测约束与解释。",
      "earth_climate": "气候科学顶刊风格：突出气候假设、数据同化与不确定性分析。",
      "earth_atmos": "大气科学顶刊风格：突出大气过程建模、参数敏感性与验证。",
      "earth_planet": "行星科学顶刊风格：突出观测证据、理论模型与机制解释。",
      "earth_ocean": "海洋科学顶刊风格：突出海洋过程、耦合机制与数据支撑。",
      "social_econ": "社会经济顶刊风格：突出研究问题、数据来源与结论外推边界。",
      "social_stats": "社会统计顶刊风格：突出统计建模、置信区间与稳健性。",
      "social_network": "社会网络顶刊风格：突出网络结构、传播机制与量化分析。",
      "social_policy": "公共政策顶刊风格：突出政策问题、识别策略与影响评估。",
      "social_behavior": "行为科学顶刊风格：突出实验范式、行为机制与统计证据。",
  }

  results: Dict[str, str] = {}
  for style in selected_styles:
      prompt = (
          f"请将输入内容翻译并润色为英文，风格要求：{style_prompt.get(style, f'对齐 {style} 顶刊写作风格')}。\n"
          "输出要求：\n"
          "1) 仅输出润色后的英文正文；\n"
          "2) 保持技术语义准确；\n"
          "3) 不添加与原文无关的信息。\n\n"
          f"原文如下：\n{raw_text[:7000]}"
      )
      body = {
          "model": MODEL_NAME,
          "messages": [
              {"role": "system", "content": "你是学术写作助手。"},
              {"role": "user", "content": prompt},
          ],
          "stream": False,
          "temperature": 0.2,
      }
      headers = {"Authorization": f"Bearer {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"}
      try:
          async with httpx.AsyncClient(timeout=40, trust_env=False) as client:
              resp = await client.post(MODELSCOPE_API_URL, headers=headers, json=body)
          if resp.status_code != 200:
              results[style] = _polish_fallback(raw_text, style)
              continue
          text = _extract_chat_content(resp.json())
          results[style] = text or _polish_fallback(raw_text, style)
      except Exception:
          results[style] = _polish_fallback(raw_text, style)

  return {"ok": True, "items": [{"style": k, "text": v} for k, v in results.items()]}


@app.get("/api/chat/history")
async def auth_chat_history(user_id: int = Query(..., ge=1)) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      rows = get_chat_history(user_id)
      return {
          "ok": True,
          "items": [
              {
                  "id": item.id,
                  "user_id": item.user_id,
                  "role": item.role,
                  "content": item.content,
                  "timestamp": item.timestamp.isoformat(),
              }
              for item in rows
          ],
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"chat_history_failed: {str(e)}")


@app.get("/api/chat/conversations")
async def auth_chat_conversations(user_id: int = Query(..., ge=1)) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      rows = list_conversations(user_id)
      return {
          "ok": True,
          "items": [
              {
                  "id": item.id,
                  "user_id": item.user_id,
                  "title": item.title,
                  "created_at": item.created_at.isoformat(),
                  "updated_at": item.updated_at.isoformat(),
              }
              for item in rows
          ],
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"chat_conversations_failed: {str(e)}")


@app.post("/api/chat/conversations")
async def auth_create_conversation(payload: ConversationCreateRequest) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      conv = create_conversation(payload.user_id, payload.title)
      return {
          "ok": True,
          "item": {
              "id": conv.id,
              "user_id": conv.user_id,
              "title": conv.title,
              "created_at": conv.created_at.isoformat(),
              "updated_at": conv.updated_at.isoformat(),
          },
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"create_conversation_failed: {str(e)}")


@app.get("/api/chat/messages")
async def auth_chat_messages(
  user_id: int = Query(..., ge=1),
  conversation_id: int = Query(..., ge=1),
) -> Dict[str, Any]:
  if not AUTH_READY:
      raise HTTPException(status_code=500, detail=f"auth_not_ready: {AUTH_INIT_ERROR}")
  try:
      rows = get_conversation_messages(user_id, conversation_id)
      return {
          "ok": True,
          "items": [
              {
                  "id": item.id,
                  "user_id": item.user_id,
                  "conversation_id": item.conversation_id,
                  "role": item.role,
                  "content": item.content,
                  "timestamp": item.timestamp.isoformat(),
              }
              for item in rows
          ],
      }
  except ValueError as e:
      raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
      raise HTTPException(status_code=500, detail=f"chat_messages_failed: {str(e)}")
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
  "ai": "ACL",
  "systems": "ICLR",
  "software": "ICSE",
  "database": "SIGMOD",
  "network": "INFOCOM",
  "math_opt": "Annals of Mathematics",
  "math_stats": "JASA",
  "math_ap": "SIAM Review",
  "math_pr": "PTRF",
  "math_nt": "Inventiones Mathematicae",
  "phys_hep": "Physical Review Letters",
  "phys_cond": "Nature Physics",
  "phys_quant": "PRX Quantum",
  "phys_astro": "The Astrophysical Journal",
  "phys_plasma": "Nuclear Fusion",
  "bio_genomics": "Nature Genetics",
  "bio_neurons": "Neuron",
  "bio_bm": "Cell",
  "bio_pe": "Ecology Letters",
  "bio_qm": "Nature Methods",
  "econ_theory": "Econometrica",
  "econ_em": "AER",
  "econ_gn": "QJE",
  "econ_fin": "Journal of Finance",
  "econ_trade": "JIE",
  "med_imaging": "Radiology",
  "med_bioinfo": "JAMIA",
  "med_neuro": "The Lancet Neurology",
  "med_genomics": "Nature Medicine",
  "med_public": "The Lancet Public Health",
  "chem_physical": "JACS",
  "chem_theory": "Angewandte Chemie",
  "chem_materials": "Chem",
  "chem_comp": "Journal of Chemical Theory and Computation",
  "chem_spectro": "Analytical Chemistry",
  "mat_condensed": "Advanced Materials",
  "mat_soft": "Nature Materials",
  "mat_mtrl": "Materials Today",
  "mat_polymer": "Progress in Polymer Science",
  "mat_nano": "Nano Letters",
  "earth_geophysics": "Geophysical Research Letters",
  "earth_climate": "Nature Climate Change",
  "earth_atmos": "Journal of Climate",
  "earth_planet": "Icarus",
  "earth_ocean": "Journal of Physical Oceanography",
  "social_econ": "ASR",
  "social_stats": "JRSS Series B",
  "social_network": "Social Networks",
  "social_policy": "Policy Studies Journal",
  "social_behavior": "American Journal of Sociology",
}

VENUE_SEARCH_PROFILE: Dict[str, Dict[str, Any]] = {
  "ai": {"query": "ACL conference NLP", "markers": ["acl", "association for computational linguistics", "aclanthology"]},
  "systems": {"query": "ICLR conference machine learning", "markers": ["iclr", "international conference on learning representations"]},
  "software": {"query": "ICSE software engineering conference", "markers": ["icse", "international conference on software engineering"]},
  "database": {"query": "SIGMOD conference database systems", "markers": ["sigmod", "acm sigmod"]},
  "network": {"query": "INFOCOM conference networking", "markers": ["infocom", "ieee infocom"]},
  "math_opt": {"query": "Annals of Mathematics journal", "markers": ["annals of mathematics"]},
  "math_stats": {"query": "Journal of the American Statistical Association JASA", "markers": ["jasa", "journal of the american statistical association"]},
  "math_ap": {"query": "SIAM Review journal", "markers": ["siam review"]},
  "math_pr": {"query": "Probability Theory and Related Fields PTRF", "markers": ["ptrf", "probability theory and related fields"]},
  "math_nt": {"query": "Inventiones Mathematicae journal", "markers": ["inventiones mathematicae"]},
  "phys_hep": {"query": "Physical Review Letters journal", "markers": ["physical review letters", "prl"]},
  "phys_cond": {"query": "Nature Physics journal", "markers": ["nature physics"]},
  "phys_quant": {"query": "PRX Quantum journal", "markers": ["prx quantum"]},
  "phys_astro": {"query": "The Astrophysical Journal", "markers": ["astrophysical journal", "apj"]},
  "phys_plasma": {"query": "Nuclear Fusion journal", "markers": ["nuclear fusion"]},
  "bio_genomics": {"query": "Nature Genetics journal", "markers": ["nature genetics"]},
  "bio_neurons": {"query": "Neuron journal", "markers": ["neuron journal", "cell.com/neuron"]},
  "bio_bm": {"query": "Cell journal biology", "markers": ["cell journal", "cell.com/cell"]},
  "bio_pe": {"query": "Ecology Letters journal", "markers": ["ecology letters"]},
  "bio_qm": {"query": "Nature Methods journal", "markers": ["nature methods"]},
  "econ_theory": {"query": "Econometrica journal", "markers": ["econometrica"]},
  "econ_em": {"query": "American Economic Review AER", "markers": ["american economic review", "aer"]},
  "econ_gn": {"query": "Quarterly Journal of Economics QJE", "markers": ["quarterly journal of economics", "qje"]},
  "econ_fin": {"query": "Journal of Finance", "markers": ["journal of finance"]},
  "econ_trade": {"query": "Journal of International Economics JIE", "markers": ["journal of international economics", "jie"]},
  "med_imaging": {"query": "Radiology journal", "markers": ["radiology"]},
  "med_bioinfo": {"query": "JAMIA journal", "markers": ["jamia", "journal of the american medical informatics association"]},
  "med_neuro": {"query": "The Lancet Neurology", "markers": ["lancet neurology"]},
  "med_genomics": {"query": "Nature Medicine journal", "markers": ["nature medicine"]},
  "med_public": {"query": "The Lancet Public Health", "markers": ["lancet public health"]},
  "chem_physical": {"query": "JACS journal", "markers": ["jacs", "journal of the american chemical society"]},
  "chem_theory": {"query": "Angewandte Chemie journal", "markers": ["angewandte chemie"]},
  "chem_materials": {"query": "Chem journal", "markers": ["chem journal", "cell.com/chem"]},
  "chem_comp": {"query": "Journal of Chemical Theory and Computation", "markers": ["journal of chemical theory and computation", "jctc"]},
  "chem_spectro": {"query": "Analytical Chemistry journal", "markers": ["analytical chemistry"]},
  "mat_condensed": {"query": "Advanced Materials journal", "markers": ["advanced materials"]},
  "mat_soft": {"query": "Nature Materials journal", "markers": ["nature materials"]},
  "mat_mtrl": {"query": "Materials Today journal", "markers": ["materials today"]},
  "mat_polymer": {"query": "Progress in Polymer Science", "markers": ["progress in polymer science"]},
  "mat_nano": {"query": "Nano Letters journal", "markers": ["nano letters"]},
  "earth_geophysics": {"query": "Geophysical Research Letters", "markers": ["geophysical research letters"]},
  "earth_climate": {"query": "Nature Climate Change journal", "markers": ["nature climate change"]},
  "earth_atmos": {"query": "Journal of Climate", "markers": ["journal of climate"]},
  "earth_planet": {"query": "Icarus journal planetary science", "markers": ["icarus journal", "icarus"]},
  "earth_ocean": {"query": "Journal of Physical Oceanography", "markers": ["journal of physical oceanography"]},
  "social_econ": {"query": "American Sociological Review ASR", "markers": ["american sociological review", "asr"]},
  "social_stats": {"query": "JRSS Series B journal", "markers": ["jrss series b", "journal of the royal statistical society series b"]},
  "social_network": {"query": "Social Networks journal", "markers": ["social networks journal", "social networks"]},
  "social_policy": {"query": "Policy Studies Journal", "markers": ["policy studies journal"]},
  "social_behavior": {"query": "American Journal of Sociology", "markers": ["american journal of sociology", "ajs"]},
}

ARXIV_API_BASES = [
  # Primary
  "https://export.arxiv.org",
  # Mirror/fallback
  "https://arxiv.org",
  "http://export.arxiv.org",
  "http://arxiv.org",
]

SCHOLAR_MIRROR_BASES = [
  "https://scholar.lanfanshu.cn",
  "https://scholar.google.com",
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


def _build_search_fallback_items(keyword: str, limit: int) -> list[Dict[str, Any]]:
  q = keyword.strip() or "research topic"
  query_url = f"https://arxiv.org/search/?query={quote_plus(q)}&searchtype=all"
  templates = [
      {
          "title": f"{q}：系统建模与优化方法综述",
          "summary": "从问题建模、约束定义与优化目标出发，给出方法谱系与可复现实验建议。",
          "tags": ["survey", "optimization", "systems"],
      },
      {
          "title": f"{q}：任务调度与资源分配研究进展",
          "summary": "围绕调度策略、资源分配和性能指标，比较不同方法在复杂场景下的表现。",
          "tags": ["scheduling", "resource allocation", "performance"],
      },
      {
          "title": f"{q}：结构化推理与评测框架",
          "summary": "提出结构化评测维度，覆盖准确率、时延、吞吐、鲁棒性与可解释性。",
          "tags": ["reasoning", "benchmark", "evaluation"],
      },
      {
          "title": f"{q}：跨场景泛化与迁移能力分析",
          "summary": "讨论跨数据分布与跨任务迁移的关键因素，并给出稳健性验证流程。",
          "tags": ["generalization", "transfer learning", "robustness"],
      },
      {
          "title": f"{q}：工程落地与系统实践",
          "summary": "从部署成本、系统可靠性与可维护性角度总结工程落地要点。",
          "tags": ["deployment", "engineering", "reliability"],
      },
      {
          "title": f"{q}：前沿方法与开放问题",
          "summary": "总结近年主流技术路线，并归纳尚未解决的开放研究问题。",
          "tags": ["frontier", "open problems", "future work"],
      },
      {
          "title": f"{q}：数据集构建与评测基准",
          "summary": "围绕数据采样策略、标注质量与评测协议，给出标准化对比流程。",
          "tags": ["dataset", "benchmark", "evaluation"],
      },
      {
          "title": f"{q}：鲁棒性与安全性分析",
          "summary": "分析异常输入、对抗扰动与系统失效模式，并给出风险缓解策略。",
          "tags": ["robustness", "security", "reliability"],
      },
      {
          "title": f"{q}：多目标优化与约束建模",
          "summary": "讨论精度、时延、成本等多目标平衡，并设计可执行的约束求解框架。",
          "tags": ["multi-objective", "constraint optimization", "efficiency"],
      },
      {
          "title": f"{q}：可解释性与可视化分析",
          "summary": "构建可解释分析维度与可视化工具链，辅助方法对比与决策复盘。",
          "tags": ["interpretability", "visualization", "analysis"],
      },
  ]
  items: list[Dict[str, Any]] = []
  for idx, item in enumerate(templates[:limit]):
      items.append(
          {
              "id": f"SEARCH-FALLBACK-{idx+1:02d}",
              "domain": "search",
              "title": item["title"],
              "summary": item["summary"],
              "tags": item["tags"],
              "relations": build_tag_relations(item["tags"], "search"),
              "brief": build_brief_sentences(item["title"], item["summary"], item["tags"]),
              "venue": "SEARCH",
              "publishedAt": "N/A",
              "pdfUrl": query_url,
          }
      )
  return items


def _strip_html_tags(text: str) -> str:
  cleaned = re.sub(r"<[^>]+>", " ", text or "")
  cleaned = html.unescape(cleaned)
  cleaned = re.sub(r"\s+", " ", cleaned).strip()
  return cleaned


def _extract_year(text: str) -> str:
  m = re.search(r"(19\d{2}|20\d{2})", text or "")
  return m.group(1) if m else ""


def _build_search_tags_from_text(title: str, summary: str, query_text: str) -> list[str]:
  base = f"{title} {summary} {query_text}".lower()
  tags: list[str] = []
  rules = [
      ("edge", "edge computing"),
      ("network", "network"),
      ("distributed", "distributed systems"),
      ("optimization", "optimization"),
      ("learning", "machine learning"),
      ("graph", "graph"),
      ("retrieval", "retrieval"),
      ("rag", "rag"),
      ("reasoning", "reasoning"),
      ("video", "video"),
      ("vision", "computer vision"),
      ("privacy", "privacy"),
      ("security", "security"),
  ]
  for needle, tag in rules:
      if needle in base:
          tags.append(tag)
  if not tags:
      pieces = [x.strip() for x in re.split(r"[,\s;；，、]+", query_text) if x.strip()]
      tags.extend(pieces[:4])
  return list(dict.fromkeys(tags))[:6]


def _parse_scholar_results(html_text: str, query_text: str) -> list[Dict[str, Any]]:
  blocks = re.findall(
      r'<div class="gs_r gs_or gs_scl"[\s\S]*?<div class="gs_fl">',
      html_text,
      flags=re.IGNORECASE,
  )
  items: list[Dict[str, Any]] = []
  for idx, block in enumerate(blocks):
      title_match = re.search(
          r'<h3 class="gs_rt"[^>]*>\s*(?:<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>|([\s\S]*?))</h3>',
          block,
          flags=re.IGNORECASE,
      )
      if not title_match:
          continue
      link = (title_match.group(1) or "").strip()
      title_raw = title_match.group(2) if title_match.group(2) is not None else (title_match.group(3) or "")
      title = _strip_html_tags(title_raw)
      title = re.sub(r"^\[[^\]]+\]\s*", "", title).strip()
      if not title:
          continue

      summary_match = re.search(r'<div class="gs_rs"[^>]*>([\s\S]*?)</div>', block, flags=re.IGNORECASE)
      summary = _strip_html_tags(summary_match.group(1) if summary_match else "")

      meta_match = re.search(r'<div class="gs_a"[^>]*>([\s\S]*?)</div>', block, flags=re.IGNORECASE)
      meta = _strip_html_tags(meta_match.group(1) if meta_match else "")
      year = _extract_year(meta)
      year_int = int(year) if year.isdigit() else 0

      if not link:
          link = f"https://scholar.lanfanshu.cn/scholar?q={quote_plus(title)}"

      tags = _build_search_tags_from_text(title, summary, query_text)
      items.append(
          {
              "id": f"SEARCH-{idx + 1:02d}",
              "domain": "search",
              "title": title,
              "summary": summary,
              "tags": tags,
              "relations": build_tag_relations(tags, "search"),
              "brief": build_brief_sentences(title, summary, tags),
              "venue": "Scholar",
              "publishedAt": f"{year}-01-01" if year else "N/A",
              "pdfUrl": link,
              "_rank_idx": idx,
              "_year": year_int,
          }
      )
  return items


def _rank_search_items(items: list[Dict[str, Any]], limit: int) -> list[Dict[str, Any]]:
  current_year = datetime.utcnow().year

  def score(item: Dict[str, Any]) -> float:
      idx = int(item.get("_rank_idx", 999))
      year = int(item.get("_year", 0))
      relevance_score = max(0.0, 15.0 - float(idx))
      recency_score = max(0.0, float(year - (current_year - 8)))
      return relevance_score * 0.7 + recency_score * 0.3

  ranked = sorted(items, key=score, reverse=True)[:limit]
  for i, it in enumerate(ranked):
      it["id"] = f"SEARCH-{i + 1:02d}"
      it.pop("_rank_idx", None)
      it.pop("_year", None)
  return ranked


def _filter_items_by_venue(items: list[Dict[str, Any]], domain: str) -> list[Dict[str, Any]]:
  profile = VENUE_SEARCH_PROFILE.get(domain, {})
  markers = [str(x).lower() for x in profile.get("markers", []) if str(x).strip()]
  if not markers:
      return items
  filtered: list[Dict[str, Any]] = []
  for item in items:
      text = " ".join(
          [
              str(item.get("title", "")),
              str(item.get("summary", "")),
              str(item.get("pdfUrl", "")),
              str(item.get("venue", "")),
          ]
      ).lower()
      if any(marker in text for marker in markers):
          filtered.append(item)
  return filtered


def _build_recommendation_fallback_items(domain: str, limit: int) -> list[Dict[str, Any]]:
  venue_name = ARXIV_DOMAIN_VENUE.get(domain, domain.upper())
  profile = VENUE_SEARCH_PROFILE.get(domain, {})
  query = str(profile.get("query", venue_name)).strip() or venue_name
  query_url = f"https://scholar.lanfanshu.cn/scholar?q={quote_plus(query)}"
  templates = [
      f"{venue_name} 最新研究进展综述",
      f"{venue_name} 代表性方法与实验设置",
      f"{venue_name} 高被引论文脉络梳理",
      f"{venue_name} 常见任务与评测指标",
      f"{venue_name} 工程实践与系统优化",
      f"{venue_name} 理论方法与可解释性分析",
      f"{venue_name} 开放问题与未来方向",
      f"{venue_name} 跨任务迁移与泛化能力",
      f"{venue_name} 数据集构建与复现实验",
      f"{venue_name} 应用落地与边界条件",
  ]
  items: list[Dict[str, Any]] = []
  for idx, title in enumerate(templates[:limit]):
      summary = f"该结果用于保证 {venue_name} 类别展示一致性，点击后可继续在 Scholar 镜像查看真实论文。"
      tags = [venue_name, "top venue", "recommendation"]
      items.append(
          {
              "id": f"{domain.upper()}-{idx + 1:02d}",
              "domain": domain,
              "title": title,
              "summary": summary,
              "tags": tags,
              "relations": build_tag_relations(tags, domain),
              "brief": build_brief_sentences(title, summary, tags),
              "venue": venue_name,
              "publishedAt": "N/A",
              "pdfUrl": query_url,
          }
      )
  return items


async def _rewrite_query_to_academic(keyword: str) -> str:
  payload = {
      "model": MODEL_NAME,
      "messages": [
          {"role": "system", "content": "你是学术检索助手。"},
          {
              "role": "user",
              "content": (
                  "请将下面的检索词改写为更规范的学术检索短语。"
                  "输出仅一行英文，不要解释。\n"
                  f"原始检索词：{keyword}"
              ),
          },
      ],
      "stream": False,
      "temperature": 0.1,
  }
  headers = {"Authorization": f"Bearer {MODELSCOPE_API_TOKEN}", "Content-Type": "application/json"}
  try:
      async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
          resp = await client.post(MODELSCOPE_API_URL, headers=headers, json=payload)
      if resp.status_code != 200:
          return keyword
      content = _extract_chat_content(resp.json()).strip()
      if not content:
          return keyword
      content = re.sub(r"[\r\n]+", " ", content).strip().strip("\"'")
      return content or keyword
  except Exception:
      return keyword


@app.get("/api/recommendations")
async def get_recommendations(
  domain: str = Query("ai"),
  limit: int = Query(10, ge=1, le=20),
) -> Dict[str, Any]:
  domain_key = domain.strip().lower()
  if domain_key not in ARXIV_DOMAIN_VENUE:
      domain_key = "ai"
  venue_name = ARXIV_DOMAIN_VENUE.get(domain_key, "TOP")
  profile = VENUE_SEARCH_PROFILE.get(domain_key, {})
  venue_query = str(profile.get("query", venue_name)).strip() or venue_name
  scholar_query = quote_plus(venue_query)

  last_error = "unknown"
  tried_sources: list[str] = []
  for base in SCHOLAR_MIRROR_BASES:
      url = f"{base}/scholar?hl=zh-CN&as_sdt=0,5&num=30&q={scholar_query}"
      tried_sources.append(base)
      try:
          async with httpx.AsyncClient(timeout=20, trust_env=False, follow_redirects=True) as client:
              resp = await client.get(url)
          if resp.status_code != 200:
              last_error = f"{base}:http_{resp.status_code}"
              continue
          items = _parse_scholar_results(resp.text, venue_query)
          if not items:
              last_error = f"{base}:parse_empty"
              continue
          filtered = _filter_items_by_venue(items, domain_key)
          if not filtered:
              last_error = f"{base}:venue_filter_empty"
              continue
          ranked = _rank_search_items(filtered, limit)
          for item in ranked:
              item["domain"] = domain_key
              item["venue"] = venue_name
          return {
              "domain": domain_key,
              "items": ranked,
              "source": base,
              "tried_sources": tried_sources,
              "venue": venue_name,
          }
      except Exception as e:
          last_error = f"{base}:{str(e)[:80]}"
          continue

  return {
      "domain": domain_key,
      "items": _build_recommendation_fallback_items(domain_key, limit),
      "source": "fallback",
      "tried_sources": tried_sources,
      "venue": venue_name,
      "error": f"all_sources_failed:{last_error}",
  }


@app.get("/api/search")
async def search_papers(
  q: str = Query(..., min_length=1, max_length=200),
  limit: int = Query(10, ge=1, le=20),
) -> Dict[str, Any]:
  keyword = q.strip()
  if not keyword:
      raise HTTPException(status_code=400, detail="query_empty")

  optimized_query = await _rewrite_query_to_academic(keyword)
  scholar_query = quote_plus(optimized_query)

  last_error = "unknown"
  tried_sources: list[str] = []
  for base in SCHOLAR_MIRROR_BASES:
      url = f"{base}/scholar?hl=zh-CN&as_sdt=0,5&num=20&q={scholar_query}"
      tried_sources.append(base)
      try:
          async with httpx.AsyncClient(timeout=20, trust_env=False, follow_redirects=True) as client:
              resp = await client.get(url)
          if resp.status_code != 200:
              last_error = f"{base}:http_{resp.status_code}"
              continue
          items = _parse_scholar_results(resp.text, optimized_query)
          if not items:
              last_error = f"{base}:parse_empty"
              continue
          ranked = _rank_search_items(items, limit)
          return {
              "query": keyword,
              "optimized_query": optimized_query,
              "items": ranked,
              "source": base,
              "tried_sources": tried_sources,
          }
      except Exception as e:
          last_error = f"{base}:{str(e)[:80]}"
          continue

  return {
      "query": keyword,
      "optimized_query": optimized_query,
      "items": _build_search_fallback_items(optimized_query, limit),
      "source": "fallback",
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
                  answer_mode = str(msg.get("answer_mode", "concise")).strip().lower()
                  user_id = msg.get("user_id")
                  conversation_id = msg.get("conversation_id")
                  try:
                      user_id = int(user_id) if user_id is not None else None
                  except Exception:
                      user_id = None
                  try:
                      conversation_id = int(conversation_id) if conversation_id is not None else None
                  except Exception:
                      conversation_id = None
                  if answer_mode not in {"concise", "detailed"}:
                      answer_mode = "concise"
                  await run_paper_chat(ws, paper_id, question, answer_mode, user_id, conversation_id)
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
      # 兜底：流式失败时改为非流式请求。
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


async def run_paper_chat(
  ws: WebSocket,
  paper_id: str,
  question: str,
  answer_mode: str = "concise",
  user_id: int | None = None,
  conversation_id: int | None = None,
) -> None:
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

  conversation_announced = False

  async def ensure_conversation() -> int | None:
      nonlocal conversation_id, conversation_announced
      if not (AUTH_READY and user_id):
          return None
      if conversation_id is not None:
          return conversation_id
      try:
          conv = create_conversation(user_id, _build_conversation_title(question))
          conversation_id = conv.id
          if not conversation_announced:
              await ws.send_json(
                  {
                      "type": "conversation_created",
                      "conversation": {
                          "id": conv.id,
                          "title": conv.title,
                          "user_id": conv.user_id,
                          "created_at": conv.created_at.isoformat(),
                          "updated_at": conv.updated_at.isoformat(),
                      },
                  }
              )
              conversation_announced = True
          return conversation_id
      except Exception:
          conversation_id = None
          return None

  if AUTH_READY and user_id:
      await ensure_conversation()

  if AUTH_READY and user_id:
      try:
          save_chat_record(
              user_id=user_id,
              role="user",
              content=question,
              conversation_id=conversation_id,
          )
      except Exception:
          # conversation_id 可能已过期，回退创建新会话后重试一次
          try:
              conversation_id = None
              await ensure_conversation()
              if conversation_id is not None:
                  save_chat_record(
                      user_id=user_id,
                      role="user",
                      content=question,
                      conversation_id=conversation_id,
                  )
          except Exception:
              pass

  step1_result = paper.get("step1_result") or {}
  paper_text = str(paper.get("text", ""))[:12000]
  history = paper.get("chat_history") or []
  if not isinstance(history, list):
      history = []

  mode_hint = (
      "请详细回答：分点展开、给出方法细节和必要示例。"
      if answer_mode == "detailed"
      else "请精简回答：2-4句，先给结论，再补1-2个关键点。"
  )

  messages = [
      {
          "role": "system",
          "content": (
              "你是论文研究助手。请围绕给定论文上下文回答用户追问，使用中文。"
              f"{mode_hint} 信息不足时要明确说明。"
          ),
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
  if AUTH_READY and user_id and answer.strip():
      try:
          save_chat_record(
              user_id=user_id,
              role="assistant",
              content=answer,
              conversation_id=conversation_id,
          )
      except Exception:
          try:
              conversation_id = None
              await ensure_conversation()
              if conversation_id is not None:
                  save_chat_record(
                      user_id=user_id,
                      role="assistant",
                      content=answer,
                      conversation_id=conversation_id,
                  )
          except Exception:
              pass
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













