/**
 * What an uploaded file is, from its first bytes — never from its name or
 * the browser's claim. Only the audio and video containers people actually
 * have (a song from a label, a post saved from TikTok) are accepted; the
 * recognition service then decodes it with ffmpeg, and a file that only
 * looks right fails there with "no readable audio".
 */
export type MediaFormat = "mp3" | "wav" | "flac" | "ogg" | "aac" | "mp4" | "webm" | "aiff";

export function sniffMediaFormat(head: Uint8Array): MediaFormat | null {
  const at = (offset: number, ascii: string) =>
    head.length >= offset + ascii.length && [...ascii].every((ch, i) => head[offset + i] === ch.charCodeAt(0));

  if (at(0, "ID3")) return "mp3";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (at(0, "FORM") && (at(8, "AIFF") || at(8, "AIFC"))) return "aiff";
  if (at(0, "fLaC")) return "flac";
  if (at(0, "OggS")) return "ogg";
  if (at(4, "ftyp")) return "mp4"; // .mp4, .m4a, .mov
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  if (head.length >= 2 && head[0] === 0xff) {
    if ((head[1] & 0xf6) === 0xf0) return "aac"; // ADTS
    if ((head[1] & 0xe0) === 0xe0) return "mp3"; // MPEG audio frame without a tag
  }
  return null;
}

export const MEDIA_FORMAT_LABEL = "MP3, WAV, AIFF, FLAC, OGG, AAC, M4A, MP4, MOV or WebM";
