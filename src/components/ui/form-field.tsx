/**
 * Shared text input used by the signup and login forms. Focus styling
 * comes from the global `:focus-visible` rule in `globals.css` — no
 * per-field focus classes needed here.
 */
export function FormField({
  label,
  name,
  type = "text",
  placeholder,
  error,
  optional,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  error?: string;
  optional?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-[0.8125rem] font-medium text-tx">
        {label}
        {optional && <span className="font-normal text-t2"> (optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={!optional}
        autoComplete={autoComplete}
        className="mt-1.5 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-tx placeholder:text-t2"
      />
      {error && <p className="mt-1.5 text-[0.8125rem] text-mismatch">{error}</p>}
    </div>
  );
}
