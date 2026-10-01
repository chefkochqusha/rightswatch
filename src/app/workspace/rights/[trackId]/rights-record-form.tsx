"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { saveRightsRecordAction, type RightsRecordState } from "../actions";

export interface RightsRecordFormValues {
  id: string;
  commercial: boolean;
  organic: boolean;
  territories: string[];
  startDay: string;
  endDay: string;
  campaignIds: string[];
  notes: string | null;
  source: string | null;
}

/**
 * A rights record, as a member writes one down (Brief §10): which use the
 * licence covers, where, from when to when, for which campaigns, and where
 * it comes from. New records start from the common case — commercial and
 * organic use, worldwide, every campaign — but never guess the start date:
 * a licence that seems to start today would leave every earlier post
 * uncovered. Saving re-checks the song's posts.
 */
export function RightsRecordForm({
  trackId,
  record,
  campaigns,
  onDone,
}: {
  trackId: string;
  /** Set to edit that record; absent to add one. */
  record?: RightsRecordFormValues;
  campaigns: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<RightsRecordState, FormData>(saveRightsRecordAction, {});
  const [territoryScope, setTerritoryScope] = useState(record && record.territories.length > 0 ? "listed" : "worldwide");
  const [campaignScope, setCampaignScope] = useState(record && record.campaignIds.length > 0 ? "listed" : "all");
  const id = useId();
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.saved) onDone?.();
  }, [state, onDone]);

  return (
    <ActionForm action={formAction} className="space-y-5">
      <input type="hidden" name="trackId" value={trackId} />
      {record && <input type="hidden" name="recordId" value={record.id} />}

      <fieldset>
        <legend className="text-[0.8125rem] font-medium text-tx">The licence covers</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <Check name="commercial" defaultChecked={record?.commercial ?? true} label="Commercial use" hint="Paid partnerships and #ad posts" />
          <Check name="organic" defaultChecked={record?.organic ?? true} label="Organic use" hint="Unpaid posts" />
        </div>
        <FieldError message={errors.usage} />
      </fieldset>

      <fieldset>
        <legend className="text-[0.8125rem] font-medium text-tx">Where</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <Radio name="territoryScope" value="worldwide" checked={territoryScope === "worldwide"} onChange={setTerritoryScope} label="Worldwide" />
          <Radio name="territoryScope" value="listed" checked={territoryScope === "listed"} onChange={setTerritoryScope} label="Only in some countries" />
        </div>
        {territoryScope === "listed" && (
          <div className="mt-3 max-w-sm">
            <label htmlFor={`${id}-territories`} className="sr-only">
              Countries
            </label>
            <input
              id={`${id}-territories`}
              name="territories"
              defaultValue={record?.territories.join(", ")}
              placeholder="DE, AT, CH"
              autoComplete="off"
              aria-invalid={errors.territories ? true : undefined}
              aria-describedby={`${id}-territories-help`}
              className="block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx uppercase placeholder:text-t2 placeholder:normal-case aria-invalid:border-mismatch"
            />
            {errors.territories ? (
              <FieldError message={errors.territories} />
            ) : (
              <p id={`${id}-territories-help`} className="mt-1.5 text-[0.8125rem] text-t2">
                Two-letter country codes, separated by commas.
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[0.8125rem] font-medium text-tx">When</legend>
        <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-start`} className="block text-[0.8125rem] text-t2">
              From
            </label>
            <input
              id={`${id}-start`}
              name="startDate"
              type="date"
              required
              defaultValue={record?.startDay}
              aria-invalid={errors.startDate ? true : undefined}
              className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx aria-invalid:border-mismatch"
            />
          </div>
          <div>
            <label htmlFor={`${id}-end`} className="block text-[0.8125rem] text-t2">
              Until <span className="text-t2/80">(optional)</span>
            </label>
            <input
              id={`${id}-end`}
              name="endDate"
              type="date"
              defaultValue={record?.endDay}
              aria-invalid={errors.endDate ? true : undefined}
              className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx aria-invalid:border-mismatch"
            />
          </div>
        </div>
        <FieldError message={errors.startDate ?? errors.endDate} />
      </fieldset>

      {campaigns.length > 0 && (
        <fieldset>
          <legend className="text-[0.8125rem] font-medium text-tx">Campaigns</legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <Radio name="campaignScope" value="all" checked={campaignScope === "all"} onChange={setCampaignScope} label="Every campaign" />
            <Radio name="campaignScope" value="listed" checked={campaignScope === "listed"} onChange={setCampaignScope} label="Only some campaigns" />
          </div>
          {campaignScope === "listed" && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {campaigns.map((campaign) => (
                <Check
                  key={campaign.id}
                  name="campaignIds"
                  value={campaign.id}
                  defaultChecked={record?.campaignIds.includes(campaign.id) ?? false}
                  label={campaign.name}
                />
              ))}
            </div>
          )}
          <FieldError message={errors.campaigns} />
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-source`} className="block text-[0.8125rem] font-medium text-tx">
            Source <span className="font-normal text-t2">(optional)</span>
          </label>
          <input
            id={`${id}-source`}
            name="source"
            defaultValue={record?.source ?? ""}
            maxLength={200}
            placeholder="Agreement NS-2026-014"
            autoComplete="off"
            className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx placeholder:text-t2"
          />
          <FieldError message={errors.source} />
        </div>
        <div>
          <label htmlFor={`${id}-notes`} className="block text-[0.8125rem] font-medium text-tx">
            Notes <span className="font-normal text-t2">(optional)</span>
          </label>
          <textarea
            id={`${id}-notes`}
            name="notes"
            defaultValue={record?.notes ?? ""}
            maxLength={2000}
            rows={1}
            className="mt-1.5 block min-h-[2.375rem] w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx"
          />
          <FieldError message={errors.notes} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending ? "Saving…" : record ? "Save changes" : "Add rights record"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonStyles("plain")}>
            Cancel
          </button>
        )}
        <p role="status" className="text-[0.8125rem] text-mismatch">
          {state.error}
        </p>
      </div>
    </ActionForm>
  );
}

function Check({
  name,
  value,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  value?: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-tx">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[var(--ac)]" />
      <span>
        {label}
        {hint && <span className="block text-[0.8125rem] text-t2">{hint}</span>}
      </span>
    </label>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-tx">
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="h-4 w-4 accent-[var(--ac)]" />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-[0.8125rem] text-mismatch">{message}</p> : null;
}
