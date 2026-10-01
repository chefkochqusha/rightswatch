"use client";

import { useFormStatus } from "react-dom";
import { enterDemoAction } from "@/app/demo/actions";

function Label({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <>{pending ? pendingLabel : children}</>;
}

/**
 * "Try the demo": a form button, not a link, because opening the demo starts
 * a session (a link would do that on every prefetch). The first visit after
 * a fresh database prepares the dataset, which takes a moment, so the button
 * says so.
 */
export function DemoButton({ className, children = "Try the demo" }: { className: string; children?: React.ReactNode }) {
  return (
    <form action={enterDemoAction} className="inline-flex">
      <button type="submit" className={`${className} disabled:opacity-60`}>
        <Label pendingLabel="Preparing the demo…">{children}</Label>
      </button>
    </form>
  );
}
