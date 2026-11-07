/** Turns raw AI output into one of three safe outcomes. Anything unclear becomes "uncertain". */

export type Verdict = "approved" | "rejected" | "uncertain";

/** Below this confidence an "approved" answer is downgraded so no payment is released automatically. */
export const AUTO_RELEASE_MIN_CONFIDENCE = 0.8;

export interface ReviewOutcome {
  verdict: Verdict;
  summary: string;
  confidence: number | null;
}

const VERDICTS = new Set<Verdict>(["approved", "rejected", "uncertain"]);

export function normalizeReview(raw: unknown): ReviewOutcome {
  if (typeof raw !== "object" || raw === null) {
    return { verdict: "uncertain", summary: "The automatic review returned no usable answer. The owner needs to check this file.", confidence: null };
  }
  const r = raw as Record<string, unknown>;
  const verdict = typeof r["verdict"] === "string" && VERDICTS.has(r["verdict"] as Verdict) ? (r["verdict"] as Verdict) : null;
  const rawConf = typeof r["confidence"] === "number" && Number.isFinite(r["confidence"]) ? r["confidence"] : null;
  const confidence = rawConf === null ? null : Math.min(1, Math.max(0, rawConf));
  let summary = typeof r["summary"] === "string" ? r["summary"].trim() : "";
  const unmet = Array.isArray(r["unmet_requirements"])
    ? r["unmet_requirements"].filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 5)
    : [];
  if (unmet.length > 0) summary = `${summary}${summary ? " " : ""}Missing: ${unmet.join("; ")}.`;
  summary = summary.slice(0, 800);

  if (!verdict) {
    return { verdict: "uncertain", summary: summary || "The automatic review gave an unclear answer. The owner needs to check this file.", confidence };
  }
  if (verdict === "approved" && (confidence === null || confidence < AUTO_RELEASE_MIN_CONFIDENCE)) {
    return {
      verdict: "uncertain",
      summary: `${summary || "Looks acceptable."} (Confidence too low to release payment automatically.)`.trim(),
      confidence,
    };
  }
  return { verdict, summary: summary || (verdict === "approved" ? "Meets the requirements." : "Does not meet the requirements."), confidence };
}
