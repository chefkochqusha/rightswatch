export interface CountryOption {
  code: string;
  name: string;
}

/**
 * A creator's country (Brief §8), stored as its ISO code. Optional: a
 * country is the territory signal for the creator's posts (the platform
 * reports none), but "unknown" is a real answer.
 *
 * The options come in as props, named on the server (`countryOptions()`):
 * country names come from the runtime's locale data, and a browser's can
 * differ from the server's ("Falkland Islands" vs "Falkland Islands (Islas
 * Malvinas)"), which would make the server-rendered list and the hydrated
 * one disagree.
 */
export function CountrySelect({
  options,
  id = "country",
  name = "country",
  defaultValue,
  error,
}: {
  options: CountryOption[];
  id?: string;
  name?: string;
  defaultValue?: string | null;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.8125rem] font-medium text-tx">
        Country <span className="font-normal text-t2">(optional)</span>
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-1.5 block w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx aria-invalid:border-mismatch"
      >
        <option value="">Not known</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] text-mismatch">
          {error}
        </p>
      )}
    </div>
  );
}
