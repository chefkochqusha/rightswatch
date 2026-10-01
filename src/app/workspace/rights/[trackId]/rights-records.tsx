"use client";

import { useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { deleteRightsRecordAction } from "../actions";
import { RightsRecordForm, type RightsRecordFormValues } from "./rights-record-form";

export interface RightsRecordView extends RightsRecordFormValues {
  usage: string;
  territory: string;
  term: string;
  campaignNames: string[];
  state: "IN_FORCE" | "ENDED" | "NOT_STARTED";
  stateLabel: string;
}

const STATE_TONES: Record<RightsRecordView["state"], string> = {
  IN_FORCE: "bg-cleared-bg text-cleared",
  ENDED: "bg-hover text-t2",
  NOT_STARTED: "bg-review-bg text-review",
};

/**
 * A song's rights records (Brief §10), each in plain words — what it
 * covers, where, when, for which campaigns — with editing in place. The
 * words are worked out on the server (`record-summary.ts`); this only adds
 * the editing.
 */
export function RightsRecords({
  trackId,
  records,
  campaigns,
  canManage,
}: {
  trackId: string;
  records: RightsRecordView[];
  campaigns: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(records.length === 0 && canManage ? "new" : null);

  return (
    <div className="space-y-3">
      {records.length === 0 && editing !== "new" && (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-sm text-t2">
          No rights record yet, so every paid post using this song is flagged for review.
        </p>
      )}

      {records.map((record) =>
        editing === record.id ? (
          <div key={record.id} className="rounded-2xl border border-accent/40 bg-surface p-5">
            <RightsRecordForm trackId={trackId} record={record} campaigns={campaigns} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <article key={record.id} className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[0.9375rem] font-semibold text-tx">{record.usage}</h3>
                <p className="mt-0.5 text-sm text-t2">{record.term}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_TONES[record.state]}`}>{record.stateLabel}</span>
            </div>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[0.8125rem] text-t2">Territory</dt>
                <dd className="mt-0.5 text-tx">{record.territory}</dd>
              </div>
              <div>
                <dt className="text-[0.8125rem] text-t2">Campaigns</dt>
                <dd className="mt-0.5 text-tx">{record.campaignNames.length > 0 ? record.campaignNames.join(", ") : "Every campaign"}</dd>
              </div>
              {record.source && (
                <div>
                  <dt className="text-[0.8125rem] text-t2">Source</dt>
                  <dd className="mt-0.5 text-tx">{record.source}</dd>
                </div>
              )}
              {record.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[0.8125rem] text-t2">Notes</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-tx">{record.notes}</dd>
                </div>
              )}
            </dl>
            {canManage && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => setEditing(record.id)} className={buttonStyles("plain", "sm")}>
                  <PencilIcon className="h-3.5 w-3.5" />
                  Edit
                </button>
                <details className="group">
                  <summary className={`${buttonStyles("danger", "sm")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                    <TrashIcon className="h-3.5 w-3.5" />
                    Delete
                  </summary>
                  <form action={deleteRightsRecordAction} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-mismatch-bg px-3 py-2">
                    <input type="hidden" name="recordId" value={record.id} />
                    <span className="text-[0.8125rem] text-mismatch">Delete this record? Posts that relied on it are checked again.</span>
                    <button type="submit" className="rounded-full bg-mismatch px-3 py-1 text-[0.8125rem] font-medium text-white">
                      Delete record
                    </button>
                  </form>
                </details>
              </div>
            )}
          </article>
        ),
      )}

      {canManage &&
        (editing === "new" ? (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="mb-4 text-[0.9375rem] font-semibold">New rights record</h3>
            <RightsRecordForm trackId={trackId} campaigns={campaigns} onDone={records.length > 0 ? () => setEditing(null) : undefined} />
          </div>
        ) : (
          <button type="button" onClick={() => setEditing("new")} className={buttonStyles("secondary")}>
            <PlusIcon className="h-3.5 w-3.5" />
            Add rights record
          </button>
        ))}
    </div>
  );
}
