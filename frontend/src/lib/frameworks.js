// The full framework chain, grouped into the 7 phases from scope/00_overview.md's
// "Overall Flow" diagram (Understand -> Analyze -> Diagnose -> Define -> Design
// -> Validate -> Product Design Insight) - same grouping the scope/ folder's own
// subfolders (01_understand/, 02_analyze/, ...) are organized around. Each phase
// (other than Product Design Insight, which already is the synthesis stage) ends
// with its own "<Phase> Insight" - a real, generated framework synthesizing that
// phase's analyses, sitting between it and the next phase's first analysis (see
// FRAMEWORK_SCOPE_FILES in backend/prompts.py, the actual chain this mirrors).
// Shared by ChatPage.jsx and GroupChatPage.jsx so the Insight Panel's phase
// grouping, framework list, and status legend never drift between the two pages.
export const FRAMEWORK_PHASES = [
  {
    phase: "Understand",
    frameworks: ["Empathy Mapping", "JTBD Analysis", "User Journey Mapping", "Understand Insight"],
  },
  {
    phase: "Analyze",
    frameworks: [
      "Task Flow Analysis",
      "Workflow Analysis",
      "Decision Analysis",
      "Pain Point + Friction Analysis",
      "System Mapping",
      "Analyze Insight",
    ],
  },
  {
    phase: "Diagnose",
    frameworks: ["Root Cause Analysis", "Opportunity Analysis", "AI Opportunity Analysis", "Diagnose Insight"],
  },
  {
    phase: "Define",
    frameworks: [
      "Human–AI Workflow Analysis",
      "AI Capability Analysis",
      "Agent / AI Skill Analysis",
      "Define Insight",
    ],
  },
  {
    phase: "Design",
    frameworks: [
      "Future-State Workflow",
      "Human–AI Interaction Design",
      "Trust & Control Analysis",
      "Design Insight",
    ],
  },
  {
    phase: "Validate",
    frameworks: ["Validation & Usability Analysis", "Outcome / KPI Analysis", "Validate Insight"],
  },
  { phase: "Product Design Insight", frameworks: ["Product Design Insight"] },
];

export const ANALYSIS_FRAMEWORKS = FRAMEWORK_PHASES.flatMap((group) => group.frameworks);

// True for any of the 7 synthesis steps (the 6 "<Phase> Insight" frameworks
// plus Product Design Insight) - every one of them literally has "Insight" in
// its name, so this stays correct on its own if another is ever added rather
// than needing its own hand-maintained list.
export function isInsightFramework(framework) {
  return /insight/i.test(framework);
}

// Status legend shown inside each framework's Insight button - computed
// entirely from get_session_insight_status's/get_group_session_insight_status's
// response (see frameworkStatus in ChatPage.jsx/GroupChatPage.jsx), so it always
// agrees with whether the button is actually clickable.
export function frameworkStatusLabel(status) {
  if (status?.generated && status.verified) return "Generated & Verified";
  if (status?.generated) return "Generated & Not Verified";
  if (status?.unlocked) return "Ready to generate";
  return "Not ready to generate";
}

// Color-codes the same status frameworkStatusLabel describes, for the dot
// shown next to it.
export function frameworkStatusClass(status) {
  if (status?.generated && status.verified) return "legend-verified";
  if (status?.generated) return "legend-unverified";
  if (status?.unlocked) return "legend-ready";
  return "legend-locked";
}
