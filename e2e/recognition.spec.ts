import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AUDIO_DIR, addPost, addSong, newWorkspace } from "./helpers";

/** Needs the recognition service and worker mode (CI and `e2e/README.md`). */
test.skip(!process.env.E2E_RECOGNITION, "own recognition isn't running");

test("reference audio, a post's video, a recognised song, confirmed into a case", async ({ page }) => {
  await newWorkspace(page, "E2E Recognition");
  const golden = await addSong(page, "Golden Hour");
  const night = await addSong(page, "Night Drive");

  await page.goto(`/workspace/rights/${golden}`);
  await page.locator('input[type="file"]').setInputFiles(path.join(AUDIO_DIR, "not-audio.pdf"));
  await expect(page.getByText(/isn't an audio or video file/)).toBeVisible();

  for (const [id, file] of [[golden, "song-a.mp3"], [night, "song-b.wav"]] as const) {
    await page.goto(`/workspace/rights/${id}`);
    await page.locator('input[type="file"]').setInputFiles(path.join(AUDIO_DIR, file));
    await expect(page.getByText("Ready.")).toBeVisible({ timeout: 90_000 });
  }

  await addPost(page, "7301234567890123456");
  await page.locator('input[type="file"]').setInputFiles(path.join(AUDIO_DIR, "post.mp4"));
  await expect(page.getByText(/(Song recognised|Possible match): Golden Hour/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/sped up to 1\.1\d×/)).toBeVisible();

  const audioSection = page.locator("section", { has: page.locator("#audio-check") });
  await expect(audioSection.locator("select")).toHaveValue(golden);
  await audioSection.getByRole("button", { name: /Identify song/ }).click();
  await expect(page.getByText("Potential mismatch").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Case" })).toBeVisible();

  // Wrong song: withdraw it; the post has no song again and the case is dismissed.
  await page.getByText("Wrong song?").click();
  await page.fill("#reject-note", "Checked by ear: it's a different song.");
  await page.getByRole("button", { name: "Withdraw this song" }).click();
  await expect(page.getByText("No song was identified in this post.")).toBeVisible();
  await page.goto("/workspace/audit");
  await expect(page.getByText("Withdrew a wrong song from a post").first()).toBeVisible();
});

test("uploads only from Bekvor's own pages", async ({ page, baseURL }) => {
  await newWorkspace(page, "E2E Guards");
  const body = readFileSync(path.join(AUDIO_DIR, "song-a.mp3"));
  const post = (headers: Record<string, string>) => page.request.post("/api/uploads/track-audio/nope", { headers, data: body });
  expect((await post({ Origin: "https://evil.example", "x-bekvor-upload": "1" })).status()).toBe(403);
  expect((await post({ Origin: baseURL! })).status()).toBe(403);
  expect((await post({ Origin: baseURL!, "x-bekvor-upload": "1" })).status()).toBe(404);
});
