from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import hmac
import os
import re
import secrets
import tempfile
from pathlib import Path
from typing import List, Optional, Sequence

import bcrypt
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, create_engine, select, text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

try:
    from passlib.context import CryptContext  # type: ignore
except Exception:
    CryptContext = None  # type: ignore

# 数据库文件：放在用户临时目录，避免目录写入限制
_base_dir = Path(tempfile.gettempdir()) / "PerAgent"
_base_dir.mkdir(parents=True, exist_ok=True)
DB_FILE = _base_dir / "agent_data.db"
DATABASE_URL = f"sqlite:///{DB_FILE.as_posix()}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if CryptContext else None


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_emoji: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    conversations: Mapped[List["Conversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    chat_history: Mapped[List["ChatHistory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    preference: Mapped[Optional["UserPreference"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[List["ChatHistory"]] = relationship(back_populates="conversation")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("conversations.id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="chat_history")
    conversation: Mapped[Optional["Conversation"]] = relationship(back_populates="messages")


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    research_topics: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    recent_keywords: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="preference")


class SmsCodeLog(Base):
    __tablename__ = "sms_code_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False, default="login")
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


def init_db() -> None:
    """初始化数据库并创建全部数据表。"""
    Base.metadata.create_all(bind=engine)
    _ensure_legacy_columns()


def _ensure_legacy_columns() -> None:
    """兼容旧库：补充新增字段。"""
    with engine.begin() as conn:
        user_cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        user_col_names = {c[1] for c in user_cols}
        if "display_name" not in user_col_names:
            conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(100)"))
        if "phone" not in user_col_names:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20)"))
        if "bio" not in user_col_names:
            conn.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
        if "avatar_emoji" not in user_col_names:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_emoji VARCHAR(16)"))
        if "last_login_at" not in user_col_names:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))

        cols = conn.execute(text("PRAGMA table_info(chat_history)")).fetchall()
        col_names = {c[1] for c in cols}
        if "conversation_id" not in col_names:
            conn.execute(text("ALTER TABLE chat_history ADD COLUMN conversation_id INTEGER"))


def _hash_password(raw_password: str) -> str:
    if pwd_context is not None:
        return pwd_context.hash(raw_password)
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(raw_password: str, password_hash: str) -> bool:
    if pwd_context is not None:
        return pwd_context.verify(raw_password, password_hash)
    return bcrypt.checkpw(raw_password.encode("utf-8"), password_hash.encode("utf-8"))


def register_user(username: str, raw_password: str) -> User:
    username = username.strip()
    if not username:
        raise ValueError("用户名不能为空")
    if not raw_password:
        raise ValueError("密码不能为空")

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None:
            raise ValueError("用户名已存在")

        user = User(
            username=username,
            phone=None,
            password_hash=_hash_password(raw_password),
            display_name=username,
            avatar_emoji="👤",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def verify_login(username: str, raw_password: str) -> Optional[User]:
    username = username.strip()
    if not username or not raw_password:
        return None

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            return None
        if not _verify_password(raw_password, user.password_hash):
            return None
        user.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user


def register_user_by_phone(phone: str, raw_password: str) -> User:
    phone = (phone or "").strip()
    if not phone:
        raise ValueError("手机号不能为空")
    if not raw_password:
        raise ValueError("密码不能为空")
    username = _gen_mobile_username(phone)

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.phone == phone)) is not None:
            raise ValueError("该手机号已注册")
        if db.scalar(select(User).where(User.username == username)) is not None:
            username = f"{username}_{secrets.token_hex(2)}"

        user = User(
            username=username,
            phone=phone,
            password_hash=_hash_password(raw_password),
            display_name=username,
            avatar_emoji="👤",
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def verify_login_by_phone(phone: str, raw_password: str) -> Optional[User]:
    phone = (phone or "").strip()
    if not phone or not raw_password:
        return None

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.phone == phone))
        if user is None:
            return None
        if not _verify_password(raw_password, user.password_hash):
            return None
        user.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return user


def get_user_by_id(user_id: int) -> Optional[User]:
    with SessionLocal() as db:
        return db.get(User, user_id)


def get_user_by_phone(phone: str) -> Optional[User]:
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.phone == phone))


def update_user_profile(
    user_id: int,
    display_name: Optional[str] = None,
    bio: Optional[str] = None,
    avatar_emoji: Optional[str] = None,
) -> User:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")
        if display_name is not None:
            cleaned = display_name.strip()
            user.display_name = cleaned[:100] if cleaned else user.username
        if bio is not None:
            cleaned_bio = bio.strip()
            user.bio = cleaned_bio[:500] if cleaned_bio else None
        if avatar_emoji is not None:
            cleaned_avatar = avatar_emoji.strip()
            user.avatar_emoji = cleaned_avatar[:16] if cleaned_avatar else "👤"
        db.commit()
        db.refresh(user)
        return user


def create_conversation(user_id: int, title: str) -> Conversation:
    title = (title or "新对话").strip()[:200] or "新对话"
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")
        conv = Conversation(user_id=user_id, title=title)
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv


def update_conversation_title(user_id: int, conversation_id: int, title: str) -> Conversation:
    cleaned = (title or "").strip()[:200]
    if not cleaned:
        raise ValueError("标题不能为空")
    with SessionLocal() as db:
        conv = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
        if conv is None:
            raise ValueError("会话不存在")
        conv.title = cleaned
        conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conv)
        return conv


def list_conversations(user_id: int) -> Sequence[Conversation]:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")
        stmt = select(Conversation).where(Conversation.user_id == user_id).order_by(Conversation.updated_at.desc())
        return list(db.scalars(stmt).all())


def get_conversation_messages(user_id: int, conversation_id: int) -> Sequence[ChatHistory]:
    with SessionLocal() as db:
        conv = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
        if conv is None:
            raise ValueError("会话不存在")
        stmt = (
            select(ChatHistory)
            .where(ChatHistory.user_id == user_id, ChatHistory.conversation_id == conversation_id)
            .order_by(ChatHistory.timestamp.asc())
        )
        return list(db.scalars(stmt).all())


def save_chat_record(user_id: int, role: str, content: str, conversation_id: Optional[int] = None) -> ChatHistory:
    if role not in {"user", "assistant"}:
        raise ValueError("role 仅允许 user 或 assistant")
    if not content.strip():
        raise ValueError("content 不能为空")

    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")

        if conversation_id is not None:
            conv = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
            if conv is None:
                raise ValueError("会话不存在")
            conv.updated_at = datetime.utcnow()

        record = ChatHistory(user_id=user_id, conversation_id=conversation_id, role=role, content=content)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def get_chat_history(user_id: int) -> Sequence[ChatHistory]:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")
        stmt = select(ChatHistory).where(ChatHistory.user_id == user_id).order_by(ChatHistory.timestamp.asc())
        return list(db.scalars(stmt).all())


def update_research_topics(user_id: int, research_topics: List[str], recent_keywords: Optional[str] = None) -> UserPreference:
    cleaned_topics = [topic.strip() for topic in research_topics if topic and topic.strip()]

    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")

        pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
        if pref is None:
            pref = UserPreference(
                user_id=user_id,
                research_topics=cleaned_topics,
                recent_keywords=(recent_keywords or "").strip() or None,
            )
            db.add(pref)
        else:
            pref.research_topics = cleaned_topics
            pref.recent_keywords = (recent_keywords or "").strip() or None

        db.commit()
        db.refresh(pref)
        return pref


def append_user_preference_keywords(
    user_id: int,
    keywords: List[str],
    research_topics: Optional[List[str]] = None,
    max_keywords: int = 80,
    max_topics: int = 20,
) -> UserPreference:
    """追加写入用户偏好，不覆盖历史。"""
    cleaned_keywords = [str(k).strip() for k in (keywords or []) if str(k).strip()]
    cleaned_topics = [str(t).strip() for t in (research_topics or []) if str(t).strip()]

    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")

        pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
        if pref is None:
            pref = UserPreference(user_id=user_id, research_topics=[], recent_keywords=None)
            db.add(pref)

        existing_keywords = re.split(r"[,，、;；\s]+", pref.recent_keywords or "")
        existing_keywords = [k.strip() for k in existing_keywords if k and k.strip()]
        merged_keywords = list(dict.fromkeys([*cleaned_keywords, *existing_keywords]))[:max_keywords]

        existing_topics = [str(t).strip() for t in (pref.research_topics or []) if str(t).strip()]
        merged_topics = list(dict.fromkeys([*cleaned_topics, *existing_topics]))[:max_topics]

        pref.recent_keywords = "、".join(merged_keywords) if merged_keywords else None
        pref.research_topics = merged_topics
        db.commit()
        db.refresh(pref)
        return pref


def get_user_preference(user_id: int) -> Optional[UserPreference]:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")
        return db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))


def get_user_stats(user_id: int) -> dict:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None:
            raise ValueError("用户不存在")

        conversation_count = db.scalar(
            select(func.count(Conversation.id)).where(Conversation.user_id == user_id)
        ) or 0
        message_count = db.scalar(
            select(func.count(ChatHistory.id)).where(ChatHistory.user_id == user_id)
        ) or 0
        last_chat_at = db.scalar(
            select(func.max(ChatHistory.timestamp)).where(ChatHistory.user_id == user_id)
        )
        return {
            "conversation_count": int(conversation_count),
            "message_count": int(message_count),
            "last_chat_at": last_chat_at.isoformat() if last_chat_at else None,
        }


def _sms_code_hash(phone: str, code: str) -> str:
    pepper = os.getenv("SMS_CODE_PEPPER", "peragent-sms")
    raw = f"{phone}:{code}:{pepper}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _gen_mobile_username(phone: str) -> str:
    return f"mobile_{phone}"


def create_or_get_user_by_phone(phone: str) -> User:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.phone == phone))
        if user is not None:
            user.last_login_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
            return user

        username = _gen_mobile_username(phone)
        if db.scalar(select(User).where(User.username == username)) is not None:
            username = f"{username}_{secrets.token_hex(2)}"
        pseudo_password = secrets.token_urlsafe(18)
        user = User(
            username=username,
            phone=phone,
            password_hash=_hash_password(pseudo_password),
            display_name=username,
            avatar_emoji="👤",
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def create_sms_code(phone: str, code: str, purpose: str = "login", ttl_minutes: int = 5) -> SmsCodeLog:
    with SessionLocal() as db:
        rec = SmsCodeLog(
            phone=phone,
            purpose=purpose,
            code_hash=_sms_code_hash(phone, code),
            expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return rec


def validate_sms_code(phone: str, code: str, purpose: str = "login") -> bool:
    now = datetime.utcnow()
    with SessionLocal() as db:
        stmt = (
            select(SmsCodeLog)
            .where(
                SmsCodeLog.phone == phone,
                SmsCodeLog.purpose == purpose,
                SmsCodeLog.consumed_at.is_(None),
                SmsCodeLog.expires_at >= now,
            )
            .order_by(SmsCodeLog.created_at.desc())
        )
        rec = db.scalar(stmt)
        if rec is None:
            return False
        expected = rec.code_hash
        actual = _sms_code_hash(phone, code)
        if not hmac.compare_digest(expected, actual):
            return False
        rec.consumed_at = now
        db.commit()
        return True


def sms_rate_check(phone: str, cooldown_seconds: int = 60, daily_limit: int = 10) -> tuple[bool, str]:
    now = datetime.utcnow()
    day_start = datetime(now.year, now.month, now.day)
    with SessionLocal() as db:
        today_count = db.scalar(
            select(func.count(SmsCodeLog.id)).where(SmsCodeLog.phone == phone, SmsCodeLog.created_at >= day_start)
        ) or 0
        if int(today_count) >= daily_limit:
            return False, "该手机号今日验证码次数已达上限"
        last_time = db.scalar(
            select(func.max(SmsCodeLog.created_at)).where(SmsCodeLog.phone == phone)
        )
        if last_time is not None and (now - last_time).total_seconds() < cooldown_seconds:
            return False, f"请求过于频繁，请在 {cooldown_seconds} 秒后重试"
        return True, ""


if __name__ == "__main__":
    init_db()
    print(f"数据库初始化完成: {DB_FILE}")
