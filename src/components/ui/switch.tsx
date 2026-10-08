"use client";

/**
 * An accessible on/off switch (a `button` with role="switch"), styled after
 * Watermelon UI's switch components. Controlled: the parent owns `checked`.
 */
export function Switch({
  checked,
  onCheckedChange,
  id,
  label,
  disabled,
  className = "",
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  /** Accessible name when no visible <label htmlFor> points at it. */
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-ultra" : "bg-tx/20"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 motion-reduce:transition-none ${
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
