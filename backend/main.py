
import os
import re
import json
import datetime

import httpx
import anthropic
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from database import get_db
from models import (
    User, Persona, PersonaGroup, PersonaGroupMembership,
    ChatSession, Message, GroupChatSession, GroupMessage, MaturityRecommendation,
    SessionInsight, GroupSessionInsight,
)
from auth import hash_password, verify_password, create_token, decode_token
from maturity_tools import tools as maturity_tools
from prompts import (
    build_persona_system_prompt, split_reply_and_grounding, build_insight_prompt,
    load_scope_reference, prior_framework, FRAMEWORK_CHAIN,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    # frontend/vite.config.js dev server port — both host forms allowed since
    # browsers treat localhost and 127.0.0.1 as distinct origins.
    allow_origins=[
    "http://localhost:5191",
    "http://127.0.0.1:5191",
    "https://synthetic-user-chatbot-portal.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
# Anthropic's web_search tool runs server-side (Claude issues the query, Anthropic
# executes it and returns results in the same response) so persona replies can ground
# real-world facts in actual search results instead of the model inventing detail.
WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}


def _response_text(response) -> str:
    return "".join(block.text for block in response.content if block.type == "text").strip()


def _parse_json_response(text: str) -> dict:
    """Model responses are instructed to be a bare JSON object, but Claude
    occasionally wraps it in a ```json fence despite that - strip one if present."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?|\n?```$", "", text).strip()
    return json.loads(text)


def create_completion(messages: list, max_tokens: int, tools: list = None):
    """Calls the Anthropic Messages API. Accepts messages in the familiar
    [{"role": "system", ...}, {"role": "user"/"assistant", ...}, ...] shape used
    throughout this file and prompts.py, and splits the leading system entry into
    Anthropic's separate `system` parameter. Turns rate-limit errors into a clean
    429 instead of an unhandled 500 - hit often in dev usage."""
    system = None
    if messages and messages[0]["role"] == "system":
        system = messages[0]["content"]
        messages = messages[1:]
    kwargs = {"model": MODEL, "max_tokens": max_tokens, "messages": messages}
    if system:
        kwargs["system"] = system
    if tools:
        kwargs["tools"] = tools
    try:
        return client.messages.create(**kwargs)
    except anthropic.RateLimitError:
        raise HTTPException(429, "The AI provider's rate limit was reached. Please try again in a few minutes.")


# ---------------------------------------------------------------------------
# Auth (Phase 1)
# ---------------------------------------------------------------------------

def get_current_user(authorization: str = Header(...)) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        return decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")


@app.post("/api/auth/signup")
def signup(email: str, password: str, display_name: str, db=Depends(get_db)):
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(400, "Email already registered")
    user = User(email=email, password_hash=hash_password(password), display_name=display_name)
    db.add(user); db.commit()
    return {"token": create_token(str(user.id)), "user_id": str(user.id)}


@app.post("/api/auth/login")
def login(email: str, password: str, db=Depends(get_db)):
    user = db.query(User).filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_token(str(user.id)), "user_id": str(user.id)}


@app.get("/api/auth/me")
def get_me(user_id: str = Depends(get_current_user), db=Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return {"user_id": str(user.id), "email": user.email, "display_name": user.display_name}


# ---------------------------------------------------------------------------
# Personas (Phase 2) — group_id filter added in Phase 3 once the join table exists
# ---------------------------------------------------------------------------

GENERATE_PERSONA_SYSTEM_PROMPT = """You create realistic synthetic user personas for UX
research from a short description of who the researcher needs.

Given the researcher's description, invent one specific, plausible person who fits it -
not a generic stereotype. Give them a real-sounding name, a specific level of experience,
and 2-5 custom attributes that capture what makes them relevant to the description (their
responsibilities, tools they use, what they care about, pain points) - each attribute
should be a short label mapped to one or two concrete sentences, not a single word.

Respond with ONLY a single JSON object, no other text, in exactly this shape:
{
  "name": "<first and last name>",
  "age": <integer>,
  "industry": "<industry>",
  "education": "<highest relevant degree and field>",
  "profession": "<job title>",
  "role": "<seniority/role label, e.g. Senior, Manager, Individual Contributor>",
  "experience_years": <integer>,
  "custom_attributes": {"<short_label>": "<one or two sentence detail>", ...}
}"""


@app.post("/api/personas/generate")
def generate_persona(description: str, user_id: str = Depends(get_current_user)):
    response = create_completion(
        max_tokens=800,
        messages=[
            {"role": "system", "content": GENERATE_PERSONA_SYSTEM_PROMPT},
            {"role": "user", "content": description},
        ],
    )
    try:
        data = _parse_json_response(_response_text(response) or "{}")
    except json.JSONDecodeError:
        raise HTTPException(502, "Persona generation returned invalid JSON — try again")

    for field in ("age", "experience_years"):
        try:
            data[field] = int(data[field]) if data.get(field) is not None else None
        except (TypeError, ValueError):
            data[field] = None
    if not isinstance(data.get("custom_attributes"), dict):
        data["custom_attributes"] = {}
    return data


@app.post("/api/personas")
def create_persona(payload: dict, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    group_ids = payload.pop("group_ids", None)  # not a Persona column — handled via the join table below
    persona = Persona(researcher_id=user_id, **payload)
    db.add(persona); db.commit(); db.refresh(persona)
    if group_ids:
        for group_id in group_ids:
            group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
            if group:  # silently skip group_ids that don't exist or aren't owned by this researcher
                db.add(PersonaGroupMembership(persona_id=persona.id, group_id=group_id))
        db.commit()
    return _serialize_persona(persona, db)


def _serialize_persona(persona: Persona, db) -> dict:
    """Attaches group_ids to a Persona row so the frontend (GroupManager's
    membership checkboxes) always has current group membership without a
    separate round trip."""
    memberships = db.query(PersonaGroupMembership.group_id).filter_by(persona_id=persona.id).all()
    group_ids = [str(g[0]) for g in memberships]
    data = {c.name: getattr(persona, c.name) for c in persona.__table__.columns}
    data["group_ids"] = group_ids
    return data


@app.get("/api/personas")
def list_personas(group_id: str = None, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    q = db.query(Persona).filter_by(researcher_id=user_id)
    if group_id:
        member_ids = db.query(PersonaGroupMembership.persona_id).filter_by(group_id=group_id)
        q = q.filter(Persona.id.in_(member_ids))
    return [_serialize_persona(p, db) for p in q.all()]


@app.get("/api/personas/{persona_id}")
def get_persona(persona_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")
    return _serialize_persona(persona, db)


@app.put("/api/personas/{persona_id}")
def update_persona(persona_id: str, payload: dict, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")
    payload.pop("group_ids", None)  # not a Persona column; use the group membership endpoints to change groups
    for k, v in payload.items():
        setattr(persona, k, v)
    persona.system_prompt_cache = None  # force rebuild on next chat
    db.commit(); db.refresh(persona)
    return _serialize_persona(persona, db)


@app.delete("/api/personas/{persona_id}")
def delete_persona(persona_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")
    db.query(PersonaGroupMembership).filter_by(persona_id=persona_id).delete()
    db.delete(persona); db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Groups & Membership (Phase 3)
# ---------------------------------------------------------------------------

def _verify_ownership(persona_id, group_id, user_id, db):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
    if not persona or not group:
        raise HTTPException(404, "Persona or group not found")
    return persona, group


@app.post("/api/groups")
def create_group(payload: dict, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona_ids = payload.pop("persona_ids", None)  # not a PersonaGroup column — handled via the join table below
    group = PersonaGroup(researcher_id=user_id, **payload)
    db.add(group); db.commit(); db.refresh(group)
    if persona_ids:
        for persona_id in persona_ids:
            persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
            if persona:  # silently skip persona_ids that don't exist or aren't owned by this researcher
                db.add(PersonaGroupMembership(persona_id=persona_id, group_id=group.id))
        db.commit()
        db.refresh(group)  # commit() expires group's attributes; reload before returning it in the response
    return group


@app.get("/api/groups")
def list_groups(user_id: str = Depends(get_current_user), db=Depends(get_db)):
    groups = db.query(PersonaGroup).filter_by(researcher_id=user_id).all()
    for g in groups:
        g.persona_count = db.query(PersonaGroupMembership).filter_by(group_id=g.id).count()
    return groups


@app.put("/api/groups/{group_id}")
def update_group(group_id: str, payload: dict, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    payload.pop("persona_ids", None)  # not a PersonaGroup column; use the group membership endpoints to change membership
    for k, v in payload.items():
        setattr(group, k, v)
    db.commit(); db.refresh(group)
    return group


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    db.query(PersonaGroupMembership).filter_by(group_id=group_id).delete()
    db.delete(group); db.commit()
    return {"status": "deleted"}


@app.post("/api/personas/{persona_id}/groups/{group_id}")
def add_persona_to_group(persona_id: str, group_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    _verify_ownership(persona_id, group_id, user_id, db)
    existing = db.query(PersonaGroupMembership).filter_by(persona_id=persona_id, group_id=group_id).first()
    if existing:
        return {"status": "already_member"}
    db.add(PersonaGroupMembership(persona_id=persona_id, group_id=group_id))
    db.commit()
    return {"status": "added"}


@app.delete("/api/personas/{persona_id}/groups/{group_id}")
def remove_persona_from_group(persona_id: str, group_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    _verify_ownership(persona_id, group_id, user_id, db)
    db.query(PersonaGroupMembership).filter_by(persona_id=persona_id, group_id=group_id).delete()
    db.commit()
    return {"status": "removed"}


# ---------------------------------------------------------------------------
# Maturity Recommendation (Phase 4)
# ---------------------------------------------------------------------------

MATURITY_SYSTEM_PROMPT = """You review a synthetic user persona for realism and
internal consistency. Never invent specific biographical facts and write them
back silently - only propose suggestions the researcher can review and accept.
Use the tools in order: score, identify gaps, then generate suggestions.

Your final answer (once no more tools are needed) must be a single JSON object,
no other text, in exactly this shape:
{
  "score": <integer 1-10>,
  "suggestions": [
    {
      "suggestion": "<plain-language recommendation>",
      "fields_compared": ["<persona field name>", ...],
      "basis_type": "internal_consistency" | "missing_specificity" | "missing_field",
      "reasoning": "<one sentence tying this suggestion to those exact fields>"
    }
  ]
}
Every suggestion MUST include fields_compared and reasoning. A suggestion with
no traceable field basis must be omitted entirely rather than included without
a source."""


def run_maturity_skill(tool_name: str, tool_input: dict) -> dict:
    """
    Executes one of the three maturity_tools.py tool definitions.
    v1 implementation: lightweight, rule-based Python — not a second model
    call per tool. This keeps the tool-use loop fast and deterministic; the
    model still writes the final natural-language score/suggestions/reasoning
    from these structured findings on its next turn.
    """
    persona = tool_input.get("persona", {})

    if tool_name == "score_persona_maturity":
        filled = sum(1 for v in persona.values() if v not in (None, "", "None"))
        total = len(persona) or 1
        completeness = filled / total
        score = max(1, min(10, round(completeness * 10)))
        return {"score": score, "filled_fields": filled, "total_fields": total}

    if tool_name == "identify_persona_gaps":
        gaps = []
        role = str(persona.get("role", "")).lower()
        experience = persona.get("experience_years")
        try:
            experience = int(experience)
        except (TypeError, ValueError):
            experience = None
        if role in ("director", "vp", "head", "lead") and experience is not None and experience < 5:
            gaps.append(f"role='{persona.get('role')}' with experience_years={experience} — internal inconsistency")
        profession = str(persona.get("profession", "")).strip()
        industry = str(persona.get("industry", "")).strip()
        generic_titles = {"manager", "employee", "worker", "staff"}
        if profession.lower() in generic_titles and industry:
            gaps.append(f"profession='{profession}' is too generic for industry='{industry}'")
        for field in ("education", "custom_attributes"):
            if not persona.get(field):
                gaps.append(f"{field} is missing")
        return {"gaps": gaps}

    if tool_name == "generate_maturity_suggestions":
        # Structured findings only; the model turns these into the final
        # sourced JSON suggestions array per the MATURITY_SYSTEM_PROMPT contract.
        return {"gaps_received": tool_input.get("gaps", []), "persona_echo": persona}

    raise ValueError(f"Unknown maturity tool: {tool_name}")


@app.post("/api/personas/{persona_id}/maturity-check")
def maturity_check(persona_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")

    persona_dict = {c.name: str(getattr(persona, c.name)) for c in persona.__table__.columns}
    messages = [
        {"role": "user", "content": f"Review this persona:\n{json.dumps(persona_dict)}"},
    ]

    while True:
        try:
            response = client.messages.create(
                model=MODEL, max_tokens=1500, system=MATURITY_SYSTEM_PROMPT,
                messages=messages, tools=maturity_tools,
            )
        except anthropic.RateLimitError:
            raise HTTPException(429, "The AI provider's rate limit was reached. Please try again in a few minutes.")

        if response.stop_reason != "tool_use":
            parsed = _parse_json_response(_response_text(response))  # {"score": ..., "suggestions": [...]}

            persona.maturity_score = parsed.get("score")
            persona.maturity_notes = json.dumps(parsed.get("suggestions", []))

            record = MaturityRecommendation(
                persona_id=persona.id,
                score=parsed.get("score"),
                gaps=[s["suggestion"] for s in parsed.get("suggestions", [])],
                suggestions=json.dumps(parsed.get("suggestions", [])),
                source_basis=json.dumps(parsed.get("suggestions", [])),
            )
            db.add(record)
            db.commit()
            return {"score": parsed.get("score"), "suggestions": parsed.get("suggestions", []), "status": "success"}

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = run_maturity_skill(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
        messages.append({"role": "user", "content": tool_results})


# ---------------------------------------------------------------------------
# Agentic Chat (Phase 5)
# ---------------------------------------------------------------------------

def generate_persona_reply(persona: Persona, chat_messages: list) -> dict:
    """Runs one persona's reply for the given conversation (system prompt + history
    already merged into chat_messages minus the system entry, which is added here).
    Shared by 1:1 persona chat and group chat so both get the same web-search
    grounding, GROUNDED_IN parsing, and rate-limit fallback behavior."""
    system_prompt = build_persona_system_prompt(persona)
    try:
        response = client.messages.create(
            model=MODEL, max_tokens=1024, system=system_prompt,
            messages=chat_messages, tools=[WEB_SEARCH_TOOL],
        )
    except anthropic.RateLimitError:
        raise HTTPException(429, "The AI provider's rate limit was reached. Please try again in a few minutes.")

    raw_text = _response_text(response)
    reply, grounded_in = split_reply_and_grounding(raw_text)

    # web_search runs server-side - Anthropic executes the query and returns results
    # as a content block in this same response, no separate tool-result round trip.
    web_sources = []
    for block in response.content:
        if block.type == "web_search_tool_result" and isinstance(block.content, list):
            for result in block.content:
                url = getattr(result, "url", None)
                if url:
                    web_sources.append({"title": getattr(result, "title", None) or url, "url": url})

    return {"reply": reply, "grounded_in": grounded_in, "web_sources": web_sources}


# The researcher's shared "Objective & Output" reference doc (see the Insight Panel's
# button in the frontend) — studied before generating every framework's insight, via
# Google Docs' public plain-text export. Requires the doc to be shared as "Anyone with
# the link" (Viewer); if it isn't reachable, generation just proceeds without it.
OBJECTIVE_DOC_ID = "1kX9Kv9XmwBorhNrH-1KWeEhkSmrLP98jpz3u-_F5Zvs"
OBJECTIVE_DOC_EXPORT_URL = f"https://docs.google.com/document/d/{OBJECTIVE_DOC_ID}/export?format=txt"


def fetch_objective_doc_content() -> str:
    try:
        response = httpx.get(OBJECTIVE_DOC_EXPORT_URL, follow_redirects=True, timeout=10)
        if response.status_code != 200:
            return None
        return response.text.strip() or None
    except httpx.HTTPError:
        return None


# Belt-and-suspenders against the model tacking on a "Design Insight" (or similarly
# named) section despite build_insight_prompt explicitly telling it not to -
# smaller models don't always honor "output only the table" reliably. Strips any
# heading/bold-labeled section titled roughly "design insight" through the end of
# the response.
_DESIGN_INSIGHT_SECTION_RE = re.compile(
    r"\n+(?:#{1,6}\s*|\*\*)?design insight\b.*", re.IGNORECASE | re.DOTALL
)


def _strip_design_insight(text: str) -> str:
    return _DESIGN_INSIGHT_SECTION_RE.sub("", text).strip()


def generate_insight(framework: str, transcript: str, persona_names: list,
                      user_id: str = None, db=None, transcript_label: str = "conversation transcript") -> str:
    """Applies a named UX research framework (Empathy Mapping, User Journey Mapping,
    etc.) to an already-formatted "Speaker: text" transcript - or, for a framework
    whose Input is a prior framework's output (e.g. JTBD Analysis reads the Empathy
    Mapping insight instead of the raw chat), to that insight's Markdown table
    instead; transcript_label should describe which one it actually is (see
    build_insight_prompt). Plain completion - no web-search tooling needed, it only
    reasons over the conversation/insight already gathered."""
    doc_content = fetch_objective_doc_content()
    scope_ref = load_scope_reference(framework) or {}
    focus = "\n\n---\n\n".join(part for part in (doc_content, scope_ref.get("objective")) if part) or None

    messages = build_insight_prompt(framework, transcript, persona_names,
                                     focus=focus, helps_to_identify=scope_ref.get("helps_to_identify"),
                                     output_format=scope_ref.get("output_format"), transcript_label=transcript_label)
    # 1800 covers every other framework's single short table comfortably, but
    # Product Design Insight's combined output (a 7-row table, 14 per-KPI
    # labeled blocks, plus its two write-up sections) runs far longer - and
    # part of this same budget goes to the model's internal reasoning before
    # any visible text, so it was hitting the cap mid-way through the KPI
    # table and never reaching the write-up sections at the end.
    max_tokens = 6000 if framework == "Product Design Insight" else 1800
    response = create_completion(messages=messages, max_tokens=max_tokens)
    content = _response_text(response)
    # Product Design Insight is the one framework whose own legitimate output
    # discusses "Design Insight" throughout (its final structure section is
    # literally titled that) - stripping from the first such heading would
    # gut its real content instead of just removing an unwanted bonus section.
    if framework == "Product Design Insight":
        return content
    return _strip_design_insight(content)


@app.post("/api/personas/{persona_id}/chat")
def chat_with_persona(persona_id: str, message: str, session_id: str = None,
                       user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")

    if not session_id:
        session = ChatSession(persona_id=persona_id, researcher_id=user_id, title=message[:50])
        db.add(session); db.commit(); db.refresh(session)
        session_id = str(session.id)

    db.add(Message(session_id=session_id, role="researcher", text=message)); db.commit()

    # Use only the clean reply text (not the GROUNDED_IN line) for conversation
    # history, so the metadata never leaks into what the model sees as its own prior turns.
    history = db.query(Message).filter_by(session_id=session_id).order_by(Message.created_at).all()
    history_messages = [
        {"role": "user" if m.role == "researcher" else "assistant", "content": m.text}
        for m in history
    ]

    result = generate_persona_reply(persona, history_messages)

    db.add(Message(session_id=session_id, role="persona", text=result["reply"],
                    grounded_in=result["grounded_in"], web_sources=result["web_sources"]))
    db.commit()
    return {**result, "session_id": session_id}


@app.get("/api/chat/sessions/{persona_id}")
def list_sessions_for_persona(persona_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")
    return db.query(ChatSession).filter_by(persona_id=persona_id, researcher_id=user_id)\
        .order_by(ChatSession.created_at.desc()).all()


@app.get("/api/chat/sessions/{session_id}/messages")
def get_session_messages(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return db.query(Message).filter_by(session_id=session_id).order_by(Message.created_at).all()


@app.delete("/api/chat/sessions/{session_id}")
def delete_session(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.query(Message).filter_by(session_id=session_id).delete()
    db.delete(session); db.commit()
    return {"status": "deleted"}


@app.get("/api/chat/sessions/{session_id}/insight")
def get_session_insight(session_id: str, framework: str,
                         user_id: str = Depends(get_current_user), db=Depends(get_db)):
    """Returns a previously generated insight for this (session, framework),
    if one exists, so the frontend can show it again - e.g. after the
    researcher navigates to another chat/persona/feature and comes back -
    without re-running the LLM. Returns null if nothing's been generated yet."""
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    record = db.query(SessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if not record or not record.content:
        return None
    return {"framework": framework, "insight": record.content, "validated_rows": record.validated_rows or []}


def _parse_markdown_table(markdown: str):
    """Mirrors parseMarkdownTable in InsightDrawer.jsx - the model is instructed to
    output nothing but a single GFM table, so parsing is just splitting "|"-
    delimited lines. Returns (headers, rows), where rows is None if nothing
    parsed out."""
    if not markdown:
        return None, None
    lines = [line for line in markdown.strip().split("\n") if line.strip().startswith("|")]
    if len(lines) < 2:
        return None, None

    def split_row(line):
        line = line.strip()
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        return [cell.strip() for cell in line.split("|")]

    headers = split_row(lines[0])
    rows = [row for row in (split_row(line) for line in lines[2:]) if any(row)]
    return headers, (rows or None)


def _row_validation_key(row: list) -> str:
    """Mirrors rowValidationKey in InsightDrawer.jsx - a row's identity for
    "manually validated" purposes, based on its content."""
    return " ".join(row)


# Mirrors LEGACY_VERIFIED_KEYS/verifiedKey in InsightDrawer.jsx - the sentinel
# row-key marking a whole generated table as researcher-verified, for every
# framework except Empathy Mapping (which has its own per-row Validation
# column instead - see _require_prior_insight below). JTBD Analysis and User
# Journey Mapping keep their original literal keys for backward compatibility
# with already-saved validated_rows; every later framework in the chain gets
# a key derived from its own name.
_LEGACY_VERIFIED_KEYS = {
    "JTBD Analysis": "__jtbd_verified__",
    "User Journey Mapping": "__ujm_verified__",
}


def _verified_key(framework: str) -> str:
    return _LEGACY_VERIFIED_KEYS.get(framework) or f"__verified__{framework}__"


def _insight_is_verified(model, session_id: str, db, framework: str) -> bool:
    """True if `framework`'s insight for this session exists and has been fully
    researcher-verified - every row individually checked for Empathy Mapping
    (its own per-row Validation column - see _row_validation_key), or the
    single "Verified <framework>" checkbox for every other framework in the
    chain (see _verified_key)."""
    record = db.query(model).filter_by(session_id=session_id, framework=framework).first()
    if not record or not record.content:
        return False
    validated_keys = set(record.validated_rows or [])
    # Empathy Mapping is checked off row-by-row (its own per-row Validation
    # column), so it specifically needs rows to exist to be verifiable at all.
    # Every other framework uses the single whole-content sentinel key, which
    # doesn't depend on the content being a table (e.g. Product Design
    # Insight's per-KPI write-up has no table at all).
    if framework == "Empathy Mapping":
        _, rows = _parse_markdown_table(record.content)
        return bool(rows) and all(_row_validation_key(row) in validated_keys for row in rows)
    return _verified_key(framework) in validated_keys


def _missing_chain(model, session_id: str, db, framework: str) -> list:
    """Walks backward from `framework` through the full chain (see
    prior_framework in prompts.py) and returns every ancestor that hasn't been
    generated yet or hasn't been fully verified, oldest first - so a researcher
    who jumps straight to a late-chain framework (e.g. clicking System Mapping
    on a brand-new chat) sees the whole remaining path at once, instead of a
    single "generate Pain Point + Friction Analysis first" error that then
    cascades into a new one-step-back error each time they follow it. Also
    what the frontend's locked/unlocked framework-card buttons are driven by
    (see get_session_insight_status)."""
    missing = []
    current = framework
    while True:
        prior = prior_framework(current)
        if not prior:
            break
        if not _insight_is_verified(model, session_id, db, prior):
            missing.append(prior)
        current = prior
    missing.reverse()
    return missing


def _require_prior_insight(model, session_id: str, db, framework: str):
    """Looks up the framework immediately before `framework` in scope/00_overview.md's
    chain (see prior_framework in prompts.py) and returns (content, transcript_label)
    for generate_insight to use as input, raising a clear 400 - listing every
    still-missing-or-unverified ancestor in the chain, not just the immediate one -
    if the researcher hasn't completed the earlier stages yet. An unverified AI
    claim shouldn't get built on top of for the next stage of analysis. Returns
    (None, None) for Empathy Mapping, whose input is the raw chat transcript, not
    a prior stage's output."""
    prior = prior_framework(framework)
    if not prior:
        return None, None

    missing = _missing_chain(model, session_id, db, framework)
    if missing:
        chain_str = " → ".join(missing)
        stages = "stage" if len(missing) == 1 else "stages"
        raise HTTPException(
            400,
            f"{framework} is built on a chain of earlier {stages} for this chat. "
            f"Still missing or not yet verified: {chain_str}. Start with {missing[0]}.",
        )

    record = db.query(model).filter_by(session_id=session_id, framework=prior).first()
    return record.content, f"{prior} insight"


@app.get("/api/chat/sessions/{session_id}/insight-status")
def get_session_insight_status(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    """For every framework in the chain (see FRAMEWORK_CHAIN in prompts.py), tells
    the frontend whether that framework's card should be clickable yet - Empathy
    Mapping always is, and every later one only once every earlier stage has been
    generated and researcher-verified (mirrors _missing_chain, the same check
    generating it would actually enforce, so a locked button never disagrees with
    what clicking it would do). `reason` is the human-readable next step to show
    as the button's tooltip when it's locked; null once unlocked. `generated`/
    `verified` describe this framework's own insight (not its prerequisites) -
    together with `unlocked` they're what the frontend's small-print status
    legend (Insight Generated & Verified / & Not Verified / Ready to Generate /
    Generate Previous Insight) is computed from."""
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    status = {}
    for framework in FRAMEWORK_CHAIN:
        missing = _missing_chain(SessionInsight, session_id, db, framework)
        record = db.query(SessionInsight).filter_by(session_id=session_id, framework=framework).first()
        status[framework] = {
            "unlocked": not missing,
            "reason": f"Generate and verify {missing[0]} first" if missing else None,
            "generated": bool(record and record.content),
            "verified": _insight_is_verified(SessionInsight, session_id, db, framework),
        }
    return status


@app.post("/api/chat/sessions/{session_id}/insight")
def generate_session_insight(session_id: str, framework: str,
                              user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    persona = db.query(Persona).filter_by(id=session.persona_id).first()
    persona_name = persona.name if persona else "Persona"

    prior_content, prior_label = _require_prior_insight(SessionInsight, session_id, db, framework)
    if prior_content is not None:
        insight = generate_insight(framework, prior_content, [persona_name], user_id, db,
                                    transcript_label=prior_label)
    else:
        messages = db.query(Message).filter_by(session_id=session_id).order_by(Message.created_at).all()
        if not messages:
            raise HTTPException(400, "This chat has no messages yet")
        transcript = "\n\n".join(
            f"{'Researcher' if m.role == 'researcher' else persona_name}: {m.text}" for m in messages
        )
        insight = generate_insight(framework, transcript, [persona_name], user_id, db)

    record = db.query(SessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.content = insight
    else:
        db.add(SessionInsight(session_id=session_id, framework=framework, content=insight, validated_rows=[]))
    db.commit()

    return {"framework": framework, "insight": insight}


@app.put("/api/chat/sessions/{session_id}/insight")
def save_session_insight(session_id: str, framework: str, payload: dict,
                          user_id: str = Depends(get_current_user), db=Depends(get_db)):
    """Explicit manual save from the Insight Panel's "Save" button - persists
    exactly what's currently displayed (the researcher may have used "Remove
    let me validate" to drop not-yet-validated rows first) as the new saved
    content, plus the current validated-row keys, so this exact state - not a
    re-parse of the original LLM output - is what's shown again next time."""
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    content = payload.get("content")
    validated_rows = payload.get("validated_rows")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(400, "content must be a non-empty string")
    if not isinstance(validated_rows, list):
        raise HTTPException(400, "validated_rows must be a list")

    record = db.query(SessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.content = content
        record.validated_rows = validated_rows
    else:
        db.add(SessionInsight(session_id=session_id, framework=framework, content=content, validated_rows=validated_rows))
    db.commit()
    return {"status": "saved"}


@app.put("/api/chat/sessions/{session_id}/insight/validated-rows")
def save_session_insight_validated_rows(session_id: str, framework: str, payload: dict,
                                         user_id: str = Depends(get_current_user), db=Depends(get_db)):
    """Persists which rows the researcher has manually validated for this
    (session, framework), so those checkmarks survive navigating away and
    back too, not just a regenerate within the same page visit."""
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    validated_rows = payload.get("validated_rows")
    if not isinstance(validated_rows, list):
        raise HTTPException(400, "validated_rows must be a list")

    record = db.query(SessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.validated_rows = validated_rows
    else:
        db.add(SessionInsight(session_id=session_id, framework=framework, content=None, validated_rows=validated_rows))
    db.commit()
    return {"status": "saved"}


# ---------------------------------------------------------------------------
# Group Chat — one message broadcast to every persona in a group, each
# replying independently (their own history, not seeing each other's replies)
# so researchers can compare perspectives side by side, like a virtual panel.
# ---------------------------------------------------------------------------

@app.post("/api/groups/{group_id}/chat")
def chat_with_group(group_id: str, message: str, session_id: str = None,
                     user_id: str = Depends(get_current_user), db=Depends(get_db)):
    group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
    if not group:
        raise HTTPException(404, "Group not found")

    member_ids = db.query(PersonaGroupMembership.persona_id).filter_by(group_id=group_id)
    personas = db.query(Persona).filter(Persona.id.in_(member_ids), Persona.researcher_id == user_id).all()
    if not personas:
        raise HTTPException(400, "This group has no personas to chat with")

    if not session_id:
        session = GroupChatSession(group_id=group_id, researcher_id=user_id, title=message[:50])
        db.add(session); db.commit(); db.refresh(session)
        session_id = str(session.id)

    db.add(GroupMessage(session_id=session_id, role="researcher", text=message)); db.commit()

    replies = []
    for persona in personas:
        # Each persona only sees the shared researcher prompts plus its own prior
        # replies — not the other personas' answers — so responses stay independent.
        history = db.query(GroupMessage).filter(
            GroupMessage.session_id == session_id,
            (GroupMessage.role == "researcher") | (GroupMessage.persona_id == persona.id),
        ).order_by(GroupMessage.created_at).all()
        history_messages = [
            {"role": "user" if m.role == "researcher" else "assistant", "content": m.text}
            for m in history
        ]

        result = generate_persona_reply(persona, history_messages)

        db.add(GroupMessage(session_id=session_id, persona_id=persona.id, role="persona", text=result["reply"],
                             grounded_in=result["grounded_in"], web_sources=result["web_sources"]))
        db.commit()
        replies.append({"persona_id": str(persona.id), "persona_name": persona.name, **result})

    return {"replies": replies, "session_id": session_id}


@app.get("/api/groups/{group_id}/chat/sessions")
def list_sessions_for_group(group_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    group = db.query(PersonaGroup).filter_by(id=group_id, researcher_id=user_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    return db.query(GroupChatSession).filter_by(group_id=group_id, researcher_id=user_id)\
        .order_by(GroupChatSession.created_at.desc()).all()


@app.get("/api/group-chat/sessions/{session_id}/messages")
def get_group_session_messages(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    messages = db.query(GroupMessage).filter_by(session_id=session_id).order_by(GroupMessage.created_at).all()
    results = []
    for m in messages:
        data = {c.name: getattr(m, c.name) for c in m.__table__.columns}
        if m.persona_id:
            persona = db.query(Persona).filter_by(id=m.persona_id).first()
            data["persona_name"] = persona.name if persona else None
        results.append(data)
    return results


@app.delete("/api/group-chat/sessions/{session_id}")
def delete_group_session(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.query(GroupMessage).filter_by(session_id=session_id).delete()
    db.delete(session); db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Framework Objective & Output — read-only view of the researcher's scope/*.md
# reference doc for this framework (see load_scope_reference in prompts.py),
# the same content generate_insight above studies/reproduces when generating.
# No per-researcher customization: the doc is the single source of truth.
# ---------------------------------------------------------------------------

@app.get("/api/framework-objectives")
def get_framework_objective(framework: str, user_id: str = Depends(get_current_user)):
    scope_ref = load_scope_reference(framework)
    if not scope_ref:
        return None
    prior = prior_framework(framework)
    return {
        "framework": framework,
        # None for Empathy Mapping - its real input is this chat's own transcript,
        # not a prior stage's output, so the frontend falls back to showing that.
        "input": f"Output of {prior}" if prior else None,
        "objective": scope_ref.get("objective") or "",
        # Sent as raw Markdown (not parsed into a table-only grid) so a section
        # that mixes a table with prose - headings, bold lines, a numbered list
        # (e.g. Product Design Insight's Evidence/Pattern/Design Implications) -
        # renders in full on the frontend instead of losing everything past the
        # first table. See MarkdownPreview in ObjectiveOutputDrawer.jsx.
        "helpsToIdentify": scope_ref.get("helps_to_identify") or "",
        "outputFormat": scope_ref.get("output_format") or "",
    }


@app.get("/api/group-chat/sessions/{session_id}/insight")
def get_group_session_insight(session_id: str, framework: str,
                               user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    record = db.query(GroupSessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if not record or not record.content:
        return None
    return {"framework": framework, "insight": record.content, "validated_rows": record.validated_rows or []}


@app.get("/api/group-chat/sessions/{session_id}/insight-status")
def get_group_session_insight_status(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    """Group-chat equivalent of get_session_insight_status."""
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    status = {}
    for framework in FRAMEWORK_CHAIN:
        missing = _missing_chain(GroupSessionInsight, session_id, db, framework)
        record = db.query(GroupSessionInsight).filter_by(session_id=session_id, framework=framework).first()
        status[framework] = {
            "unlocked": not missing,
            "reason": f"Generate and verify {missing[0]} first" if missing else None,
            "generated": bool(record and record.content),
            "verified": _insight_is_verified(GroupSessionInsight, session_id, db, framework),
        }
    return status


@app.post("/api/group-chat/sessions/{session_id}/insight")
def generate_group_session_insight(session_id: str, framework: str,
                                    user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    prior_content, prior_label = _require_prior_insight(GroupSessionInsight, session_id, db, framework)
    if prior_content is not None:
        insight = generate_insight(framework, prior_content, [], user_id, db, transcript_label=prior_label)
    else:
        messages = db.query(GroupMessage).filter_by(session_id=session_id).order_by(GroupMessage.created_at).all()
        if not messages:
            raise HTTPException(400, "This chat has no messages yet")

        persona_names = {}
        transcript_lines = []
        for m in messages:
            if m.role == "researcher":
                speaker = "Researcher"
            else:
                if m.persona_id not in persona_names:
                    persona = db.query(Persona).filter_by(id=m.persona_id).first()
                    persona_names[m.persona_id] = persona.name if persona else "Persona"
                speaker = persona_names[m.persona_id]
            transcript_lines.append(f"{speaker}: {m.text}")

        # Distinct persona names in first-seen order, so a two-persona group produces one
        # consolidated map instead of a separate one per persona (see build_insight_prompt).
        distinct_names = list(dict.fromkeys(persona_names.values()))
        insight = generate_insight(framework, "\n\n".join(transcript_lines), distinct_names, user_id, db)

    record = db.query(GroupSessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.content = insight
    else:
        db.add(GroupSessionInsight(session_id=session_id, framework=framework, content=insight, validated_rows=[]))
    db.commit()

    return {"framework": framework, "insight": insight}


@app.put("/api/group-chat/sessions/{session_id}/insight")
def save_group_session_insight(session_id: str, framework: str, payload: dict,
                                user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    content = payload.get("content")
    validated_rows = payload.get("validated_rows")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(400, "content must be a non-empty string")
    if not isinstance(validated_rows, list):
        raise HTTPException(400, "validated_rows must be a list")

    record = db.query(GroupSessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.content = content
        record.validated_rows = validated_rows
    else:
        db.add(GroupSessionInsight(session_id=session_id, framework=framework, content=content, validated_rows=validated_rows))
    db.commit()
    return {"status": "saved"}


@app.put("/api/group-chat/sessions/{session_id}/insight/validated-rows")
def save_group_session_insight_validated_rows(session_id: str, framework: str, payload: dict,
                                               user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(GroupChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    validated_rows = payload.get("validated_rows")
    if not isinstance(validated_rows, list):
        raise HTTPException(400, "validated_rows must be a list")

    record = db.query(GroupSessionInsight).filter_by(session_id=session_id, framework=framework).first()
    if record:
        record.validated_rows = validated_rows
    else:
        db.add(GroupSessionInsight(session_id=session_id, framework=framework, content=None, validated_rows=validated_rows))
    db.commit()
    return {"status": "saved"}


# ---------------------------------------------------------------------------
# Export (Phase 6)
# ---------------------------------------------------------------------------

@app.get("/api/personas/{persona_id}/export")
def export_persona(persona_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    persona = db.query(Persona).filter_by(id=persona_id, researcher_id=user_id).first()
    if not persona:
        raise HTTPException(404, "Persona not found")

    memberships = db.query(PersonaGroupMembership).filter_by(persona_id=persona_id).all()
    group_ids = [str(m.group_id) for m in memberships]
    maturity_history = db.query(MaturityRecommendation).filter_by(persona_id=persona_id)\
        .order_by(MaturityRecommendation.created_at).all()

    export = {
        "persona": {c.name: str(getattr(persona, c.name)) for c in persona.__table__.columns},
        "group_ids": group_ids,
        "maturity_history": [
            {
                "score": m.score,
                "gaps": m.gaps,
                "suggestions": json.loads(m.suggestions) if m.suggestions else [],
                "source_basis": json.loads(m.source_basis) if m.source_basis else [],
                "created_at": str(m.created_at),
            }
            for m in maturity_history
        ],
        "exported_at": str(datetime.datetime.utcnow()),
    }
    filename = f"persona-{persona.name.replace(' ', '_')}-{persona_id[:8]}.json"
    return JSONResponse(
        content=export,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/chat/sessions/{session_id}/export")
def export_transcript(session_id: str, user_id: str = Depends(get_current_user), db=Depends(get_db)):
    session = db.query(ChatSession).filter_by(id=session_id, researcher_id=user_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    persona = db.query(Persona).filter_by(id=session.persona_id).first()
    messages = db.query(Message).filter_by(session_id=session_id).order_by(Message.created_at).all()

    lines = [f"# Chat Transcript — {persona.name}", f"Session: {session.title or session_id}", ""]
    for m in messages:
        speaker = "Researcher" if m.role == "researcher" else persona.name
        lines.append(f"**{speaker}:** {m.text}")
        if m.role == "persona" and m.grounded_in:
            lines.append(f"*Grounded in: {', '.join(m.grounded_in)}*")
        lines.append("")

    transcript = "\n".join(lines)
    filename = f"transcript-{persona.name.replace(' ', '_')}-{session_id[:8]}.md"
    return PlainTextResponse(
        content=transcript,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/")
def read_root():
    return {"message": "Synthetic User Chatbot Portal API is running"}