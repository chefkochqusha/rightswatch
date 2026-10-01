import type { ScanItemResult } from "@/modules/scan-pipeline";
import { PLATFORM_LABELS, REASON_LABELS, formatConfidence, matchMethodLabel } from "./labels";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/**
 * The assessment/content/raw-payload panels shared between the public
 * Demo Mode detail page (`app/assessments/[contentId]`) and the real,
 * authenticated workspace's item detail page (`app/workspace/items/
 * [contentId]`) — extracted so the two don't drift out of sync with each
 * other as the design evolves. Deliberately excludes anything
 * case-related (that's real-workspace-only, and rendered alongside this,
 * not inside it) and the page header (username, back link, status badge)
 * since those differ between the two callers.
 */
export function AssessmentSummary({ item }: { item: ScanItemResult }) {
  return (
    <>
      {item.kind === "ASSESSED" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-line bg-surface p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold">Assessment</h2>
            <p className="mt-2 text-sm text-tx">{item.assessment.explanation}</p>
            {item.assessment.reason && (
              <p className="mt-3 text-[0.8125rem] text-t2">
                Reason code:{" "}
                <span className="font-medium text-tx">
                  {REASON_LABELS[item.assessment.reason]}
                </span>
              </p>
            )}
            <p className="mt-1 text-[0.8125rem] text-t2">
              Based on{" "}
              {item.assessment.matchedRecordIds.length === 0
                ? "no rights records"
                : item.assessment.matchedRecordIds.join(", ")}
            </p>

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[0.8125rem] font-semibold text-t2">Matched track</h3>
              <p className="mt-1 text-sm text-tx">
                {item.musicMatch.title} — {item.musicMatch.artist}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-t2">
                {item.musicMatch.isrc ?? "No ISRC on file"} ·{" "}
                {formatConfidence(item.musicMatch.confidence)} identification confidence ·{" "}
                {matchMethodLabel(item.musicMatch.provider, item.musicMatch.manual)}
              </p>
              <p className="mt-1 text-xs text-t2">
                Confidence in the music identification, not that an infringement occurred.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">Content</h2>
            <dl className="mt-3 space-y-2.5 text-[0.8125rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Platform</dt>
                <dd className="text-tx">{PLATFORM_LABELS[item.content.platform]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Published</dt>
                <dd className="text-tx">{dateFormatter.format(item.content.publishedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Disclosure label</dt>
                <dd className="text-tx">{item.content.label ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Territory</dt>
                <dd className="text-tx">{item.content.territory ?? "Not reported"}</dd>
              </div>
            </dl>
            {item.content.videoUrls[0] && (
              <a
                href={item.content.videoUrls[0]}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-[0.8125rem] font-medium text-accent hover:underline"
              >
                Open on TikTok ↗
              </a>
            )}
          </section>
        </div>
      ) : item.kind === "OTHER_MUSIC" ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Not in your catalogue</h2>
          <p className="mt-2 text-sm text-tx">
            {item.musicMatch.title}
            {item.musicMatch.artist && `, ${item.musicMatch.artist}`}
          </p>
          <p className="mt-1 text-sm text-t2">
            {formatConfidence(item.musicMatch.confidence)} identification confidence. This song isn&apos;t in the
            catalogue, so its rights weren&apos;t checked.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            {item.kind === "NO_MUSIC_MATCH" ? "No track identified" : "Identification failed"}
          </h2>
          <p className="mt-2 text-sm text-t2">
            {item.kind === "MUSIC_ID_ERROR"
              ? item.error
              : "No music identification provider could match this content to a track, so no rights assessment could run."}
          </p>
        </section>
      )}

      <details className="mt-4 rounded-lg border border-line bg-surface p-5">
        <summary className="cursor-pointer text-[0.8125rem] font-medium text-t2">
          Raw platform payload (audit only — never used by the rights engine)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-3 text-xs text-t2">
          {JSON.stringify(item.content.rawPayload, null, 2)}
        </pre>
      </details>
    </>
  );
}
