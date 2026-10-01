import type { CatalogRepository } from "@/modules/catalog";
import { PrismaCatalogRepository } from "@/modules/catalog/prisma-repository";
import type { RightsRecordRepository } from "@/modules/rights";
import { PrismaRightsRecordRepository } from "@/modules/rights/prisma-repository";
import type { CampaignDirectory } from "@/modules/campaigns";
import { PrismaCampaignDirectory } from "@/modules/campaigns/prisma-repository";

/**
 * The Rights Library's data (Brief §10) — the song catalogue, the rights
 * records on each song, and the campaigns a record can be scoped to — in
 * Postgres, one shared store per server process like every other
 * `*-store.ts` here.
 */
interface LibraryStore {
  catalog: CatalogRepository;
  rights: RightsRecordRepository;
  campaigns: CampaignDirectory;
}

const globalForLibrary = globalThis as unknown as { __rightswatchLibraryStore?: LibraryStore };

export function getLibraryStore(): LibraryStore {
  if (!globalForLibrary.__rightswatchLibraryStore) {
    globalForLibrary.__rightswatchLibraryStore = {
      catalog: new PrismaCatalogRepository(),
      rights: new PrismaRightsRecordRepository(),
      campaigns: new PrismaCampaignDirectory(),
    };
  }
  return globalForLibrary.__rightswatchLibraryStore;
}
