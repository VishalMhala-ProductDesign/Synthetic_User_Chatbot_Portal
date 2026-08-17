
def build_persona_system_prompt(persona) -> str:
    custom = persona.custom_attributes or {}
    custom_lines = "\n".join(f"- {k}: {v}" for k, v in custom.items())
    return f"""You are role-playing as a synthetic user for research purposes.

Name: {persona.name}
Age: {persona.age}
Industry: {persona.industry}
Profession / Role: {persona.profession} ({persona.role})
Education: {persona.education}
Experience: {persona.experience_years} years
{custom_lines}

Answer every question the way this specific person would - vocabulary,
priorities, and technical depth should match their background. If asked
directly whether you are an AI, answer honestly. Do not break character
for any other reason.

When an answer covers multiple distinct items, steps, or comparisons,
structure it with Markdown - headings, bullet or numbered lists, and
tables where useful - so a researcher can scan it quickly. Keep shorter,
conversational answers as plain prose. Formatting should still read in
this person's own voice and technical level, not as a generic report.

You have web search available. Use it whenever a question calls for real
facts, terminology, standards, or domain/industry specifics that go beyond
what's listed above - never invent specifics you're unsure of. Fold what
you find into your answer in this person's own voice; do not paste search
results verbatim or cite them like a report.

After your in-character reply, on a new line, output exactly:
GROUNDED_IN: <comma-separated persona fields above that most directly shaped
this specific answer>
Only list fields that actually influenced this answer. This line is
metadata for the researcher's transparency, never part of your in-character
voice."""


def split_reply_and_grounding(raw_text: str):
    if "GROUNDED_IN:" in raw_text:
        reply, grounding_line = raw_text.rsplit("GROUNDED_IN:", 1)
        grounded_in = [f.strip() for f in grounding_line.strip().split(",") if f.strip()]
        return reply.strip(), grounded_in
    return raw_text.strip(), []


DEFAULT_OBJECTIVES = {
    "Empathy Mapping": (
        "Understand the user's perspective by capturing what they think, feel, "
        "say, and do in a specific situation, so that design decisions are "
        "grounded in real user needs and behaviours."
    ),
    "JTBD Analysis": (
        "Understand the fundamental job the user is trying to accomplish, "
        "independent of the product or solution they currently use."
    ),
    "User Journey Mapping": (
        "Understand the user's complete experience across a process, identify "
        "friction and unmet needs, and discover opportunities for improvement "
        "or innovation."
    ),
    "Task Flow Analysis": (
        "Understand exactly how a user completes a specific task, identify "
        "unnecessary steps, friction, decisions, and errors, and determine how "
        "the task can be made simpler and more efficient."
    ),
}


# Mirrors the "Helps to identify" grid in the Objective & Output overlay -
# only used as a fallback for a framework the researcher hasn't filled that
# grid in for yet (see effective_helps_to_identify below).
DEFAULT_HELPS_TO_IDENTIFY = {
    "Task Flow Analysis": """| Objective | What you learn |
| --- | --- |
| Understand the task | What the user is trying to accomplish |
| Break down the steps | Every action required to complete the task |
| Identify decision points | Where the user must choose or make a judgment |
| Find friction | Where the task becomes difficult, slow, or confusing |
| Identify unnecessary steps | Repetition, redundant inputs, extra navigation |
| Identify dependencies | Data, systems, people, or information needed |
| Find errors & failure points | Where users can make mistakes or get blocked |
| Identify optimization opportunities | Where UX, automation, or AI can improve the task |""",
}


# The "Output" grid shown in the Objective & Output overlay - a blank,
# numbered template of the exact layout the finished analysis should be
# poured into (see the researcher's reference doc). Only used as a fallback
# for a framework the researcher hasn't filled that grid in for yet.
DEFAULT_OUTPUT_FORMATS = {
    "Task Flow Analysis": [
        ["Step", "User Action", "Decision", "Friction", "Potential Error", "Optimization Opportunity"],
        *[[str(i), "", "", "", "", ""] for i in range(1, 11)],
    ],
}


# A worked example for calibration only - shows the model the expected rigor and
# how Validation ratings get assigned, never content to copy. Sourced from the
# researcher's own reference doc (a different transcript, personas Ethan and Tim).
DEFAULT_EXAMPLES = {
    "Empathy Mapping": """| Empathy | Generated Point | Evidence from feedback | Validation |
| --- | --- | --- | --- |
| THINKS | Concerns about data quality and synchronization | Ethan explicitly mentions data quality gaps, missing timestamps, bad sensor calibration, mismatched formats, latency, and model synchronization issues. | Strongly Supported |
| THINKS | Uncertainty about simulation runs and model validation | Ethan mentions convergence failures and model drift; Tim says simulation/model validation is complex and uncertain. | Supported |
| THINKS | Importance of effective stakeholder communication and coordination | Both personas explicitly discuss stakeholder communication, alignment, and coordination. | Strongly Supported |
| THINKS | Desire for more automation and specialized tools | Ethan discusses automation, cloud-native pipelines, and tool integration; Tim explicitly mentions automation and specialized tools. | Supported |
| THINKS | Need for continuous learning and staying up-to-date | Tim explicitly says continuous learning is necessary to address post-implementation issues. | Supported |
| FEELS | Frustration with time-consuming and tedious tasks | Tim explicitly describes data collection/cleaning as time-consuming and tedious; Ethan calls several activities repetitive chores. | Strongly Supported |
| FEELS | Anxiety about meeting regulatory requirements and navigating permitting | Tim explicitly describes frustration with regulatory processes and ensuring requirements are met. | Supported |
| FEELS | Overwhelmed by workflow complexity and continuous monitoring | Tim describes complexity and continuous monitoring as resource-intensive; however, "overwhelmed" is stronger than the actual feedback. | Partially Supported |
| FEELS | Satisfaction with ability to prioritize tasks and manage time effectively | The feedback says Tim uses prioritization and time management as a coping strategy, but does not explicitly say he feels satisfied. | Partially Supported |
| FEELS | Confidence in ability to engage stakeholders effectively | Tim says he engages stakeholders early and often, but the feedback does not explicitly state that he feels confident. | Partially Supported |
| SAYS | "Data quality gaps are a major pain point" | Very strongly supported by Ethan's statement that data quality gaps are among the biggest headaches. | Strongly Supported |
| SAYS | "Simulation runs and model validation can be computationally intensive" | Tim explicitly says simulations/model validation can be computationally intensive. | Supported |
| SAYS | "Effective stakeholder communication and coordination is crucial" | Both personas emphasize stakeholder communication and alignment. | Strongly Supported |
| SAYS | "Regulatory expertise is essential for navigating the permitting process" | Tim explicitly says he works with regulatory experts to stay aware of requirements. | Supported |
| SAYS | "Continuous learning is necessary to stay up-to-date..." | This is directly supported by Tim's response. | Strongly Supported |
| DOES | Uses automation and specialized tools | Directly supported. | Strongly Supported |
| DOES | Prioritizes tasks and manages time effectively | Directly supported. | Strongly Supported |
| DOES | Engages stakeholders early and often | Directly supported. | Strongly Supported |
| DOES | Works closely with regulatory experts | Directly supported. | Strongly Supported |
| DOES | Stays up-to-date with industry developments | Directly supported. | Strongly Supported |""",
    "JTBD Analysis": """| Empathy Evidence | Pattern | Need / Motivation | Job | Goal / Outcome |
| --- | --- | --- | --- | --- |
| Thinks: concerned about data quality + Feels: frustrated by tedious data work + Says: "data quality is a pain" + Does: uses specialized tools | Data preparation requires significant effort | Confidence in data reliability | Prepare and validate reliable simulation data | Trust simulation results |
| Thinks: uncertain about simulation/model validation + Feels: overwhelmed by complexity + Says: "computationally intensive" + Does: uses tools | Validation is complex and resource-intensive | Confidence in model/results | Validate simulation models efficiently | Obtain trustworthy results |
| Thinks: stakeholder communication is important + Feels: confident in communication + Does: engages stakeholders early | Stakeholder alignment requires continuous coordination | Alignment and shared understanding | Communicate findings and coordinate stakeholders | Achieve stakeholder alignment |
| Thinks: regulatory requirements are important + Feels: concerned about permitting + Does: works with regulatory experts | Regulatory compliance requires specialized knowledge | Confidence in compliance | Navigate regulatory requirements | Avoid compliance/permitting issues |
| Thinks: wants automation + Feels: frustrated by tedious work + Does: uses specialized tools | Repetitive work consumes valuable time | Reduce manual effort | Automate repetitive activities | Improve efficiency |""",
    "User Journey Mapping": """| Journey Stage | User Goal | Activities / Actions | THINKS | FEELS | Pain Points / Friction | Key Decision | Opportunity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Prepare | Get everything ready | Gather data, models, requirements | "Do I have all the right data?" | Concerned | Missing/inconsistent data | Is the data ready? | Automated data-quality checks |
| 2. Validate Data | Ensure data is reliable | Check quality, timestamps, synchronization | "Can I trust this data?" | Frustrated | Manual validation, synchronization issues | Is data good enough? | AI-assisted validation |
| 3. Configure Model | Prepare simulation | Configure model and parameters | "Are my assumptions correct?" | Uncertain | Complex configuration | Is the model ready? | AI configuration assistance |
| 4. Run Simulation | Generate results | Execute simulation, monitor run | "Why is this taking so long?" | Frustrated | Computational intensity / failures | Did the simulation run successfully? | Intelligent monitoring / failure prediction |
| 5. Validate Results | Trust the output | Review results, investigate anomalies | "Can I rely on these results?" | Cautious | Model drift, unexpected results | Are results valid? | AI anomaly detection + explanation |
| 6. Analyse Scenarios | Understand implications | Compare scenarios and outcomes | "Which scenario is better?" | Analytical | Large amount of information | Which option should I recommend? | AI scenario comparison |
| 7. Communicate | Align stakeholders | Share findings and recommendations | "How do I explain this?" | Responsible | Stakeholder coordination | What should I recommend? | AI-generated insights / summaries |
| 8. Monitor / Follow-up | Ensure continued performance | Monitor outcomes, address issues | "Has anything changed?" | Alert / attentive | Continuous monitoring | Does intervention need to happen? | AI monitoring and alerts |""",
    "Task Flow Analysis": """| Step | User Action | Decision | Friction | Potential Error | Optimization Opportunity |
| --- | --- | --- | --- | --- | --- |
| 1. Gather Data | Collect data from different sources | Do I have all required data? | Data spread across systems/files | Missing dataset | Create a centralized data checklist |
| 2. Import Data | Upload/import datasets | Is the data format compatible? | Different formats and structures | Import failure / wrong mapping | Automated format detection & mapping |
| 3. Check Data Quality | Review completeness and quality | Is the data reliable enough? | Manual checking is time-consuming | Missing values / incorrect values | AI-powered data-quality checks |
| 4. Check Synchronization | Compare timestamps and datasets | Is the data synchronized? | Difficult to identify inconsistencies | Misaligned timestamps | Automated synchronization detection |
| 5. Resolve Issues | Fix missing/inconsistent data | Can I proceed? | Requires investigation and rework | Incorrect correction | AI recommends corrective actions |
| 6. Configure Model | Apply validated data to model | Is the model ready? | Complex configuration | Incorrect parameter | Intelligent configuration assistance |
| 7. Run Simulation | Start simulation | Did the simulation complete successfully? | Computationally intensive | Run failure / convergence issue | Predictive run monitoring |
| 8. Validate Results | Review simulation output | Can I trust the results? | Complex result validation | Missed anomaly / model drift | AI anomaly detection + explanation |
| 9. Proceed to Analysis | Use validated results for scenario analysis | Are results good enough for decision-making? | Need confidence before proceeding | Decision based on unreliable output | AI confidence / validation summary |""",
}


GRID_GUIDANCE = {
    "Empathy Mapping": (
        "Rows grouped by quadrant, in this order: Thinks, Feels, Says, Does - "
        "one or more rows per quadrant, each a distinct empathy insight (do not "
        "collapse a quadrant to a single row if the transcript supports several "
        "insights). Columns: Empathy (the quadrant: Thinks/Feels/Says/Does) | "
        "Generated Point (the empathy insight) | Evidence from feedback (the "
        "transcript quote or behavior that backs it) | Validation (Strongly "
        "Supported / Supported / Partially Supported - rate Partially Supported "
        "when the Generated Point infers an emotion or attribute the transcript "
        "doesn't explicitly state)."
    ),
    "JTBD Analysis": (
        "One row per distinct pattern found in the Empathy Mapping insight - group "
        "related empathy evidence (Thinks/Feels/Says/Does points that share an "
        "underlying theme) into a single job pattern per row, rather than one row "
        "per empathy point. Columns: Empathy Evidence (which empathy insight(s) "
        "this pattern draws on - prefix each one with its source quadrant, exactly "
        "\"Thinks:\", \"Feels:\", \"Says:\", or \"Does:\", combined with \"+\" if "
        "more than one, e.g. \"Thinks: concerned about X + Says: \\\"quote\\\"\") | "
        "Pattern (the underlying pattern connecting them) | Need / Motivation (why "
        "the user needs this) | Job (what the user is trying to accomplish) | Goal / "
        "Outcome (what successful completion looks like)."
    ),
    "User Journey Mapping": (
        "One row per journey stage implied by the jobs/goals, in order (add as "
        "many stages as the input actually supports). Columns: Journey Stage "
        "(numbered, e.g. \"1. Prepare\") | User Goal (what the user is trying to "
        "accomplish at this stage) | Activities / Actions (what they actually do) "
        "| THINKS (an in-character quoted thought) | FEELS (a single emotion word) "
        "| Pain Points / Friction | Key Decision (the question they're implicitly "
        "answering at this stage) | Opportunity (where UX, automation, or AI could "
        "help)."
    ),
    "Task Flow Analysis": (
        "One row per concrete step needed to complete the task, in order, drawn "
        "from the journey stages and activities/actions in the User Journey "
        "Mapping input (add as many steps as the input actually supports - up "
        "to about 10). Columns: Step (numbered) | User Action (what the user "
        "actually does at this step) | Decision (the question they're "
        "implicitly answering) | Friction (where the step is difficult, slow, "
        "or confusing) | Potential Error (where the user could make a mistake "
        "or get blocked) | Optimization Opportunity (where UX, automation, or "
        "AI could improve the step)."
    ),
    "Workflow Analysis": (
        "One row per step, grouped by who or what performs it. Columns: "
        "Step | Owner (Person/Tool) | What Happens | Handoff To."
    ),
    "Decision Analysis": (
        "One row per decision point the transcript describes. Columns: "
        "Decision Point | Options Considered | Outcome/Choice | Why."
    ),
    "Pain Point + Friction Analysis": (
        "One row per distinct pain point. Columns: Pain Point | Impact "
        "(Low/Med/High) | Frequency (Rare/Occasional/Frequent) | Context."
    ),
    "System Mapping": (
        "One row per system, tool, or data source mentioned. Columns: "
        "System/Tool | Role | Connects To | Notes."
    ),
    "Root Cause Analysis": (
        "One row per contributing cause category the transcript actually "
        "supports (e.g. People, Process, Tools, Environment - only the ones "
        "that apply). Columns: Cause Category | Specific Causes Found | "
        "Impact On The Problem."
    ),
    "Human–AI Workflow Analysis": (
        "One row per step in the described workflow. Columns: Step | "
        "Performed By (Human/AI) | What Happens | Handoff Notes."
    ),
}
DEFAULT_GRID_GUIDANCE = (
    "One row per key category or stage this framework conventionally uses. "
    "Columns: Category | What The Transcript Shows | Explanation."
)

# Structural notes that must apply regardless of whether the researcher has
# saved their own Output Format (which otherwise replaces GRID_GUIDANCE
# entirely, below) - e.g. JTBD Analysis's Empathy Evidence column needs its
# per-quadrant labels no matter what layout template the researcher chose, so
# the Insight Panel can render "Thinks"/"Feels"/"Says"/"Does" as clickable
# links back to that quadrant's source row in Empathy Mapping.
EXTRA_FORMAT_NOTES = {
    "JTBD Analysis": (
        "In the Empathy Evidence column specifically: prefix every combined "
        "fragment with the exact empathy quadrant it's drawn from - \"Thinks:\", "
        "\"Feels:\", \"Says:\", or \"Does:\" (matching Empathy Mapping's own "
        "quadrant labels) - joined with \" + \" when a pattern draws on more than "
        "one, e.g. \"Thinks: concerned about data quality + Says: \\\"data quality "
        "is a pain\\\"\". This keeps every fragment traceable back to its source "
        "quadrant."
    ),
}


def build_insight_prompt(framework: str, transcript: str, persona_names: list,
                          focus: str = None, helps_to_identify: str = None, output_format: str = None,
                          example: str = None, transcript_label: str = "conversation transcript") -> list:
    """transcript: normally the chat's messages already formatted as "Speaker: text"
    lines, oldest first - but for a framework whose Input (per the researcher's
    reference doc) is actually a prior framework's output rather than the raw chat
    (e.g. JTBD Analysis is built from the Empathy Mapping insight, not the
    transcript itself), transcript holds that prior insight's Markdown table
    instead, and transcript_label should describe what it actually is (e.g.
    "Empathy Mapping insight") so the prompt doesn't mischaracterize it as a raw
    conversation. persona_names: the distinct personas who answered in this chat -
    when there's more than one (group chat) AND the input actually is a raw
    transcript, the prompt explicitly asks for one consolidated analysis instead of
    a map per persona; irrelevant when reading a prior framework's already-
    consolidated output, so it's skipped in that case. The researcher's "Objective
    & Output" overlay for this framework (plus the shared Google Doc, if reachable)
    arrives as separate pieces so the model studies content guidance before
    generating, then pours the result into a distinct structural template: focus
    (plain-text objective) and helps_to_identify (a Markdown table of what the
    analysis should surface) are both studied first; output_format (a Markdown
    table showing the exact layout) is what the finished analysis must be written
    into, and example (a fully worked-out Markdown table from a different
    transcript) is a calibration reference for structure and rigor, never content
    to copy. Returns chat messages for an LLM call that applies the named UX
    research framework (Empathy Mapping, User Journey Mapping, etc.) - used by the
    Insight Panel's framework cards."""
    is_raw_transcript = transcript_label == "conversation transcript"
    consolidation_note = ""
    if is_raw_transcript and len(persona_names) > 1:
        names = ", ".join(persona_names)
        consolidation_note = f"""

This conversation includes multiple personas answering independently ({names}).
Produce ONE consolidated {framework} grid that synthesizes all of their answers
together - do not write a separate grid per persona. Within each row, blend their
input into a single combined view; where they clearly diverge on something material,
note the difference briefly inside that row rather than splitting the whole analysis
by persona."""

    # A researcher's own saved objective/example (and the shared Google Doc merged
    # into focus upstream in generate_insight) always win; each framework's
    # built-in default only fills in for whichever piece the researcher hasn't set.
    effective_focus = focus or DEFAULT_OBJECTIVES.get(framework)
    effective_example = example or DEFAULT_EXAMPLES.get(framework)
    effective_helps_to_identify = helps_to_identify or DEFAULT_HELPS_TO_IDENTIFY.get(framework)

    study_instructions = ""
    if effective_focus or effective_helps_to_identify:
        study_parts = []
        if effective_focus:
            study_parts.append(f"Objective:\n{effective_focus}")
        if effective_helps_to_identify:
            study_parts.append(f"This analysis should specifically help identify:\n{effective_helps_to_identify}")
        study_notes = "\n\n".join(study_parts)
        study_instructions = f"""Before generating the analysis, study the researcher's objective and what this
analysis needs to surface, below. Let it drive what you look for in the {transcript_label}
and what you emphasize - this is content guidance, not a layout to reproduce.

\"\"\"
{study_notes}
\"\"\"

"""

    if output_format:
        # A defined output format is authoritative: it wins over the generic default
        # entirely, rather than being mentioned as a soft afterthought the model can
        # deprioritize in favor of the more detailed default instructions.
        format_instructions = f"""{study_instructions}Once you've studied that, generate the {framework} insight and put it into the
researcher's exact output format below - reproduce that same arrangement using
Markdown (a table, headed sections, etc. - whichever best reproduces what's shown)
rather than substituting a generic table of your own. Output ONLY that table -
nothing before it, nothing after it, no extra sections or commentary. This is the
primary instruction for how to structure the output.

Output format to populate:
\"\"\"
{output_format}
\"\"\"
"""
    else:
        grid_guidance = GRID_GUIDANCE.get(framework, DEFAULT_GRID_GUIDANCE)
        format_instructions = f"""{study_instructions}Present the analysis as ONE Markdown table (a grid) - this is the entire output,
nothing before or after it.
{grid_guidance}
Use GitHub-flavored Markdown table syntax. Keep cell text concise - short phrases or
a sentence, not paragraphs. Do not produce a diagram or chart of any kind - a table is
all that's needed.
"""

    extra_note = EXTRA_FORMAT_NOTES.get(framework)
    if extra_note:
        format_instructions += f"\n{extra_note}\n"

    if effective_example:
        format_instructions += f"""
Worked example, from a different {transcript_label} - for calibration only, so you can
see the expected structure and rigor (including how Validation ratings get assigned).
Do not copy its wording, subject matter, or quadrant content; generate fresh
insights from the {transcript_label} below instead:
\"\"\"
{effective_example}
\"\"\"
"""

    read_instruction = (
        "Read the full conversation below (the researcher's questions and the "
        "interview subject's answers)"
        if is_raw_transcript
        else f"Read the {transcript_label} below"
    )
    system_prompt = f"""You are a UX researcher synthesizing insights from a {transcript_label}
using the {framework} method. {read_instruction} and produce a structured
analysis that applies {framework} specifically, populated only with what the {transcript_label}
actually supports. Do not invent details the {transcript_label} doesn't back up; if part of the
output would have nothing to draw on, omit it rather than fabricating content.{consolidation_note}

{format_instructions}
Keep the whole response focused - just the table, no restating the full {transcript_label},
no meta-commentary about being an AI or about this being an analysis task."""
    user_prompt = f"""{transcript_label.capitalize()}:

{transcript}

Produce a {framework} analysis of this {transcript_label} as a grid (table), as instructed."""
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]