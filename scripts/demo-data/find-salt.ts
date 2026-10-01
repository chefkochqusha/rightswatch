/**
 * Finds a seed for the demo dataset (`src/modules/demo-data/content.ts`'s
 * `DEMO_SALT`) under which Demo Mode's window lands exactly on Brief §48's
 * numbers: 48 monitored creators, 186 new videos, 27 music matches, 11 open
 * cases, 7 newly detected matches.
 *
 * Run it after changing anything that moves those numbers — a posting rate,
 * a track weight, a rights record, a scenario:
 *
 *   npx tsx scripts/demo-data/find-salt.ts [startAt]
 *
 * and put the salt it prints into `DEMO_SALT`. `demo-snapshot.test.ts`
 * fails until you do.
 */
import { computeDemoSnapshot } from "../../src/modules/scan-pipeline/demo-snapshot";

const TARGET = { monitoredCreators: 48, videos: 186, musicMatches: 27, openCases: 11, newMatches: 7 };

async function main() {
  const startAt = Number(process.argv[2] ?? 0);
  for (let n = startAt; n < startAt + 200_000; n++) {
    const salt = `rw-demo-${n}`;
    const { counts } = await computeDemoSnapshot(salt);
    if (
      counts.monitoredCreators === TARGET.monitoredCreators &&
      counts.videos === TARGET.videos &&
      counts.musicMatches === TARGET.musicMatches &&
      counts.openCases === TARGET.openCases &&
      counts.newMatches === TARGET.newMatches
    ) {
      console.log(`Found: ${salt}`, counts);
      return;
    }
    if (n % 1000 === 0) console.log(`…tried up to ${salt}`, counts);
  }
  console.log("No salt found in this range; try another start or loosen the generator.");
  process.exit(1);
}

void main();
