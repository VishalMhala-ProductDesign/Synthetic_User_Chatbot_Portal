
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, UniqueConstraint, Uuid, JSON
from sqlalchemy.ext.declarative import declarative_base
import uuid, datetime

Base = declarative_base()


def new_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Persona(Base):
    __tablename__ = "personas"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    researcher_id = Column(Uuid(as_uuid=False), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    age = Column(Integer)
    industry = Column(String)
    education = Column(String)
    profession = Column(String)
    experience_years = Column(Integer)
    role = Column(String)
    custom_attributes = Column(JSON, default=dict)
    maturity_score = Column(Integer, nullable=True)
    maturity_notes = Column(Text, nullable=True)
    system_prompt_cache = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    # Note: no group_id column here — group membership is many-to-many,
    # see PersonaGroupMembership below.


class PersonaGroup(Base):
    __tablename__ = "persona_groups"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    researcher_id = Column(Uuid(as_uuid=False), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PersonaGroupMembership(Base):
    __tablename__ = "persona_group_memberships"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    persona_id = Column(Uuid(as_uuid=False), ForeignKey("personas.id"), nullable=False)
    group_id = Column(Uuid(as_uuid=False), ForeignKey("persona_groups.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    __table_args__ = (UniqueConstraint("persona_id", "group_id", name="uq_persona_group"),)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    persona_id = Column(Uuid(as_uuid=False), ForeignKey("personas.id"), nullable=False)
    researcher_id = Column(Uuid(as_uuid=False), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    session_id = Column(Uuid(as_uuid=False), ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # 'researcher' or 'persona'
    text = Column(Text, nullable=False)
    grounded_in = Column(JSON, nullable=True)  # persona fields this reply drew on; persona-role rows only
    web_sources = Column(JSON, nullable=True)  # [{title, url}], from Groq compound's web_search tool; persona-role rows only
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class GroupChatSession(Base):
    __tablename__ = "group_chat_sessions"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    group_id = Column(Uuid(as_uuid=False), ForeignKey("persona_groups.id"), nullable=False)
    researcher_id = Column(Uuid(as_uuid=False), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class GroupMessage(Base):
    __tablename__ = "group_messages"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    session_id = Column(Uuid(as_uuid=False), ForeignKey("group_chat_sessions.id"), nullable=False)
    persona_id = Column(Uuid(as_uuid=False), ForeignKey("personas.id"), nullable=True)  # null for researcher rows
    role = Column(String, nullable=False)  # 'researcher' or 'persona'
    text = Column(Text, nullable=False)
    grounded_in = Column(JSON, nullable=True)
    web_sources = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SessionInsight(Base):
    """One generated insight per (session, framework), so a researcher who
    navigates to another chat/persona/feature and comes back sees whatever
    was last generated instead of it being lost with the component that
    generated it. validated_rows stores the researcher's manually-validated
    row keys (see rowValidationKey in InsightDrawer.jsx) so those checkmarks
    persist too."""
    __tablename__ = "session_insights"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    session_id = Column(Uuid(as_uuid=False), ForeignKey("chat_sessions.id"), nullable=False)
    framework = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    validated_rows = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    __table_args__ = (UniqueConstraint("session_id", "framework", name="uq_session_insight"),)


class GroupSessionInsight(Base):
    """Same as SessionInsight, for group chat sessions."""
    __tablename__ = "group_session_insights"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    session_id = Column(Uuid(as_uuid=False), ForeignKey("group_chat_sessions.id"), nullable=False)
    framework = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    validated_rows = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    __table_args__ = (UniqueConstraint("session_id", "framework", name="uq_group_session_insight"),)


class MaturityRecommendation(Base):
    __tablename__ = "maturity_recommendations"
    id = Column(Uuid(as_uuid=False), primary_key=True, default=new_uuid)
    persona_id = Column(Uuid(as_uuid=False), ForeignKey("personas.id"), nullable=False)
    score = Column(Integer)
    gaps = Column(JSON)
    suggestions = Column(Text)
    source_basis = Column(JSON)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


