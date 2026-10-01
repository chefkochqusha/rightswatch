/**
 * Shared text input: label, field, optional hint, and an inline error
 * (Brief §37: say what's wrong, next to where it's wrong). Focus styling
 * comes from the global `:focus-visible` rule in `globals.css`.
 */
export function FormField({
  label,
  name,
  id,
  type = "text",
  placeholder,
  error,
  hint,
  optional,
  autoComplete,
  defaultValue,
  inputMode,
  maxLength,
}: {
  label: string;
  name: string;
  /** Defaults to `name`; set it when two forms on one page share a name. */
  id?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  const fieldId = id ?? name;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={fieldId} className="block text-[0.8125rem] font-medium text-tx">
        {label}
        {optional && <span className="font-normal text-t2"> (optional)</span>}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        placeholder={placeholder}
        required={!optional}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx placeholder:text-t2 aria-invalid:border-mismatch"
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-1.5 text-[0.8125rem] text-mismatch">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${fieldId}-hint`} className="mt-1.5 text-[0.8125rem] text-t2">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
