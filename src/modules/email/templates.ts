import type { EmailMessage } from "./types";

/**
 * The texts of Bekvor's service emails. Plain text, one purpose each, no
 * tracking, no advertising: they are part of the service the recipient's
 * company uses. Kept here (pure functions) so wording is tested in one place.
 */

export function inviteEmail(input: { to: string; workspaceName: string; inviterName: string; roleLabel: string; link: string }): EmailMessage {
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.workspaceName} on Bekvor`,
    text: [
      `${input.inviterName} invited you to join the workspace “${input.workspaceName}” on Bekvor as ${input.roleLabel}.`,
      "",
      `Accept the invite (the link works for 7 days):`,
      input.link,
      "",
      "If you didn't expect this, you can ignore this email.",
    ].join("\n"),
  };
}

export function accountExistsEmail(input: { to: string; loginLink: string; resetLink: string }): EmailMessage {
  return {
    to: input.to,
    subject: "You already have a Bekvor account",
    text: [
      "Someone tried to sign up for Bekvor with this email address, which already has an account.",
      "",
      `If it was you, log in here: ${input.loginLink}`,
      `Forgot your password? Set a new one here: ${input.resetLink}`,
      "",
      "If it wasn't you, you can ignore this email. Nothing about your account changed.",
    ].join("\n"),
  };
}

export interface NewCaseLine {
  creatorUsername: string;
  verdict: string;
  link: string;
}

export function newCasesEmail(input: { to: string; workspaceName: string; cases: NewCaseLine[]; casesLink: string; settingsLink: string }): EmailMessage {
  const shown = input.cases.slice(0, 10);
  const more = input.cases.length - shown.length;
  const count = input.cases.length;
  return {
    to: input.to,
    subject: `${count} new ${count === 1 ? "case" : "cases"} in ${input.workspaceName}`,
    text: [
      `Bekvor opened ${count} new ${count === 1 ? "case" : "cases"} in “${input.workspaceName}”: paid posts the rights check couldn't clear. A verdict is a signal for review, not a legal finding.`,
      "",
      ...shown.map((c) => `- @${c.creatorUsername}: ${c.verdict}\n  ${c.link}`),
      ...(more > 0 ? [`- and ${more} more`] : []),
      "",
      `All cases: ${input.casesLink}`,
      "",
      `You get this because you work cases in this workspace. Turn these emails off in Settings: ${input.settingsLink}`,
    ].join("\n"),
  };
}
