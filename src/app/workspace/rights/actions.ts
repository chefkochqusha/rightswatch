"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getAuditStore } from "@/app/_lib/audit-store";
import { reassessSong } from "@/app/_lib/reassess";
import { addSong, removeSong, updateSongDetails, type AddSongError, type CatalogTrackRecord } from "@/modules/catalog";
import { parseRightsRecordForm, type RightsRecordField } from "@/modules/rights";

/**
 * Rights Library actions (Brief §10): the catalogue's songs and each song's
 * rights records. Gated to the ANALYST tier and up (`requireCaseManager`:
 * "monitoring + cases + rights"), scoped to the caller's workspace by the
 * modules themselves, and audit-logged (Brief §14) against the song, so
 * the log links to it.
 *
 * Anything that changes what a verdict rests on — a song joining the
 * catalogue, a rights record added, changed or deleted — re-assesses the
 * song's posts straight away (`reassess.ts`), so the feed never shows a
 * verdict the library has since overruled.
 */

export interface AddSongState {
  error?: string;
  fieldErrors?: Partial<Record<"title" | "isrc", string>>;
  /** Set on success. */
  added?: { trackId: string; title: string; postsFound: number };
}

const ADD_ERRORS: Record<AddSongError, { field?: "title" | "isrc"; message: string }> = {
  TITLE_REQUIRED: { field: "title", message: "Enter the song's title." },
  ISRC_INVALID: { field: "isrc", message: "That isn't an ISRC. An ISRC has 12 characters, like USUM71900001." },
  ALREADY_IN_CATALOGUE: { message: "This song is already in your catalogue." },
};

const SOURCES = new Set(["musicbrainz", "demo", "manual"]);
const ARTWORK_PREFIX = "https://coverartarchive.org/release/";

/** Adds a song — one picked from search, or one entered by hand. */
export async function addSongAction(_prev: AddSongState, formData: FormData): Promise<AddSongState> {
  const session = await requireCaseManager();
  const source = String(formData.get("source") ?? "manual");
  const duration = Number(formData.get("durationMs"));
  const artworkUrl = String(formData.get("artworkUrl") ?? "");

  const result = await addSong(
    {
      workspaceId: session.workspace.id,
      title: String(formData.get("title") ?? ""),
      artist: text(formData, "artist", 200),
      isrc: text(formData, "isrc", 32),
      album: text(formData, "album", 200),
      durationMs: Number.isInteger(duration) && duration > 0 && duration < 24 * 3_600_000 ? duration : null,
      source: SOURCES.has(source) ? (source as "musicbrainz" | "demo" | "manual") : "manual",
      externalId: text(formData, "externalId", 64),
      // Only cover art from the Cover Art Archive, which search results use.
      artworkUrl: artworkUrl.startsWith(ARTWORK_PREFIX) && artworkUrl.length < 200 ? artworkUrl : null,
    },
    { catalogRepository: getLibraryStore().catalog },
  );
  if (!result.ok) {
    const { field, message } = ADD_ERRORS[result.error];
    return field ? { fieldErrors: { [field]: message } } : { error: message };
  }

  await auditSong(session.workspace.id, session.user.id, "song.added", result.track);
  // A scan may already have found it in posts, as someone else's song.
  const { posts } = result.wasIdentified
    ? await reassessSong(session.workspace.id, result.track.id, session.user.id)
    : { posts: 0 };
  revalidatePath("/workspace", "layout");
  return { added: { trackId: result.track.id, title: result.track.title, postsFound: posts } };
}

/** Adds a song the workspace already knows — one a scan heard in posts, or
 *  one taken out of the catalogue earlier — and assesses its posts. */
export async function addKnownSongAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const track = await findTrackOrThrow(session.workspace.id, String(formData.get("trackId") ?? ""));
  const result = await addSong(
    { workspaceId: session.workspace.id, title: track.title, artist: track.artist, isrc: track.isrc, externalId: track.externalId, source: "manual" },
    { catalogRepository: getLibraryStore().catalog },
  );
  if (result.ok) {
    await auditSong(session.workspace.id, session.user.id, "song.added", result.track);
    await reassessSong(session.workspace.id, result.track.id, session.user.id);
  }
  revalidatePath("/workspace", "layout");
}

export async function removeSongAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const result = await removeSong(
    { workspaceId: session.workspace.id, trackId: String(formData.get("trackId") ?? "") },
    { catalogRepository: getLibraryStore().catalog },
  );
  if (!result.ok) throw new Error("That song isn't in your catalogue.");
  await auditSong(session.workspace.id, session.user.id, "song.removed", result.track);
  revalidatePath("/workspace", "layout");
  redirect("/workspace/rights");
}

export interface SongDetailsState {
  error?: string;
  saved?: boolean;
}

export async function updateSongDetailsAction(_prev: SongDetailsState, formData: FormData): Promise<SongDetailsState> {
  const session = await requireCaseManager();
  const result = await updateSongDetails(
    {
      workspaceId: session.workspace.id,
      trackId: String(formData.get("trackId") ?? ""),
      catalogueId: String(formData.get("catalogueId") ?? ""),
      rightsOwner: String(formData.get("rightsOwner") ?? ""),
      publisher: String(formData.get("publisher") ?? ""),
      label: String(formData.get("label") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    },
    { catalogRepository: getLibraryStore().catalog },
  );
  if (!result.ok) {
    return { error: result.error === "NOT_FOUND" ? "That song isn't in this workspace." : "Keep each field under 200 characters, and notes under 2,000." };
  }
  await auditSong(session.workspace.id, session.user.id, "song.updated", result.track);
  revalidatePath("/workspace", "layout");
  return { saved: true };
}

export interface RightsRecordState {
  fieldErrors?: Partial<Record<RightsRecordField, string>>;
  error?: string;
  saved?: boolean;
}

/** Adds a rights record to a song, or — with `recordId` — changes one. */
export async function saveRightsRecordAction(_prev: RightsRecordState, formData: FormData): Promise<RightsRecordState> {
  const session = await requireCaseManager();
  const workspaceId = session.workspace.id;
  const library = getLibraryStore();
  const track = await findTrackOrThrow(workspaceId, String(formData.get("trackId") ?? ""));
  if (!track.inCatalogue) return { error: "Add the song back to your catalogue before changing its rights." };

  const campaigns = await library.campaigns.findForWorkspace(workspaceId);
  const parsed = parseRightsRecordForm(
    {
      commercial: formData.get("commercial") === "on",
      organic: formData.get("organic") === "on",
      territoryScope: String(formData.get("territoryScope") ?? "worldwide"),
      territories: String(formData.get("territories") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      campaignScope: String(formData.get("campaignScope") ?? "all"),
      campaignIds: formData.getAll("campaignIds").map(String),
      notes: String(formData.get("notes") ?? ""),
      source: String(formData.get("source") ?? ""),
    },
    campaigns.map((campaign) => campaign.id),
  );
  if (!parsed.ok) return { fieldErrors: parsed.errors };

  const recordId = String(formData.get("recordId") ?? "");
  if (recordId) {
    const existing = await library.rights.findById(workspaceId, recordId);
    if (!existing || existing.trackId !== track.id) return { error: "That rights record isn't on this song anymore." };
    await library.rights.update(existing.id, parsed.values);
  } else {
    await library.rights.create({ ...parsed.values, workspaceId, trackId: track.id });
  }

  await auditSong(workspaceId, session.user.id, recordId ? "rights.updated" : "rights.added", track);
  await reassessSong(workspaceId, track.id, session.user.id);
  revalidatePath("/workspace", "layout");
  return { saved: true };
}

export async function deleteRightsRecordAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const workspaceId = session.workspace.id;
  const library = getLibraryStore();
  const record = await library.rights.findById(workspaceId, String(formData.get("recordId") ?? ""));
  if (!record) throw new Error("That rights record isn't in this workspace.");
  const track = await findTrackOrThrow(workspaceId, record.trackId);

  await library.rights.delete(record.id);
  await auditSong(workspaceId, session.user.id, "rights.removed", track);
  await reassessSong(workspaceId, track.id, session.user.id);
  revalidatePath("/workspace", "layout");
}

async function findTrackOrThrow(workspaceId: string, trackId: string): Promise<CatalogTrackRecord> {
  const track = await getLibraryStore().catalog.findById(workspaceId, trackId);
  if (!track) throw new Error("That song isn't in this workspace.");
  return track;
}

function text(formData: FormData, key: string, max: number): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

async function auditSong(workspaceId: string, actorId: string, action: string, track: CatalogTrackRecord): Promise<void> {
  await getAuditStore().auditLogs.create({
    workspaceId,
    actorId,
    action,
    targetType: "song",
    targetId: track.id,
    metadata: { title: track.title, artist: track.artist },
  });
}
