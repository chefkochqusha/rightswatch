import type { RightsRecordInput } from '../rights-engine/types';
import { DEMO_RIGHTS_RECORDS_BY_TRACK_ID } from '../demo-data/catalog';

/**
 * Read access to the rights records on file for a track (Brief §42 lists
 * "rights" as its own domain module, separate from the pure
 * `rights-engine`). This implementation serves the demo catalogue's records
 * (`modules/demo-data/catalog.ts`); a workspace's own Rights Library (Brief
 * §10) implements the same interface from its `RightsRecord` rows, and
 * nothing that consumes a `RightsRepository` changes.
 */
export interface RightsRepository {
  getRecordsForTrack(trackId: string): Promise<RightsRecordInput[]>;
}

export class FixtureRightsRepository implements RightsRepository {
  async getRecordsForTrack(trackId: string): Promise<RightsRecordInput[]> {
    return DEMO_RIGHTS_RECORDS_BY_TRACK_ID[trackId] ?? [];
  }
}
