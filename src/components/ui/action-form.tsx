"use client";

import { startTransition } from "react";

/**
 * A form that submits to a Server Action without clearing itself. React 19
 * resets an uncontrolled `<form action={…}>` once its action finishes —
 * whatever the action returned — so a form whose input fails validation
 * would come back empty, and the person would have to type everything
 * again. Submitting through `startTransition` instead keeps what they
 * typed, and still drives `useActionState`'s pending flag. A form that
 * should clear after it succeeds resets itself (see its own effect).
 */
export function ActionForm({
  action,
  children,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  ref?: React.Ref<HTMLFormElement>;
}) {
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(formData));
      }}
    >
      {children}
    </form>
  );
}
