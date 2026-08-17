
tools = [
    {
        "name": "score_persona_maturity",
        "description": "Score persona maturity 1-10 based on internal consistency.",
        "input_schema": {
            "type": "object",
            "properties": {"persona": {"type": "object"}},
            "required": ["persona"]
        }
    },
    {
        "name": "identify_persona_gaps",
        "description": "List missing or generic fields and inconsistencies.",
        "input_schema": {
            "type": "object",
            "properties": {"persona": {"type": "object"}},
            "required": ["persona"]
        }
    },
    {
        "name": "generate_maturity_suggestions",
        "description": (
            "Write field-level suggestions to improve persona realism, each paired with a "
            "traceable source basis so the researcher can see exactly why it was flagged. "
            "Each returned suggestion must include: suggestion (text), fields_compared "
            "(array of persona field names), basis_type (one of: internal_consistency | "
            "missing_specificity | missing_field), and reasoning (one sentence tying the "
            "suggestion to those exact fields). A suggestion missing any of these four is "
            "invalid and must not be returned."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "gaps": {"type": "array", "items": {"type": "string"}},
                "persona": {"type": "object"}
            },
            "required": ["gaps", "persona"]
        }
    }
]

if __name__ == "__main__":
    for t in tools:
        assert "name" in t and "input_schema" in t
        print(f"✅ {t['name']}")
