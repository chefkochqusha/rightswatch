import type { RightsRecordInput } from '../rights-engine/types';
import { FIXTURE_RIGHTS_RECORDS_BY_TRACK_ID } from './fixtures';

/**
 * Demo Mode's stand-in for a real, Prisma-backed rights repository (Brief
 * §42 lists "rights" as its own domain module, separate from the pure
 * `rights-engine`). Once the database is live (Phase 4/5), a real
 * repository implementing the same `RightsRepository` shape — querying
 * `RightsRecord` rows by `musicTrackId` and mapping them to
 * `RightsRecordInput` — replaces this at the call site only; nothing that
 * consumes a `RightsRepository` needs to change.
 */
export interface RightsRepository {
  getRecordsForTrack(trackId: string): Promise<RightsRecordInput[]>;
}

export class FixtureRightsRepository implements RightsRepository {
  async getRecordsForTrack(trackId: string): Promise<RightsRecordInput[]> {
    return FIXTURE_RIGHTS_RECORDS_BY_TRACK_ID[trackId] ?? [];
  }
}
