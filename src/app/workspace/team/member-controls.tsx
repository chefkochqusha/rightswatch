"use client";

import { useActionState, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { changeMemberRoleAction, removeMemberAction, transferOwnershipAction, type MemberActionState } from "./actions";

const SELECT = "block rounded-md border border-line bg-bg px-2.5 py-1.5 text-[0.8125rem] text-tx";
const ROLES = [
  { value: "ADMIN", label: "Admin" },
  { value: "ANALYST", label: "Analyst" },
  { value: "VIEWER", label: "Viewer" },
] as const;

function Message({ state }: { state: MemberActionState }) {
  if (state.error) return <p role="alert" className="mt-1.5 text-[0.8125rem] text-mismatch">{state.error}</p>;
  if (state.done) return <p role="status" className="mt-1.5 text-[0.8125rem] text-cleared">{state.done}</p>;
  return null;
}

/** A member's role, changeable by owners and admins (never the owner's, never one's own). */
export function RoleControl({ userId, role, label }: { userId: string; role: string; label: string }) {
  const [state, action, pending] = useActionState(changeMemberRoleAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`role-${userId}`}>Role of {label}</label>
        <select id={`role-${userId}`} name="role" defaultValue={role} className={SELECT}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonStyles("secondary", "sm")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

/** Removing a member, after a second click that says what it does. */
export function RemoveMember({ userId, label }: { userId: string; label: string }) {
  const [state, action, pending] = useActionState(removeMemberAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={buttonStyles("danger", "sm")}>
        Remove<span className="sr-only"> {label}</span>
      </button>
    );
  }
  return (
    <form action={action} className="max-w-56">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-[0.8125rem] text-t2">
        {label} loses access at once and their login is deleted. Their notes and activity stay, without their name.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className={buttonStyles("danger", "sm")}>
          {pending ? "Removing…" : "Remove"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={buttonStyles("plain", "sm")}>
          Cancel
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

/** The owner hands the workspace to an admin, with their password. */
export function TransferOwnership({ admins }: { admins: { userId: string; label: string }[] }) {
  const [state, action, pending] = useActionState(transferOwnershipAction, {});
  return (
    <form action={action} className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div>
        <label htmlFor="transfer-to" className="block text-[0.8125rem] font-medium text-tx">New owner</label>
        <select id="transfer-to" name="userId" className={`mt-1.5 ${SELECT} py-2 text-sm`} required>
          {admins.map((a) => (
            <option key={a.userId} value={a.userId}>{a.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="transfer-password" className="block text-[0.8125rem] font-medium text-tx">Your password</label>
        <input
          id="transfer-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-tx"
        />
      </div>
      <button type="submit" disabled={pending} className={buttonStyles("secondary")}>
        {pending ? "Handing over…" : "Make owner"}
      </button>
      </div>
      <Message state={state} />
    </form>
  );
}
