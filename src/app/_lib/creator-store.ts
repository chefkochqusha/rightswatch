import type { CreatorRepository } from "@/modules/creators";
import { PrismaCreatorRepository } from "@/modules/creators/prisma-repository";

/** The workspace watchlists, in Postgres — one shared store per server
 *  process, like every other `*-store.ts` here. */
interface CreatorStore {
  creators: CreatorRepository;
}

const globalForCreators = globalThis as unknown as { __rightswatchCreatorStore?: CreatorStore };

export function getCreatorStore(): CreatorStore {
  if (!globalForCreators.__rightswatchCreatorStore) {
    globalForCreators.__rightswatchCreatorStore = { creators: new PrismaCreatorRepository() };
  }
  return globalForCreators.__rightswatchCreatorStore;
}
