import Link from "next/link";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { isOwnRecognitionEnabled } from "@/app/_lib/own-recognition";
import { PageHeader } from "@/components/ui/page-header";
import { AddPostForm } from "./add-post-form";

export const metadata = { title: "Add a post — Bekvor" };

/**
 * Adding a paid post by hand: for posts the TikTok connection doesn't
 * deliver (or before it is connected). Analyst and up.
 */
export default async function AddPostPage() {
  const session = await requireCaseManager();
  const creators = (await getCreatorStore().creators.findForWorkspace(session.workspace.id)).filter((c) => !c.removedAt);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <Link href="/workspace" className="text-[0.8125rem] text-t2 hover:text-tx">
        ← Back to overview
      </Link>
      <PageHeader
        title="Add a post"
        description={
          isOwnRecognitionEnabled()
            ? "A paid post you want checked. On the next page, upload its video or sound and Bekvor finds which of your songs it uses, or choose the song yourself."
            : "A paid post you want checked. On the next page, choose which of your songs it uses and the rights check runs."
        }
      />
      {creators.length === 0 ? (
        <p className="text-sm text-t2">
          Posts belong to a creator on your watchlist.{" "}
          <Link href="/workspace/creators" className="font-medium text-accent underline underline-offset-2">
            Add the creator first
          </Link>
          .
        </p>
      ) : (
        <AddPostForm creators={creators.map((c) => ({ id: c.id, handle: c.handle }))} today={today} />
      )}
    </div>
  );
}
