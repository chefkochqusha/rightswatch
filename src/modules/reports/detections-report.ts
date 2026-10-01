import type { StoredScanItem } from "../scan-results";
import type { CaseRecord } from "../cases";

/** The window a report covers, counted back from now by publication date. */
export type ReportPeriod = "30d" | "90d" | "all";

export const REPORT_PERIOD_DAYS: Record<ReportPeriod, number | null> = { "30d": 30, "90d": 90, all: null };

export function itemsInPeriod(items: readonly StoredScanItem[], period: ReportPeriod, now: Date): StoredScanItem[] {
  const days = REPORT_PERIOD_DAYS[period];
  if (days === null) return [...items];
  const since = now.getTime() - days * 86_400_000;
  return items.filter((item) => item.content.publishedAt.getTime() >= since);
}

export interface DetectionLookups {
  /** Case by `rightsAssessmentId`. */
  caseByAssessment: ReadonlyMap<string, CaseRecord>;
  /** Display name by user id, for the assignee. */
  memberName: ReadonlyMap<string, string>;
  /** The verdict and case wording the UI uses, so the file reads like the app. */
  statusLabel: (status: string) => string;
  reasonLabel: (reason: string) => string;
  caseStatusLabel: (status: string) => string;
  casePriorityLabel: (priority: string) => string;
  /** Demo posts have made-up links; the file says so instead of carrying them (Brief §48). */
  isDemo?: boolean;
}

export const DETECTION_COLUMNS = [
  "Published",
  "Creator (TikTok username)",
  "Brand",
  "Disclosure label",
  "Song",
  "Artist",
  "ISRC",
  "Identification confidence",
  "Verdict",
  "Reason",
  "Explanation",
  "Case status",
  "Case priority",
  "Assigned to",
  "Post link",
] as const;

/**
 * One row per post with a song in it (a post with no song identified has
 * nothing to report). Header first. Dates are ISO days, so they sort.
 */
export function detectionRows(items: readonly StoredScanItem[], lookups: DetectionLookups): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [[...DETECTION_COLUMNS]];
  for (const item of items) {
    if (item.kind !== "ASSESSED" && item.kind !== "OTHER_MUSIC") continue;
    const { content, musicMatch } = item;
    const assessed = item.kind === "ASSESSED";
    const existingCase = item.rightsAssessmentId ? lookups.caseByAssessment.get(item.rightsAssessmentId) : undefined;
    rows.push([
      content.publishedAt.toISOString().slice(0, 10),
      item.creatorUsername,
      content.brandNames.join("; "),
      content.label ?? "",
      musicMatch.title,
      musicMatch.artist,
      musicMatch.isrc,
      Math.round(musicMatch.confidence * 1000) / 10,
      assessed ? lookups.statusLabel(item.assessment.status) : "Not checked (not in your catalogue)",
      assessed && item.assessment.reason ? lookups.reasonLabel(item.assessment.reason) : "",
      assessed ? item.assessment.explanation : "",
      existingCase ? lookups.caseStatusLabel(existingCase.status) : "",
      existingCase ? lookups.casePriorityLabel(existingCase.priority) : "",
      existingCase?.assignedToId ? (lookups.memberName.get(existingCase.assignedToId) ?? "") : "",
      lookups.isDemo ? "Demo data: not a real post" : (content.videoUrls[0] ?? ""),
    ]);
  }
  return rows;
}

export interface ReportSummary {
  postsChecked: number;
  withMusic: number;
  /** Assessed posts by verdict. */
  verdicts: Record<"CLEARED" | "REVIEW" | "UNKNOWN" | "POTENTIAL_MISMATCH", number>;
  /** Songs heard but not in the catalogue, so not checked. */
  notInCatalogue: number;
  bySong: { trackId: string; title: string; artist: string; posts: number; toReview: number }[];
  byCreator: { username: string; posts: number; toReview: number }[];
}

export function summarize(items: readonly StoredScanItem[]): ReportSummary {
  const summary: ReportSummary = {
    postsChecked: items.length,
    withMusic: 0,
    verdicts: { CLEARED: 0, REVIEW: 0, UNKNOWN: 0, POTENTIAL_MISMATCH: 0 },
    notInCatalogue: 0,
    bySong: [],
    byCreator: [],
  };
  const songs = new Map<string, ReportSummary["bySong"][number]>();
  const creators = new Map<string, ReportSummary["byCreator"][number]>();

  for (const item of items) {
    if (item.kind !== "ASSESSED" && item.kind !== "OTHER_MUSIC") continue;
    summary.withMusic += 1;
    const toReview = item.kind === "ASSESSED" && item.assessment.status !== "CLEARED" ? 1 : 0;
    if (item.kind === "ASSESSED") summary.verdicts[item.assessment.status] += 1;
    else summary.notInCatalogue += 1;

    const song = songs.get(item.musicMatch.trackId) ?? { trackId: item.musicMatch.trackId, title: item.musicMatch.title, artist: item.musicMatch.artist, posts: 0, toReview: 0 };
    song.posts += 1;
    song.toReview += toReview;
    songs.set(song.trackId, song);

    const creator = creators.get(item.creatorUsername) ?? { username: item.creatorUsername, posts: 0, toReview: 0 };
    creator.posts += 1;
    creator.toReview += toReview;
    creators.set(creator.username, creator);
  }

  const byReviewThenPosts = <T extends { toReview: number; posts: number }>(a: T, b: T) => b.toReview - a.toReview || b.posts - a.posts;
  summary.bySong = [...songs.values()].sort(byReviewThenPosts);
  summary.byCreator = [...creators.values()].sort(byReviewThenPosts);
  return summary;
}
