import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const VALIDATION_CLASS = {
  "strongly supported": "validation-strong",
  "supported": "validation-ok",
  "partially supported": "validation-partial",
};

function validationClass(value) {
  return VALIDATION_CLASS[(value || "").trim().toLowerCase()] || "validation-neutral";
}

// The model is instructed (see prompts.py) to output nothing but a single GFM
// table, so parsing is just splitting "|"-delimited lines - no need to pull in
// a full markdown parser for this.
function parseMarkdownTable(markdown) {
  if (!markdown) return null;
  const lines = markdown
    .trim()
    .split("\n")
    .filter((line) => line.trim().startsWith("|"));
  if (lines.length < 2) return null;

  const splitRow = (line) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

  const headers = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow).filter((row) => row.some((cell) => cell));
  return rows.length ? { headers, rows } : null;
}

// The inverse of parseMarkdownTable - turns the currently displayed
// headers/rows (which may have had unvalidated rows removed by the
// researcher) back into a GFM table string, so "Save" can persist exactly
// what's on screen as the record's content instead of the original
// unmodified LLM output.
function stringifyMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separatorLine, ...rowLines].join("\n");
}

// A stable identity for a table row's "manually validated" checkbox state,
// based on its content rather than its position - so when the researcher
// clicks Regenerate, a row whose claim comes back unchanged keeps its
// checkmark, while a row whose content actually changed starts unvalidated
// again instead of a stale checkmark just carrying over by row position.
function rowValidationKey(row) {
  return row.join(" ");
}

// On regenerate, the researcher's manually-validated rows are kept exactly as
// they were and everything else is replaced by the fresh generation - rather
// than discarding validated work just because the model re-ran. Keeps rows
// grouped by category (needed for the rowspan-merged first column) in the
// order each category first appears, kept rows before new ones within a
// group; a freshly generated row that happens to duplicate a kept row's
// content is dropped rather than shown twice.
function mergeRows(keptRows, newRows) {
  const keptKeys = new Set(keptRows.map(rowValidationKey));
  const dedupedNew = newRows.filter((row) => !keptKeys.has(rowValidationKey(row)));

  const order = [];
  const groups = new Map();
  const addRow = (row) => {
    const category = row[0];
    if (!groups.has(category)) {
      groups.set(category, []);
      order.push(category);
    }
    groups.get(category).push(row);
  };
  keptRows.forEach(addRow);
  dedupedNew.forEach(addRow);

  return order.flatMap((category) => groups.get(category));
}

// Splits an "Empathy Evidence" cell (e.g. JTBD Analysis's first column) into
// its "Thinks:"/"Feels:"/"Says:"/"Does:"-prefixed fragments (see prompts.py's
// EXTRA_FORMAT_NOTES, which instructs the model to tag each combined fragment
// with its source quadrant) - so each quadrant label can be rendered as its
// own clickable link back to that quadrant's row in Empathy Mapping. Returns
// null for any cell that isn't actually tagged this way (plain text, or a
// framework/older saved insight that never had this format), so callers can
// fall back to rendering the cell as plain text.
const EVIDENCE_LABEL_RE = /(Thinks|Feels|Says|Does):\s*/gi;

// JTBD Analysis has no per-row "Validation" column of its own to check off
// (see hasValidationColumn) - it's derived from Empathy Mapping's already-
// verified rows instead. This sentinel key lives inside the same
// validatedRows Set as real per-row keys (see rowValidationKey) so the
// existing save/persist plumbing (onValidatedRowsChange, onSave) covers it
// for free, marking the whole generated table as researcher-verified rather
// than any specific row. It never collides with a real row's key since
// rowValidationKey is a plain "cell cell cell" join with no such marker.
const JTBD_VERIFIED_KEY = "__jtbd_verified__";

// Same idea as JTBD_VERIFIED_KEY, for User Journey Mapping's own whole-table
// "researcher-verified" checkbox.
const UJM_VERIFIED_KEY = "__ujm_verified__";

function parseEvidenceSegments(text) {
  if (!text) return null;
  const parts = text.split(EVIDENCE_LABEL_RE);
  if (parts.length < 3) return null; // no recognized label found

  const segments = [];
  const leading = parts[0].trim();
  if (leading) segments.push({ label: null, text: leading });
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i];
    const body = (parts[i + 1] || "").trim().replace(/\s*\+\s*$/, "").trim();
    segments.push({ label: label[0].toUpperCase() + label.slice(1).toLowerCase(), text: body });
  }
  return segments;
}

function ValidationPill({ value }) {
  if (!value) return null;
  return (
    <span className={`validation-pill ${validationClass(value)}`}>
      <span className="validation-dot" />
      {value}
    </span>
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pulls quoted phrases out of the model's own Generated Point / Evidence text
// (straight "..." and curly “...” quotes) - these are the only substrings we
// can reliably expect to appear near-verbatim in the source transcript, so
// they're what the validate modal highlights.
function extractQuotedPhrases(text) {
  if (!text) return [];
  const phrases = [];
  for (const re of [/"([^"]{4,})"/g, /“([^”]{4,})”/g]) {
    let match;
    while ((match = re.exec(text))) phrases.push(match[1].trim());
  }
  return phrases;
}

// Wraps each matched substring in a raw <mark> tag and returns the whole
// thing as a single markdown string, rendered through the same ReactMarkdown
// pipeline as everything else (see MessageBubble below) - so a persona reply
// keeps its real formatting (headings, tables, bold text) instead of falling
// back to plain unstyled text just because part of it needs highlighting.
function highlightSubstringsMarkdown(text, substrings, className) {
  if (!substrings.length || !text) return text;
  const escaped = substrings.map(escapeRegExp).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.replace(re, `<mark class="${className}">$1</mark>`);
}

function highlightPhrasesMarkdown(text, phrases) {
  return highlightSubstringsMarkdown(text, phrases, "validate-highlight");
}

// Naive sentence splitter: a "sentence" is a run of text ending in ./!/?
// (trailing whitespace or end-of-string). Good enough for conversational
// chat text - it doesn't need to be linguistically perfect, just consistent
// enough that each piece is still an exact substring of the original message
// (so it can be found again for highlighting).
function splitSentences(text) {
  if (!text) return [];
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  const sentences = (matches && matches.length ? matches : [text]).map((s) => s.trim()).filter(Boolean);
  return sentences;
}

// A "sentence" candidate for highlighting must come from a plain prose
// paragraph - never a heading, table, list item, or blockquote line. Those
// blocks routinely have no terminal punctuation for splitSentences to anchor
// on, so it would otherwise merge them with whatever markdown comes next
// (a whole table, say) into one "sentence"; injecting a <mark> across that
// span corrupts the parsed markdown instead of just highlighting text.
function isPlainProseBlock(block) {
  return !/^\s*(#{1,6}\s|\||[-*+]\s|\d+\.\s|>)/.test(block);
}

function splitHighlightCandidates(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && isPlainProseBlock(b))
    .flatMap((b) => splitSentences(b));
}

const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "for", "from", "was", "were", "been", "has",
  "have", "had", "will", "would", "could", "should", "about", "also", "than", "then",
  "there", "their", "they", "them", "these", "those", "which", "what", "when", "where",
  "why", "how", "does", "did", "doing", "more", "most", "some", "such", "only", "just",
  "very", "into", "over", "under", "out", "down", "because", "while", "during", "before",
  "after", "above", "below", "again", "further", "once", "here", "each", "both", "few",
  "other", "same", "own", "can", "now", "not", "but", "you", "your", "our", "his", "her",
  "him", "she", "who", "all", "are", "was",
]);

// Rough keyword-overlap relevance scoring - not embeddings, just enough to
// point the researcher at the right part of a long conversation when the
// evidence text paraphrases rather than quotes what was said.
function extractKeywords(text) {
  if (!text) return [];
  const words = text.toLowerCase().match(/[a-z0-9']+/g) || [];
  return Array.from(new Set(words.filter((w) => w.length > 3 && !STOPWORDS.has(w))));
}

function keywordScore(text, keywords) {
  const lower = (text || "").toLowerCase();
  return keywords.reduce((count, kw) => (lower.includes(kw) ? count + 1 : count), 0);
}

// Shows the source chat transcript with any quoted phrases from the claim(s)
// being reviewed highlighted in place. Two ways in: clicking a single row's
// "Let me validate" chip (entries has one item, checked/onToggleChecked are
// set, so the footer shows the validate checkbox), or clicking the category
// cell itself - e.g. "THINKS"/"SAYS"/"FEELS"/"DOES" - which passes every row
// in that group as entries so all of that category's evidence is highlighted
// in the transcript at once (category is set, no checkbox - "take me to the
// source" isn't tied to one row's validation state).
function ValidateModal({
  messages, workspaceLabel, personaLabel, entries, category, checked, onToggleChecked, onClose,
}) {
  const phrases = useMemo(
    () => entries.flatMap((e) => [...extractQuotedPhrases(e.generatedPoint), ...extractQuotedPhrases(e.evidence)]),
    [entries]
  );

  const firstMatchIndex = useMemo(() => {
    if (!phrases.length) return -1;
    const lowerPhrases = phrases.map((p) => p.toLowerCase());
    return messages.findIndex((m) => lowerPhrases.some((p) => (m.text || "").toLowerCase().includes(p)));
  }, [messages, phrases]);

  // Fallback when no quote matches verbatim: score each sentence of each
  // persona message (not the researcher's own questions) by how many
  // significant keywords it shares with the claim, then highlight the whole
  // sentence(s) that come closest - by context, not just a scattering of
  // individual matched words - so there's still something pointing at the
  // right part of the transcript instead of leaving the researcher to read
  // the whole thing.
  const keywords = useMemo(
    () => extractKeywords(entries.map((e) => `${e.generatedPoint} ${e.evidence}`).join(" ")),
    [entries]
  );

  const { sentencesByMessage, bestFuzzyIndex } = useMemo(() => {
    if (firstMatchIndex !== -1 || !keywords.length) {
      return { sentencesByMessage: new Map(), bestFuzzyIndex: -1 };
    }
    const candidates = [];
    messages.forEach((m, messageIndex) => {
      if (m.role === "researcher") return;
      splitHighlightCandidates(m.text).forEach((sentence) => {
        const score = keywordScore(sentence, keywords);
        if (score > 0) candidates.push({ messageIndex, sentence, score });
      });
    });
    if (!candidates.length) return { sentencesByMessage: new Map(), bestFuzzyIndex: -1 };

    const bestScore = Math.max(...candidates.map((c) => c.score));
    // Once we know the strongest match, also surface any other sentence that
    // comes reasonably close to it (rather than only the single best guess) -
    // capped at 2 shared keywords minimum so one incidental word doesn't flag
    // an unrelated sentence.
    const threshold = Math.min(2, bestScore);

    const map = new Map();
    candidates
      .filter((c) => c.score >= threshold)
      .forEach(({ messageIndex, sentence }) => {
        if (!map.has(messageIndex)) map.set(messageIndex, []);
        map.get(messageIndex).push(sentence);
      });

    const best = candidates.find((c) => c.score === bestScore);
    return { sentencesByMessage: map, bestFuzzyIndex: best.messageIndex };
  }, [messages, keywords, firstMatchIndex]);

  const scrollTargetIndex = firstMatchIndex !== -1 ? firstMatchIndex : bestFuzzyIndex;
  const scrollTargetRef = useRef(null);
  useEffect(() => {
    scrollTargetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollTargetIndex]);

  let statusMessage = null;
  if (firstMatchIndex === -1) {
    if (bestFuzzyIndex !== -1) {
      statusMessage = phrases.length
        ? "No exact quote found in this chat - highlighting the closest related sentence below instead, by context."
        : "This evidence doesn't quote the transcript directly - highlighting the closest related sentence below, by context.";
    } else {
      statusMessage = phrases.length
        ? "No exact match found in this chat - the wording may have been paraphrased."
        : "This evidence doesn't quote the transcript directly, and no closely related content was found - review the conversation below to validate it yourself.";
    }
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel drawer-panel-wide validate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>
            {category ? `Source for "${category}"` : "Validation Overlay"}
            {workspaceLabel ? ` | ${workspaceLabel}` : ""}
          </h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          <div className="validate-reference">
            {entries.map((entry, i) => (
              <div className="validate-claim" key={i}>
                <div className="validate-claim-field">
                  <div className="validate-claim-label">Generated Point</div>
                  <p className="validate-claim-point">{entry.generatedPoint || "—"}</p>
                </div>
                <div className="validate-claim-field">
                  <div className="validate-claim-label">Evidence from feedback</div>
                  <p className="validate-claim-evidence">{entry.evidence || "—"}</p>
                </div>
              </div>
            ))}

            {statusMessage && <p className="empty-state">{statusMessage}</p>}
          </div>

          {/* Same chat-main/chat-panel-header/chat-messages/chat-bubble markup
              as the live Chat Workspace view, so the transcript here reads as
              the same conversation in the same arrangement - not a bespoke
              re-styling. */}
          <div className="chat-main validate-transcript-frame">
            <p className="chat-panel-header">
              <span className="chat-panel-header-label">Chat Workspace-</span>
              <span className="chat-panel-header-title">{personaLabel || "Persona"}</span>
            </p>
            <div className="chat-messages validate-transcript">
              {messages.length === 0 && <p className="empty-state">No chat messages to show.</p>}
              {messages.map((m, i) => {
                const sentencesHere = firstMatchIndex === -1 ? sentencesByMessage.get(i) : undefined;
                const highlightedMarkdown =
                  firstMatchIndex !== -1
                    ? highlightPhrasesMarkdown(m.text, phrases)
                    : sentencesHere
                    ? highlightSubstringsMarkdown(m.text, sentencesHere, "validate-highlight-fuzzy")
                    : m.text;
                // Only messages that actually got a <mark> injected need
                // rehype-raw (to render that raw HTML) - everything else
                // renders with the exact same plugin set as the live chat.
                const isHighlighted = highlightedMarkdown !== m.text;
                return (
                  <div
                    key={m.id || i}
                    ref={i === scrollTargetIndex ? scrollTargetRef : undefined}
                    className={`chat-bubble chat-bubble-${m.role === "researcher" ? "researcher" : "persona"}`}
                  >
                    <p className="chat-bubble-speaker">{m.speaker}</p>
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={isHighlighted ? [rehypeRaw] : []}
                      >
                        {highlightedMarkdown}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          {onToggleChecked ? (
            <label className="validate-checkbox">
              <input type="checkbox" checked={checked} onChange={(e) => onToggleChecked(e.target.checked)} />
              I've reviewed the chat and manually validated this against the AI's Generated Point &amp; Evidence
            </label>
          ) : (
            <p className="empty-state validate-footer-note">
              Showing every row's evidence for "{category}" - use each row's own "Let me validate" button to check it off.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Renders every generated grid with the same look and feel, regardless of
// framework: consecutive rows sharing the same first-column value are merged
// into one rowspan-ed cell (so a repeated category like an empathy quadrant
// only prints once - a no-op for tables whose first column is unique per
// row, which just renders like a normal table). Frameworks whose output
// actually has a "Validation" column get two more upgrades scoped to that:
// a colored status pill instead of plain text, and an "Evidence" column gets
// a "Let me validate" chip that opens the source transcript - both stay off
// for every other framework, since without a Validation rating to check,
// "validate this row" doesn't mean anything.
function InsightTable({ headers, rows, canValidate, validatedRows, onValidate, sourceTable, hasSource }) {
  const validationIndex = headers.findIndex((h) => h.trim().toLowerCase() === "validation");
  const evidenceIndex = validationIndex === -1 ? -1 : headers.findIndex((h) => /evidence/i.test(h));
  const pointIndex = validationIndex === -1 ? -1 : headers.findIndex((h) => /generated point|your statement|^statement$/i.test(h));

  // Given a quadrant label clicked inside an "Empathy Evidence" fragment (e.g.
  // JTBD Analysis) and that fragment's own text, finds the best-matching row
  // for that quadrant in the source Empathy Mapping table (by keyword overlap,
  // same scoring ValidateModal already uses to fuzzy-match a claim against the
  // transcript) so the source view opens with the real, verbatim Generated
  // Point/Evidence rather than just re-showing the paraphrased fragment. Falls
  // back to the fragment text itself when there's no source table (e.g. it
  // hasn't loaded yet) or no row for that quadrant at all.
  function openQuadrantSource(label, fragmentText) {
    const category = (label || "").trim().toUpperCase();
    if (sourceTable) {
      const pointIdx = sourceTable.headers.findIndex((h) => /generated point|your statement|^statement$/i.test(h));
      const evidIdx = sourceTable.headers.findIndex((h) => /evidence/i.test(h));
      const candidates = sourceTable.rows.filter((r) => (r[0] || "").trim().toUpperCase() === category);
      if (candidates.length) {
        const keywords = extractKeywords(fragmentText);
        let best = candidates[0];
        let bestScore = -1;
        candidates.forEach((r) => {
          const score = keywordScore(`${pointIdx >= 0 ? r[pointIdx] : ""} ${evidIdx >= 0 ? r[evidIdx] : ""}`, keywords);
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        });
        onValidate({
          rowKey: null,
          category: label,
          entries: [{ generatedPoint: pointIdx >= 0 ? best[pointIdx] : fragmentText, evidence: evidIdx >= 0 ? best[evidIdx] : fragmentText }],
        });
        return;
      }
    }
    onValidate({ rowKey: null, category: label, entries: [{ generatedPoint: fragmentText, evidence: fragmentText }] });
  }

  const groupSpan = new Array(rows.length).fill(0);
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i][0] === rows[i - 1][0]) continue; // mid-group, not a group start
    let span = 1;
    while (i + span < rows.length && rows[i + span][0] === rows[i][0]) span++;
    groupSpan[i] = span;
  }

  return (
    <table className="insight-table">
      <thead>
        <tr>
          {headers.map((header, i) => (
            <th key={i}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const isGroupStart = rowIndex === 0 || row[0] !== rows[rowIndex - 1][0];
          return (
            <tr key={rowIndex} className={isGroupStart ? "insight-row-group-start" : undefined}>
              {row.map((cell, colIndex) => {
                if (colIndex === 0) {
                  if (!isGroupStart) return null;

                  // Empathy Mapping-style: the whole cell is a single quadrant
                  // word repeated across a group of rows - clicking it shows
                  // every row in that group's source together.
                  if (canValidate) {
                    const groupRows = rows.slice(rowIndex, rowIndex + groupSpan[rowIndex]);
                    const groupEntries = groupRows.map((r) => ({
                      generatedPoint: pointIndex >= 0 ? r[pointIndex] : "",
                      evidence: evidenceIndex >= 0 ? r[evidenceIndex] : "",
                    }));
                    return (
                      <td key={colIndex} rowSpan={groupSpan[rowIndex]} className="insight-cell-category">
                        <button
                          type="button"
                          className="insight-category-source-btn"
                          onClick={() => onValidate({ rowKey: null, category: cell, entries: groupEntries })}
                          title={`Take me to the source in the chat for "${cell}"`}
                        >
                          {cell}
                        </button>
                      </td>
                    );
                  }

                  // JTBD Analysis-style: prose with embedded "Thinks:"/"Feels:"/
                  // "Says:"/"Does:" fragments - each label becomes its own link
                  // back to that quadrant's real source row in Empathy Mapping.
                  const segments = parseEvidenceSegments(cell);
                  if (segments) {
                    return (
                      <td key={colIndex} rowSpan={groupSpan[rowIndex]} className="insight-cell-evidence">
                        {segments.map((seg, i) => (
                          <span key={i}>
                            {seg.label && hasSource ? (
                              <button
                                type="button"
                                className="insight-quadrant-link"
                                onClick={() => openQuadrantSource(seg.label, seg.text)}
                                title={`Take me to the source for this "${seg.label}" point`}
                              >
                                {seg.label}
                              </button>
                            ) : (
                              seg.label
                            )}
                            {seg.label ? ": " : ""}
                            {seg.text}
                            {i < segments.length - 1 ? " + " : ""}
                          </span>
                        ))}
                      </td>
                    );
                  }

                  return (
                    <td key={colIndex} rowSpan={groupSpan[rowIndex]} className="insight-cell-category">
                      {cell}
                    </td>
                  );
                }
                if (colIndex === validationIndex) {
                  return (
                    <td key={colIndex}>
                      <ValidationPill value={cell} />
                    </td>
                  );
                }
                if (colIndex === evidenceIndex) {
                  const rowKey = rowValidationKey(row);
                  const isValidated = validatedRows.has(rowKey);
                  return (
                    <td key={colIndex}>
                      <div className="validate-evidence-cell">
                        <span>{cell}</span>
                        {canValidate && (
                          <button
                            type="button"
                            className={`validate-chip${isValidated ? " validate-chip-done" : ""}`}
                            onClick={() =>
                              onValidate({
                                rowKey,
                                entries: [{ generatedPoint: pointIndex >= 0 ? row[pointIndex] : "", evidence: cell }],
                              })
                            }
                          >
                            {isValidated ? "✓ Validated" : "Let me validate"}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                }
                return <td key={colIndex}>{cell}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function InsightDrawer({
  framework, loading, content, error, onClose, onRegenerate, messages = [], workspaceLabel, personaLabel,
  initialValidatedRows = [], onValidatedRowsChange, onSave, sourceTableContent,
}) {
  const [validating, setValidating] = useState(null);
  // Empathy Mapping's own saved table, parsed - only meaningful (and only
  // passed in by the caller) for a framework whose Empathy Evidence column
  // links back to it, e.g. JTBD Analysis. Lets clicking a "Thinks"/"Feels"/
  // "Says"/"Does" fragment open the real source row instead of just re-
  // showing the paraphrase.
  const sourceTable = useMemo(() => parseMarkdownTable(sourceTableContent) || undefined, [sourceTableContent]);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved"
  // True after any change the researcher makes to this table - checking/
  // unchecking a "✓ Validated" box, "Remove let me validate", or a
  // regenerate - so closing prompts to save regardless of whether that
  // particular change already happened to auto-persist on its own. Cleared
  // once Save succeeds, and not set by the initial generation completing
  // (nothing's actually changed yet at that point).
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  // Keyed by row content (see rowValidationKey), not position, and deliberately
  // never cleared on regenerate - a re-run's identical rows stay checked, and
  // rows whose content actually changed just won't match any key here, so they
  // naturally come back unvalidated without any special-cased reset logic.
  // Seeded from initialValidatedRows (whatever the caller already had saved for
  // this session/framework, e.g. from the backend) so checkmarks survive the
  // researcher navigating away and back, not just a regenerate within one visit.
  const [validatedRows, setValidatedRows] = useState(() => new Set(initialValidatedRows));

  function setRowValidated(rowKey, isChecked) {
    const next = new Set(validatedRows);
    if (isChecked) next.add(rowKey);
    else next.delete(rowKey);
    setValidatedRows(next);
    setDirty(true);
    onValidatedRowsChange?.(Array.from(next));
  }

  // The table actually displayed - reconciled with the previous table on every
  // content change (see mergeRows) so a regenerate keeps validated rows and
  // only replaces the rest. Updated during render (React's documented pattern
  // for "adjust state when a prop changes") rather than in an effect, so the
  // merged result is ready for this same render instead of flashing the old
  // table for a frame first.
  const [prevContent, setPrevContent] = useState(content);
  const [tableHeaders, setTableHeaders] = useState(() => parseMarkdownTable(content)?.headers ?? []);
  const [tableRows, setTableRows] = useState(() => parseMarkdownTable(content)?.rows ?? []);
  // Tracks whether this drawer has ever actually shown generated content -
  // distinguishes the initial generation's null->value transition (nothing's
  // changed yet, already auto-saved) from a later regenerate's null->value
  // transition (a real change), since a regenerate also passes through a
  // null "loading" content in between, same as the very first generation.
  const [hasGeneratedOnce, setHasGeneratedOnce] = useState(!!content);

  if (content !== prevContent) {
    setPrevContent(content);
    // A regenerate briefly sets content to null while loading - leave the
    // current table (and its validated rows) on screen rather than wiping it,
    // so there's still something to merge against once the real content lands.
    if (content) {
      const parsedNow = parseMarkdownTable(content);
      if (parsedNow) {
        const keptRows = tableRows.filter((row) => validatedRows.has(rowValidationKey(row)));
        if (hasGeneratedOnce) setDirty(true);
        setHasGeneratedOnce(true);
        setTableHeaders(parsedNow.headers);
        setTableRows(mergeRows(keptRows, parsedNow.rows));
      } else {
        setTableHeaders([]);
        setTableRows([]);
      }
    }
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Any successfully parsed grid uses the same InsightTable styling - not
  // just frameworks with a Validation column - so every framework's output
  // has the same look and feel (e.g. JTBD Analysis matches Empathy Mapping).
  const useStyledTable = tableHeaders.length > 0 && tableRows.length > 0;
  // The validate/remove/save workflow only makes sense for a table that
  // actually has per-row Validation ratings to check off - scoped separately
  // from useStyledTable so frameworks without one (e.g. JTBD Analysis) get
  // the same visual styling without the validation-specific controls.
  const hasValidationColumn = tableHeaders.some((h) => h.trim().toLowerCase() === "validation");
  const unvalidatedCount = tableRows.filter((row) => !validatedRows.has(rowValidationKey(row))).length;
  const validatedCount = tableRows.length - unvalidatedCount;

  // Drops every row that isn't checked as "✓ Validated" from the table
  // currently on screen. Purely local until the researcher clicks Save -
  // doesn't touch the backend by itself, so it's still reversible by closing
  // without saving (or by Regenerate, which will simply produce fresh rows
  // for whatever was removed). Requires at least one validated row - with
  // none, "remove everything not validated" means the whole table, which
  // would also hide Save/Remove themselves (both only show when rows exist),
  // stranding the researcher with an empty table and no way back but discard.
  function handleRemoveUnvalidated() {
    if (!unvalidatedCount || !validatedCount) return;
    if (
      !window.confirm(
        `Remove ${unvalidatedCount} not-yet-validated row${unvalidatedCount === 1 ? "" : "s"}? This can't be undone unless you regenerate.`
      )
    ) {
      return;
    }
    setTableRows((prev) => prev.filter((row) => validatedRows.has(rowValidationKey(row))));
    setDirty(true);
  }

  // Persists exactly what's currently displayed (including any rows removed
  // above) plus the validated-row keys, so this exact state - not a re-parse
  // of the original LLM output - is what's shown again on the next visit.
  async function handleSave() {
    if (!onSave) return false;
    setSaveStatus("saving");
    try {
      await onSave({
        content: stringifyMarkdownTable(tableHeaders, tableRows),
        validatedRows: Array.from(validatedRows),
      });
      setSaveStatus("saved");
      setDirty(false);
      setTimeout(() => setSaveStatus("idle"), 1500);
      return true;
    } catch {
      setSaveStatus("idle");
      return false;
    }
  }

  // The "X" close button - if there's anything unsaved, ask first instead of
  // silently discarding it; otherwise close right away, same as before.
  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  async function handleSaveAndClose() {
    const saved = await handleSave();
    // If the save itself failed, stay open with the confirm prompt up rather
    // than closing over a change that never actually made it to the backend.
    if (saved) {
      setConfirmingClose(false);
      onClose();
    }
  }

  function handleCloseWithoutSaving() {
    setConfirmingClose(false);
    onClose();
  }

  return (
    <div className="drawer-overlay">
      <div className="drawer-panel drawer-panel-wide">
        <div className="drawer-header">
          <h2>{framework}</h2>
          <button type="button" className="drawer-close" onClick={requestClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          {loading && <p className="empty-state">Analyzing the conversation…</p>}
          {error && <div className="error-banner">{error}</div>}
          {content && useStyledTable ? (
            <div className="insight-table-wrap">
              <InsightTable
                headers={tableHeaders}
                rows={tableRows}
                canValidate={hasValidationColumn && messages.length > 0}
                validatedRows={validatedRows}
                onValidate={setValidating}
                sourceTable={sourceTable}
                hasSource={messages.length > 0}
              />
            </div>
          ) : (
            content && (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )
          )}
        </div>

        <div className="drawer-footer">
          {framework === "JTBD Analysis" && tableRows.length > 0 && (
            <label className="validate-checkbox drawer-footer-checkbox">
              <input
                type="checkbox"
                checked={validatedRows.has(JTBD_VERIFIED_KEY)}
                onChange={(e) => setRowValidated(JTBD_VERIFIED_KEY, e.target.checked)}
              />
              Verified JTBD
            </label>
          )}
          {framework === "User Journey Mapping" && tableRows.length > 0 && (
            <label className="validate-checkbox drawer-footer-checkbox">
              <input
                type="checkbox"
                checked={validatedRows.has(UJM_VERIFIED_KEY)}
                onChange={(e) => setRowValidated(UJM_VERIFIED_KEY, e.target.checked)}
              />
              Verified UJM
            </label>
          )}
          {hasValidationColumn && tableRows.length > 0 && (
            <button
              type="button"
              className="danger"
              onClick={handleRemoveUnvalidated}
              disabled={!unvalidatedCount || !validatedCount}
              title={!validatedCount ? "Validate at least one row first - this can't remove every row in the table" : undefined}
            >
              Remove let me validate
            </button>
          )}
          {useStyledTable && tableRows.length > 0 && (
            <button type="button" onClick={handleSave} disabled={saveStatus === "saving"}>
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save"}
            </button>
          )}
          <button type="button" onClick={onRegenerate} disabled={loading}>
            {loading ? "Regenerating…" : `Regenerate ${framework}`}
          </button>
        </div>
      </div>

      {validating && (
        <ValidateModal
          messages={messages}
          workspaceLabel={workspaceLabel}
          personaLabel={personaLabel}
          entries={validating.entries}
          category={validating.category}
          checked={validating.rowKey ? validatedRows.has(validating.rowKey) : undefined}
          onToggleChecked={validating.rowKey ? (isChecked) => setRowValidated(validating.rowKey, isChecked) : undefined}
          onClose={() => setValidating(null)}
        />
      )}

      {confirmingClose && (
        <div className="close-confirm-overlay" onClick={() => setConfirmingClose(false)}>
          <div className="close-confirm-panel" onClick={(e) => e.stopPropagation()}>
            <p>You have unsaved changes in this {framework} table. Save before leaving?</p>
            <div className="close-confirm-actions">
              <button type="button" onClick={() => setConfirmingClose(false)}>
                Cancel
              </button>
              <button type="button" className="danger" onClick={handleCloseWithoutSaving}>
                Close without saving
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveAndClose} disabled={saveStatus === "saving"}>
                {saveStatus === "saving" ? "Saving…" : "Save & Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
