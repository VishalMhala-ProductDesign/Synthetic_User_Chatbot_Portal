## overview

| #  | Analysis                            | Main question                                                          | Output → feeds into       |
| -- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| 1  | **Empathy Mapping**                 | What is the user thinking, feeling, saying and doing?                  | User needs                |
| 2  | **JTBD Analysis**                   | What job is the user actually trying to accomplish?                    | User goal                 |
| 3  | **User Journey Mapping**            | Where does this experience happen end-to-end?                          | Journey stages            |
| 4  | **Understand Insight**              | What do the need, job, and journey combined mean?                      | Understand-phase insight  |
| 5  | **Task Flow Analysis**              | What steps does the user perform?                                      | Task sequence             |
| 6  | **Workflow Analysis**               | How does the work actually move between people, systems and processes? | Workflow dependencies     |
| 7  | **Decision Analysis**               | Where does the user/system make decisions?                             | Decision points           |
| 8  | **Pain Point + Friction Analysis**  | Where does the experience break down?                                  | Problems                  |
| 9  | **System Mapping**                  | What systems, data, people and dependencies influence the problem?     | System context            |
| 10 | **Analyze Insight**                 | What do the work, decisions, and friction combined mean?               | Analyze-phase insight     |
| 11 | **Root Cause Analysis**             | Why is the problem happening?                                          | Root causes               |
| 12 | **Opportunity Analysis**            | What could we improve?                                                 | Design opportunities      |
| 13 | **AI Opportunity Analysis**         | Where could AI create meaningful value?                                | AI opportunities          |
| 14 | **Diagnose Insight**                | What do the root cause and AI fit combined mean?                       | Diagnose-phase insight    |
| 15 | **Human–AI Workflow Analysis**      | What should humans do vs AI?                                           | Human/AI responsibilities |
| 16 | **AI Capability Analysis**          | What AI capability is required?                                        | AI capabilities           |
| 17 | **Agent / AI Skill Analysis**       | What skills/actions must the AI perform?                               | Agent definition          |
| 18 | **Define Insight**                  | What do the responsibility split and capabilities combined mean?       | Define-phase insight      |
| 19 | **Future-State Workflow**           | What should the improved workflow look like?                           | New workflow              |
| 20 | **Human–AI Interaction Design**     | How does the human interact with AI?                                   | Interaction model         |
| 21 | **Trust & Control Analysis**        | How does the user understand, verify and control AI?                   | Trust mechanisms          |
| 22 | **Design Insight**                  | What do the experience and trust/control mechanisms combined mean?     | Design-phase insight      |
| 23 | **Validation & Usability Analysis** | Does the new solution actually work?                                   | Design improvements       |
| 24 | **Outcome / KPI Analysis**          | Did we improve the business and user outcome?                          | Success metrics           |
| 25 | **Validate Insight**                | What do the usability findings and KPI results combined mean?          | Validate-phase insight    |
| 26 | **Product Design Insight**          | What does the outcome data tell us about the product design?           | Design implications       |


Complete UX / AI Product Analysis Framework — Summary

Here is the complete framework we have built, showing what each analysis does, what it produces, and how each step feeds the next.

1. Overall Flow
                 ┌──────────────────────────┐
                 │        UNDERSTAND        │
                 │ Empathy → JTBD → Journey │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │         ANALYZE          │
                 │ Task → Workflow →        │
                 │ Decision → Pain → System │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │         DIAGNOSE         │
                 │ Root Cause → Opportunity │
                 │ → AI Opportunity         │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │          DEFINE          │
                 │ Human–AI → Capability →  │
                 │ Agent Skills             │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │          DESIGN          │
                 │ Future Workflow →        │
                 │ Interaction → Trust      │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │         VALIDATE         │
                 │ Usability → Outcome/KPI  │
                 └────────────┬─────────────┘
                              ↓
                 ┌──────────────────────────┐
                 │  PRODUCT DESIGN INSIGHT  │
                 │                          │
                 │ "What did we learn?"     │
                 │ "What does it mean?"     │
                 │ "What should change?"    │
                 └────────────┬─────────────┘
                              ↓
                    PRODUCT / DESIGN
                       DECISIONS
                              ↓
                         ITERATE
                              │
                              └───────────────↺

2. Summary Table

| Analysis                            | Primary Objective                                               | Key Question                                                             | Main Output                                          |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| **Empathy Mapping**                 | Understand user's thoughts, feelings, words, and behaviors      | **What does the user think, feel, say, and do?**                         | User evidence & insights                             |
| **JTBD Analysis**                   | Understand what the user is fundamentally trying to accomplish  | **What job is the user trying to get done?**                             | Jobs, goals, needs, desired outcomes                 |
| **Journey Mapping**                 | Understand the user's experience across the end-to-end journey  | **What does the user experience from start to finish?**                  | Journey stages, emotions, pain points, opportunities |
| **Understand Insight**              | Synthesize Empathy + JTBD + Journey into a single insight        | **What do the user's need, job, and journey combined mean for Analyze?** | Phase-level insight                                  |
| **Task Flow Analysis**              | Break down a specific task into sequential actions              | **What steps does the user take to complete the task?**                  | Steps, decisions, friction, errors                   |
| **Workflow Analysis**               | Understand how work moves across people, processes, and systems | **How does the work actually get done?**                                 | Activities, actors, handoffs, dependencies           |
| **Decision Analysis**               | Understand where and how decisions are made                     | **Where, why, and how is a decision made?**                              | Decision points, inputs, criteria, outcomes          |
| **Pain Point + Friction Analysis**  | Identify problems, obstacles, effort, delays, and frustrations  | **Where does the user struggle?**                                        | Pain points & friction                               |
| **System Mapping**                  | Understand the broader ecosystem surrounding the workflow       | **What people, systems, data, and dependencies influence the workflow?** | System relationships & dependencies                  |
| **Analyze Insight**                 | Synthesize Task Flow + Workflow + Decision + Pain + System into a single insight | **What do the work, decisions, and friction combined mean for Diagnose?** | Phase-level insight                     |
| **Root Cause Analysis**             | Identify underlying reasons behind problems                     | **Why is the problem happening?**                                        | Root causes                                          |
| **Opportunity Analysis**            | Convert problems and unmet needs into improvement opportunities | **Where can we create meaningful value?**                                | Opportunities                                        |
| **AI Opportunity Analysis**         | Determine where AI can meaningfully create value                | **Where should AI be used, and why?**                                    | AI opportunities                                     |
| **Diagnose Insight**                | Synthesize Root Cause + Opportunity + AI Opportunity into a single insight | **What do the root cause and AI fit combined mean for Define?**  | Phase-level insight                                  |
| **Human–AI Workflow Analysis**      | Define how humans and AI should collaborate                     | **What should humans do vs. AI?**                                        | Human–AI responsibilities                            |
| **AI Capability Analysis**          | Define the capabilities AI needs                                | **What must AI be capable of doing?**                                    | AI capabilities                                      |
| **Agent / AI Skill Analysis**       | Translate capabilities into specific agent skills and actions   | **What specific skills does the agent need?**                            | Skills, tools, actions                               |
| **Define Insight**                  | Synthesize Human–AI Workflow + AI Capability + Agent/AI Skill into a single insight | **What do the responsibility split and capabilities combined mean for Design?** | Phase-level insight                  |
| **Future-State Workflow**           | Design the improved workflow                                    | **What should the workflow look like after improvement?**                | Future-state workflow                                |
| **Human–AI Interaction Design**     | Design how users interact with AI                               | **How should humans and AI interact?**                                   | Interaction model                                    |
| **Trust & Control Analysis**        | Ensure users can understand and control AI                      | **How can users trust and control AI appropriately?**                    | Transparency, controls, guardrails                   |
| **Design Insight**                  | Synthesize Future-State Workflow + Interaction Design + Trust & Control into a single insight | **What do the experience and trust/control mechanisms combined mean for Validate?** | Phase-level insight      |
| **Validation & Usability Analysis** | Test whether the proposed solution works                        | **Does the solution actually work for users?**                           | Usability findings & improvements                    |
| **Outcome / KPI Analysis**          | Measure whether the solution creates value                      | **Did the solution achieve the intended outcome?**                       | KPIs, impact, value                                  |
| **Validate Insight**                | Synthesize Validation & Usability + Outcome/KPI into a single insight | **What do the usability findings and KPI results combined mean for Product Design Insight?** | Phase-level insight        |
| **Product Design Insight**          | Interpret what the outcome data means for the product design    | **What does the outcome data tell us about the product design?**        | Pattern, insight, design implications                |


3. What Each Stage Produces
Empathy Mapping

THINKS + FEELS + SAYS + DOES

↓

Pattern

↓

Underlying Need / Motivation

Example:

User is concerned about data quality and frustrated by manual validation.

JTBD Analysis

Empathy evidence

↓

Pattern

↓

Need / Motivation

↓

Job

↓

Goal / Outcome

Example:

Job: Prepare and validate reliable simulation data.
Goal: Have accurate and synchronized data.
Outcome: Trust simulation results.

Journey Mapping

JTBD

↓

Map the experience over time:

Prepare → Validate → Configure → Run → Analyze → Communicate → Monitor

For each stage:

Goal → Actions → Thinks → Feels → Pain → Decision → Opportunity

Understand Insight

Synthesize Empathy + JTBD + Journey into one statement - not a restatement of any single finding, but what the need, job, and journey combined mean going into Analyze.

Example:

The user needs confidence that simulation data is reliable before proceeding.

Task Flow Analysis

Zoom into one specific task.

Simple formula

Task Flow → Steps → Decisions → Friction → Errors → Optimization Opportunities

Example:

Gather Data → Import → Check Quality → Resolve → Configure → Run → Validate

Workflow Analysis

Now go beyond the user's individual actions.

Ask:

Who, what process, what system, what data, and what handoff are involved?

Example:

Planner → Data System → Simulation Platform → Analyst → Stakeholder

Decision Analysis

Identify:

Decision Point → Decision Maker → Inputs → Criteria → Options → Outcome

Example:

Can I trust the simulation results?

Inputs:

Data quality + model validation + simulation output

Outcome:

Proceed to scenario analysis / investigate further.

Pain Point + Friction Analysis

Identify:

Problem → Friction → Impact

Example:

Manual data validation → Time-consuming → Delays simulation preparation.

System Mapping

Expand the view:

People + Processes + Systems + Data + Dependencies + Relationships

This helps reveal problems that cannot be understood by looking only at the user's interface.

Analyze Insight

Synthesize Task Flow + Workflow + Decision + Pain/Friction + System Mapping into one statement - what the work, decisions, and friction combined mean going into Diagnose.

Example:

Data validation requires repeated manual investigation across multiple data sources before the user can confidently proceed.

Root Cause Analysis

Ask:

Why does the problem exist?

Example:

Pain: Data validation takes too long.

↓

Why?

Data comes from multiple sources.

↓

Different formats.

↓

Different timestamps.

↓

No automated synchronization validation.

↓

Root Cause:

Fragmented data sources and insufficient automated data-quality controls.

4. Opportunity → AI

This is where your framework becomes particularly useful for AI Product Design.

Opportunity Analysis

What should we improve?

Example:

Reduce manual effort required to validate simulation data.

↓

AI Opportunity Analysis

Can AI meaningfully help?

Potential AI role:

Detect anomalies → identify inconsistencies → explain problems → recommend corrections.

↓

Diagnose Insight

Synthesize Root Cause + Opportunity + AI Opportunity into one statement - what the root cause and AI fit combined mean going into Define.

Example:

AI can reduce investigation effort by proactively identifying and explaining data-quality issues while preserving human decision authority.

↓

Human–AI Workflow

Define:

What does AI do? What does the human do?

Example:

AI
Detect data issues
      ↓
Explain issue
      ↓
Recommend correction
      ↓
Human
Review
      ↓
Approve / Reject
      ↓
AI
Apply approved correction
5. AI Capability → Agent Skills

Once you've decided AI should be involved, determine what it needs.

AI Capability

Detect data-quality problems

↓

Agent / AI Skills

Read data
Compare datasets
Detect anomalies
Identify missing values
Check timestamps
Explain inconsistencies
Recommend corrections

↓

Tools

Data API
Simulation platform
Database
Validation engine

Define Insight

Synthesize Human–AI Workflow + AI Capability + Agent/AI Skill into one statement - what the responsibility split and required capabilities combined mean going into Design.

Example:

AI handles detection and investigation; the human retains authority over consequential corrections.

6. Future-State Workflow

Now redesign the original workflow.

Current State
Collect Data
 ↓
Manually Check
 ↓
Find Problems
 ↓
Investigate
 ↓
Fix
 ↓
Recheck
 ↓
Run Simulation
Future State
Collect Data
 ↓
AI Automatically Checks
 ↓
AI Identifies Problems
 ↓
AI Explains Problems
 ↓
AI Recommends Fix
 ↓
Human Reviews / Approves
 ↓
AI Applies Approved Fix
 ↓
Run Simulation

This is the point where your research and analysis becomes an actual product/workflow design.

7. Human–AI Interaction

Now ask:

How does the human interact with the AI?

For example:

AI says:

“12 timestamp inconsistencies detected across 3 datasets.”

User can:

Review → See explanation → Accept recommendation → Reject → Edit

The interaction needs to make the AI's behavior understandable and controllable.

8. Trust & Control

Now ask:

Why should the user trust the AI, and how can they remain in control?

Define:

Why did AI flag this?
What data did AI use?
How confident is AI?
Can the user review the evidence?
Can the user reject the recommendation?
Can the user undo the action?
When must AI hand control back to the human?

Design Insight

Synthesize Future-State Workflow + Human–AI Interaction Design + Trust & Control into one statement - what the redesigned experience and its trust/control mechanisms combined mean going into Validate.

Example:

A human-controlled AI validation experience that reduces investigation effort while keeping the user informed and in control.

9. Validation

Now test the proposed solution.

Measure:

Can the user complete the task?

Is the workflow faster?

Does the user understand the AI recommendation?

Does the user know when to trust or question AI?

Are errors reduced?

Is the human still able to control the outcome?

10. Outcome / KPI

Finally:

Did the redesign actually create value?

For example:

KPI	Before	Target
Data validation time	2 hours	30 min
Manual validation steps	15	5
Data-quality issues detected before simulation	60%	95%
Simulation rework	High	Reduced
User confidence	Low	High
Successful first-time simulation runs	70%	90%

Validate Insight

Synthesize Validation & Usability + Outcome/KPI into one statement - what the usability findings and KPI results combined mean going into Product Design Insight.

Example:

Users complete validation faster, but frequently override recommendations because they don't understand why AI made them.

11. Product Design Insight

Finally, interpret the KPI results:

What does each outcome tell us about the product design - not just whether the KPI moved, but what that reveals?

Example:

KPI-01: Task Completion Rate → Users need to resolve exceptions without leaving the interface → The experience should support complete exception-resolution journeys within the workflow.

Across all KPIs, look for the pattern (e.g. context, explanation, human control, error prevention, handback), state the higher-level Product Design Insight that pattern points to, then convert it into concrete Design Implications the team can act on.

The Entire Framework in One View
                    USER
                     │
                     ▼
             EMPATHY MAPPING
          Thinks / Feels / Says / Does
                     │
                     ▼
                 JTBD
          Jobs / Goals / Needs
                     │
                     ▼
               JOURNEY MAP
          Experience over time
                     │
                     ▼
          UNDERSTAND INSIGHT
      Need / Job / Journey synthesis
                     │
                     ▼
             TASK FLOW
        Steps / Decisions / Errors
                     │
                     ▼
             WORKFLOW
       People / Process / Systems
                     │
                     ▼
           DECISION ANALYSIS
          Decisions / Criteria
                     │
                     ▼
       PAIN + FRICTION ANALYSIS
                     │
                     ▼
          SYSTEM MAPPING
     Dependencies / Relationships
                     │
                     ▼
           ANALYZE INSIGHT
   Work / Decisions / Friction synthesis
                     │
                     ▼
          ROOT CAUSE ANALYSIS
                     │
                     ▼
          OPPORTUNITY ANALYSIS
                     │
                     ▼
       AI OPPORTUNITY ANALYSIS
                     │
                     ▼
          DIAGNOSE INSIGHT
     Root Cause / AI Fit synthesis
                     │
                     ▼
       HUMAN–AI WORKFLOW
                     │
                     ▼
        AI CAPABILITY ANALYSIS
                     │
                     ▼
       AGENT / AI SKILL ANALYSIS
                     │
                     ▼
           DEFINE INSIGHT
  Responsibility / Capability synthesis
                     │
                     ▼
       FUTURE-STATE WORKFLOW
                     │
                     ▼
     HUMAN–AI INTERACTION DESIGN
                     │
                     ▼
        TRUST & CONTROL
                     │
                     ▼
           DESIGN INSIGHT
     Experience / Trust synthesis
                     │
                     ▼
       VALIDATION & USABILITY
                     │
                     ▼
           OUTCOME / KPI
                     │
                     ▼
          VALIDATE INSIGHT
      Usability / KPI synthesis
                     │
                     ▼
      PRODUCT DESIGN INSIGHT
The simplest way to remember the framework

Understand the User → Understand the Job → Understand the Journey → Understand the Work → Understand the Decisions → Find the Problems → Find the Causes → Find the Opportunities → Determine Where AI Fits → Design Human–AI Collaboration → Build the Future Workflow → Design the Interaction → Establish Trust & Control → Validate → Measure Value → Interpret the Outcome for Design.

Each phase also closes with its own synthesis checkpoint - Understand Insight, Analyze Insight, Diagnose Insight, Define Insight, Design Insight, and Validate Insight - a single distilled statement of what that phase's evidence means, generated and verified before the next phase is allowed to build on it.

This makes the framework much more than a collection of UX techniques: each analysis produces an output that becomes the input for the next analysis.