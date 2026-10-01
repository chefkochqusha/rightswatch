import { requireSession } from "@/app/_lib/current-user";
import { getAuthStore } from "@/app/_lib/auth-store";
import { ROLE_LABELS } from "@/components/team/labels";
import type { MembershipRecord, UserRecord } from "@/modules/auth";
import { InviteForm } from "./invite-form";

export const metadata = {
  title: "Team — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * Member list + invite form for the caller's own workspace — the UI for
 * `modules/auth`'s invite-teammate flow. Deliberately workspace-scoped only
 * (never lists or touches another workspace): `current-user.ts`'s
 * `memberships[0]` comment already flags multi-workspace membership as
 * future work, and this feature is scoped specifically to avoid needing
 * that (see `modules/auth/invite-teammate.ts`'s doc comment) — every
 * membership `findForWorkspace` returns here belongs to one workspace, and
 * accepting an invite always creates a *new* account, never adds a second
 * membership to an existing one.
 *
 * Only OWNER/ADMIN sessions see the invite form; ANALYST/VIEWER get a
 * read-only member list. `team/actions.ts`'s `requireAdmin` enforces the
 * same rule against a forged request, not just in this page's rendering.
 */
export default async function TeamPage() {
  const session = await requireSession();
  const store = getAuthStore();

  const memberships = await store.memberships.findForWorkspace(session.workspace.id);
  const members: { membership: MembershipRecord; user: UserRecord }[] = [];
  for (const membership of memberships) {
    const user = await store.users.findById(membership.userId);
    // Every membership should resolve to a real user by construction, but
    // skip rather than crash the page if one somehow doesn't.
    if (user) members.push({ membership, user });
  }
  members.sort((a, b) => a.membership.createdAt.getTime() - b.membership.createdAt.getTime());

  const canInvite = session.role === "OWNER" || session.role === "ADMIN";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-t2">Everyone with access to {session.workspace.name}.</p>

      {canInvite && (
        <section className="mt-6 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Invite a teammate</h2>
          <p className="mt-1 text-[0.8125rem] text-t2">
            They&apos;ll create their own login and join this workspace directly. An invite
            can&apos;t be used to join if the email already has a RightsWatch account.
          </p>
          <div className="mt-4">
            <InviteForm />
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[0.8125rem] text-t2">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map(({ membership, user }) => (
                <tr key={membership.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 align-top text-tx">
                    {user.name ?? "—"}
                    {user.id === session.user.id && (
                      <span className="ml-1.5 text-[0.8125rem] text-t2">(you)</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 align-top text-t2">{user.email}</td>
                  <td className="px-5 py-3.5 align-top text-t2">{ROLE_LABELS[membership.role]}</td>
                  <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2">
                    {dateFormatter.format(membership.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
