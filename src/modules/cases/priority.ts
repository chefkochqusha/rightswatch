import type { CasePriority } from "./types";

/**
 * The priority a new case starts with, from the rights verdict that opened
 * it: a potential mismatch is the clearest signal and starts High; a post
 * the check couldn't settle (Unknown, Needs review) starts Medium. People
 * change it from there; a re-run of the scan never does.
 */
export function priorityForVerdict(status: "CLEARED" | "REVIEW" | "UNKNOWN" | "POTENTIAL_MISMATCH"): CasePriority {
  switch (status) {
    case "POTENTIAL_MISMATCH":
      return "HIGH";
    case "CLEARED":
      return "LOW";
    default:
      return "MEDIUM";
  }
}
