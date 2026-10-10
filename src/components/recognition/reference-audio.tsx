import { getPrisma } from "@/lib/prisma-client";
import { findFingerprintSummary } from "@/app/_lib/fingerprint-store";
import { FINGERPRINT_TRACK_JOB, MAX_SONG_UPLOAD_BYTES } from "@/app/_lib/own-recognition";
import { removeReferenceAudioAction } from "@/app/workspace/rights/recognition-actions";
import { MEDIA_FORMAT_LABEL } from "@/modules/recognition";
import { FileUpload } from "@/components/uploads/file-upload";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { getPlanLimits } from "@/app/_lib/plan-limits";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

function minutes(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A catalogue song's reference audio (own recognition): whether Bekvor has
 * its fingerprint, a running or failed upload, and the upload itself. Only
 * rendered on our own server, where recognition is set up.
 */
export async function ReferenceAudio({ workspaceId, trackId, canManage }: { workspaceId: string; trackId: string; canManage: boolean }) {
  const [summary, lastJob, limits, used] = await Promise.all([
    findFingerprintSummary(workspaceId, trackId),
    getPrisma().job.findFirst({
      where: { workspaceId, type: FINGERPRINT_TRACK_JOB, payload: { path: ["trackId"], equals: trackId } },
      orderBy: { createdAt: "desc" },
      select: { status: true, error: true, createdAt: true },
    }),
    getPlanLimits(workspaceId),
    getPrisma().trackFingerprint.count({ where: { workspaceId } }),
  ]);
  const full = !summary && used >= limits.referenceSongCap;
  const working = lastJob && ["QUEUED", "RUNNING", "RETRYING"].includes(lastJob.status);
  const failed = lastJob?.status === "FAILED" && (!summary || lastJob.createdAt > summary.updatedAt);

  return (
    <section aria-labelledby="reference-audio" className="max-w-3xl">
      {working && <AutoRefresh />}
      <h2 id="reference-audio" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
        Reference audio
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-t2">
        Upload a recording of this song so Bekvor can recognise it in posts, even sped up, slowed or under a voice-over.
        Bekvor keeps only an acoustic fingerprint, which can&apos;t be played back; the file itself is deleted once it&apos;s read.
      </p>

      <div className="mt-4 rounded-[0.875rem] border border-line bg-surface px-4 py-3 text-sm">
        {working ? (
          <p role="status">
            {lastJob!.status === "RETRYING"
              ? "Reading the recording didn't work on the first try. Bekvor tries again in a few minutes."
              : "Reading the recording… This takes a few seconds to a minute."}
          </p>
        ) : summary ? (
          <p>
            <span className="font-medium text-cleared">Ready.</span>{" "}
            <span className="text-t2">
              Fingerprint of {minutes(summary.durationSec)} of audio
              {summary.sourceFileName ? ` from “${summary.sourceFileName}”` : ""}, added {dateFormatter.format(summary.updatedAt)}.
            </span>
          </p>
        ) : (
          <p className="text-t2">No reference audio yet. Posts can still be checked by hand.</p>
        )}
        {failed && (
          <p role="alert" className="mt-2 text-[0.8125rem] text-mismatch">
            The last upload couldn&apos;t be used: {lastJob!.error ?? "unknown error"}
          </p>
        )}
      </div>

      <p className="mt-2 text-[0.8125rem] text-t2">
        {limits.planName
          ? `${used.toLocaleString("en-US")} of ${limits.referenceSongCap.toLocaleString("en-US")} songs with reference audio on ${limits.planName}.`
          : "Choose a plan to add reference audio."}
      </p>

      {canManage && !working && full && limits.planName && (
        <p className="mt-2 text-[0.8125rem] text-t2">All are used. Remove one from another song, or move to a bigger plan in Billing.</p>
      )}

      {canManage && !working && !full && (
        <>
          <FileUpload
            endpoint={`/api/uploads/track-audio/${encodeURIComponent(trackId)}`}
            label={summary ? "Replace the recording" : "Upload a recording"}
            hint={`${MEDIA_FORMAT_LABEL}, up to ${Math.round(MAX_SONG_UPLOAD_BYTES / 1024 / 1024)} MB. Only upload songs you hold the rights to or are authorised to manage.`}
            maxBytes={MAX_SONG_UPLOAD_BYTES}
          />
          {summary && (
            <form action={removeReferenceAudioAction} className="mt-1">
              <input type="hidden" name="trackId" value={trackId} />
              <button type="submit" className="text-[0.8125rem] text-t2 underline underline-offset-2 hover:text-tx">
                Remove the fingerprint
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
