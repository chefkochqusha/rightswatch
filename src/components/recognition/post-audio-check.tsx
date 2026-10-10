import Link from "next/link";
import { getPrisma } from "@/lib/prisma-client";
import { MAX_POST_UPLOAD_BYTES } from "@/app/_lib/own-recognition";
import { MEDIA_FORMAT_LABEL } from "@/modules/recognition";
import { FileUpload } from "@/components/uploads/file-upload";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { IdentifyForm } from "@/app/workspace/items/[contentId]/identify-form";

const timeFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const OUTCOME_LABEL = { MATCH: "Song recognised", CANDIDATE: "Possible match", NO_MATCH: "No song of yours found" } as const;

/**
 * Checking a post's audio against the workspace's songs (own recognition):
 * upload the post's video or sound, see the result of each check. A sure
 * match identifies the song by itself; a possible one waits for a person,
 * with the suggested song already chosen in the form.
 */
export async function PostAudioCheck({
  workspaceId,
  externalContentId,
  canManage,
  needsSong,
  catalogue,
}: {
  workspaceId: string;
  externalContentId: string;
  canManage: boolean;
  /** The post has no song yet, so a suggestion can be confirmed. */
  needsSong: boolean;
  catalogue: { id: string; label: string }[];
}) {
  const prisma = getPrisma();
  const content = await prisma.content.findFirst({
    where: { externalContentId, creator: { workspaceId } },
    select: { id: true },
  });
  if (!content) return null;
  const [checks, fingerprinted] = await Promise.all([
    prisma.audioCheck.findMany({
      where: { workspaceId, contentId: content.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { musicTrack: { select: { id: true, title: true, artist: true } } },
    }),
    prisma.trackFingerprint.count({ where: { workspaceId, musicTrack: { inCatalogue: true } } }),
  ]);
  const working = checks.some((c) => c.status === "QUEUED" || c.status === "RUNNING");
  // The newest finished check that named a song, while the post has none:
  // a person confirms it (or picks another) and the rights check runs.
  const latestDone = checks.find((c) => c.status === "DONE");
  const suggestion =
    needsSong && latestDone && (latestDone.outcome === "MATCH" || latestDone.outcome === "CANDIDATE") && latestDone.musicTrack ? latestDone : undefined;

  return (
    <section aria-labelledby="audio-check" className="mt-4 rounded-lg border border-line bg-surface p-5">
      {working && <AutoRefresh />}
      <h2 id="audio-check" className="text-sm font-semibold">Check the post&apos;s audio</h2>
      <p className="mt-2 text-sm text-t2">
        Upload the post&apos;s video or sound and Bekvor compares it with your songs that have reference audio
        {fingerprinted === 0 ? "" : ` (${fingerprinted} ${fingerprinted === 1 ? "song" : "songs"})`}. The file is deleted once it&apos;s checked.
      </p>
      {fingerprinted === 0 && (
        <p className="mt-2 text-sm text-t2">
          None of your songs has reference audio yet.{" "}
          <Link href="/workspace/rights" className="font-medium text-accent underline underline-offset-2">Add a recording to a song</Link> first.
        </p>
      )}

      {checks.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {checks.map((check) => (
            <li key={check.id} className="py-3">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {check.status === "DONE" && check.outcome
                    ? OUTCOME_LABEL[check.outcome]
                    : check.status === "FAILED"
                      ? "Check failed"
                      : check.status === "RUNNING"
                        ? "Checking…"
                        : "Waiting to be checked…"}
                  {check.musicTrack && (check.outcome === "MATCH" || check.outcome === "CANDIDATE") && (
                    <>
                      {": "}
                      <Link href={`/workspace/rights/${check.musicTrack.id}`} className="text-accent underline underline-offset-2">
                        {check.musicTrack.title}
                        {check.musicTrack.artist ? ` — ${check.musicTrack.artist}` : ""}
                      </Link>
                    </>
                  )}
                </span>
                <span className="text-[0.8125rem] text-t2">
                  {timeFormatter.format(check.createdAt)} UTC{check.fileName ? ` · ${check.fileName}` : ""}
                </span>
              </p>
              {check.status === "DONE" && (
                <p className="mt-1 text-[0.8125rem] text-t2">
                  {(check.details as { reason?: string } | null)?.reason}
                  {check.confidence !== null && check.outcome !== "NO_MATCH" ? ` Match strength ${Math.round(check.confidence * 100)} %.` : ""}
                </p>
              )}
              {(check.status === "FAILED" || (check.status === "QUEUED" && check.error)) && (
                <p className={`mt-1 text-[0.8125rem] ${check.status === "FAILED" ? "text-mismatch" : "text-t2"}`}>{check.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {suggestion && canManage && (
        <div className="mt-4">
          <p className="text-sm">
            {suggestion.outcome === "MATCH" ? "Bekvor recognised this song." : "Is it this song?"} Confirm it, or choose the right one; then the rights check runs.
          </p>
          <IdentifyForm contentId={externalContentId} songs={catalogue} defaultTrackId={suggestion.musicTrack!.id} />
        </div>
      )}

      {canManage && !working && fingerprinted > 0 && (
        <FileUpload
          endpoint={`/api/uploads/post-audio/${encodeURIComponent(externalContentId)}`}
          label={checks.length ? "Check another file" : "Upload the post's video or sound"}
          hint={`${MEDIA_FORMAT_LABEL}, up to ${Math.round(MAX_POST_UPLOAD_BYTES / 1024 / 1024)} MB.`}
          maxBytes={MAX_POST_UPLOAD_BYTES}
        />
      )}
    </section>
  );
}
