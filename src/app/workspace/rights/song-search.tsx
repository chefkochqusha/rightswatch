"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { CoverArt } from "@/components/music/cover-art";
import { buttonStyles } from "@/components/ui/button";
import { CheckIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import type { SongSearchApiResult } from "@/app/api/v1/songs/search/route";
import { addSongAction, type AddSongState } from "./actions";

const DEBOUNCE_MS = 350;

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; results: SongSearchApiResult[] }
  | { status: "error"; query: string; message: string };

/**
 * The catalogue's search box (Brief §10; "search like Spotify"): results
 * appear while typing — a song, an artist, or an ISRC — each one a click
 * away from the catalogue. Typing waits a moment before searching and
 * cancels a search that's been overtaken, so the public music database
 * behind it isn't asked for every keystroke. A song that can't be found
 * can be added by hand.
 */
export function SongSearch({ canManage }: { canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [manualOpen, setManualOpen] = useState(false);
  const inputId = useId();
  const resultsId = useId();

  const text = query.trim();
  const active = text.length >= 2;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch({ status: "loading", query: text });
      try {
        const response = await fetch(`/api/v1/songs/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) {
          setSearch({ status: "error", query: text, message: body?.error?.message ?? "Song search isn't available right now." });
        } else {
          setSearch({ status: "done", query: text, results: body.results });
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSearch({ status: "error", query: text, message: "Song search isn't reachable. Check your connection and try again." });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, active]);

  // Results for an earlier query stay up while the next one is typed, the
  // way a music app's search behaves; clearing the box clears them.
  const shown: SearchState = active ? search : { status: "idle" };

  return (
    <div>
      <div role="search" className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search for a song to add
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-t2" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a song, an artist or an ISRC"
          autoComplete="off"
          spellCheck={false}
          aria-controls={resultsId}
          className="block h-12 w-full rounded-full border border-line bg-surface pr-5 pl-11 text-[0.9375rem] text-tx shadow-[0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-t2"
        />
      </div>

      <div id={resultsId} aria-live="polite" className="mt-3">
        {shown.status === "loading" && <ResultsSkeleton />}
        {shown.status === "error" && (
          <p className="rounded-2xl bg-unknown-bg px-4 py-3 text-sm text-unknown">
            {shown.message}{" "}
            {canManage && (
              <button type="button" onClick={() => setManualOpen(true)} className="font-medium underline">
                Add it by hand
              </button>
            )}
          </p>
        )}
        {shown.status === "done" &&
          (shown.results.length === 0 ? (
            <p className="px-1 py-2 text-sm text-t2">
              No songs match “{shown.query}”. Check the spelling, try the artist&apos;s name, or add the song by hand.
            </p>
          ) : (
            <ul aria-label="Search results" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {shown.results.map((song) => (
                <SearchResultRow key={`${song.source}:${song.externalId}`} song={song} canManage={canManage} />
              ))}
            </ul>
          ))}
      </div>

      {canManage && (
        <div className="mt-3">
          {manualOpen ? (
            <ManualAddForm onClose={() => setManualOpen(false)} />
          ) : (
            <button type="button" onClick={() => setManualOpen(true)} className="px-1 text-[0.8125rem] font-medium text-accent hover:underline">
              Add a song by hand
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ song, canManage }: { song: SongSearchApiResult; canManage: boolean }) {
  const [state, formAction, pending] = useActionState<AddSongState, FormData>(addSongAction, {});
  const catalogueTrackId = state.added?.trackId ?? song.catalogueTrackId;
  const year = song.releaseDate?.slice(0, 4);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <CoverArt title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} className="h-11 w-11 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium text-tx">{song.title}</p>
        <p className="truncate text-[0.8125rem] text-t2">
          <span className="text-tx/80">{song.artist || "Unknown artist"}</span>
          {(song.album || year) && <span className="ml-2">{[song.album, year].filter(Boolean).join(", ")}</span>}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-t2 tabular-nums sm:block">
        {song.isrc && <p>{song.isrc}</p>}
        {song.durationMs && <p>{formatDuration(song.durationMs)}</p>}
      </div>
      <div className="w-[7.5rem] shrink-0 text-right">
        {catalogueTrackId ? (
          <Link
            href={`/workspace/rights/${catalogueTrackId}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.8125rem] font-medium text-cleared hover:bg-cleared-bg"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            {state.added ? "Added" : "In catalogue"}
          </Link>
        ) : canManage ? (
          <form action={formAction}>
            <input type="hidden" name="source" value={song.source} />
            <input type="hidden" name="externalId" value={song.externalId} />
            <input type="hidden" name="title" value={song.title} />
            <input type="hidden" name="artist" value={song.artist} />
            <input type="hidden" name="album" value={song.album ?? ""} />
            <input type="hidden" name="isrc" value={song.isrc ?? ""} />
            <input type="hidden" name="durationMs" value={song.durationMs ?? ""} />
            <input type="hidden" name="artworkUrl" value={song.artworkUrl ?? ""} />
            <button type="submit" disabled={pending} className={buttonStyles("secondary", "sm")}>
              <PlusIcon className="h-3.5 w-3.5" />
              {pending ? "Adding…" : "Add"}
            </button>
          </form>
        ) : null}
        {state.error && <p className="mt-1 text-xs text-mismatch">{state.error}</p>}
      </div>
    </li>
  );
}

function ManualAddForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<AddSongState, FormData>(addSongAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.added) formRef.current?.reset();
  }, [state]);

  return (
    <ActionForm ref={formRef} action={formAction} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <input type="hidden" name="source" value="manual" />
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[0.9375rem] font-semibold">Add a song by hand</h3>
        <button type="button" onClick={onClose} className="text-[0.8125rem] text-t2 hover:text-tx">
          Close
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1.4fr_1.2fr_1fr]">
        <FormField label="Title" name="title" id="manual-title" autoComplete="off" maxLength={200} error={state.fieldErrors?.title} />
        <FormField label="Artist" name="artist" id="manual-artist" optional autoComplete="off" maxLength={200} />
        <FormField label="ISRC" name="isrc" id="manual-isrc" optional autoComplete="off" placeholder="USUM71900001" error={state.fieldErrors?.isrc} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending ? "Adding…" : "Add song"}
        </button>
        <p role="status" className="text-[0.8125rem]">
          {state.error ? (
            <span className="text-mismatch">{state.error}</span>
          ) : state.added ? (
            <span className="text-t2">
              “{state.added.title}” is in your catalogue.{" "}
              <Link href={`/workspace/rights/${state.added.trackId}`} className="font-medium text-accent hover:underline">
                Add its rights
              </Link>
            </span>
          ) : null}
        </p>
      </div>
    </ActionForm>
  );
}

function ResultsSkeleton() {
  return (
    <ul aria-hidden="true" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 px-4 py-2.5">
          <span className="h-11 w-11 animate-pulse rounded-md bg-surface-2" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded bg-surface-2" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
