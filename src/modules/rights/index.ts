export type { RightsRepository } from './fixture-repository';
export { FixtureRightsRepository } from './fixture-repository';
export {
  parseRightsRecordForm,
  toFormDay,
  toRightsRecordInput,
  type RightsRecordField,
  type RightsRecordForm,
  type RightsRecordFormResult,
  type RightsRecordRepository,
  type RightsRecordRow,
  type RightsRecordValues,
} from './library';
export { InMemoryRightsRecordRepository } from './in-memory-repository';
// `PrismaRightsRecordRepository` is deliberately not re-exported — it
// imports `@/lib/prisma-client`; import it from "@/modules/rights/prisma-repository".
