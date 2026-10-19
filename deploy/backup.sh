#!/bin/sh
# Nightly encrypted Postgres dump. Needs BACKUP_AGE_RECIPIENT (an age public key)
# in deploy/.env; the private key never lives on the server.
#
# A failed dump must never look like a backup: POSIX sh has no pipefail, so
# pg_dump's exit status is passed out of the pipe by hand, the file is written
# under a temporary name and renamed only when both pg_dump and age succeeded,
# and old backups are pruned only after a good one exists.
set -eu
dir="${BACKUP_DIR:-/backups}"
stamp=$(date -u +%Y-%m-%dT%H%M)
out="$dir/rightswatch-$stamp.dump.age"
part="$out.partial"
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "backup: BACKUP_AGE_RECIPIENT is not set, refusing to write an unencrypted dump" >&2
  exit 1
fi
dump_status=$(
  { { pg_dump -h "${BACKUP_DB_HOST:-db}" -U rightswatch -d rightswatch --format=custom && s=0 || s=$?; echo "$s" >&3; } \
    | age -r "$BACKUP_AGE_RECIPIENT" > "$part"; } 3>&1
) || { rm -f "$part"; echo "backup: FAILED, encryption (age) did not finish; no backup written" >&2; exit 1; }
if [ "$dump_status" != "0" ]; then
  rm -f "$part"
  echo "backup: FAILED, pg_dump exited with $dump_status; no backup written" >&2
  exit 1
fi
mv "$part" "$out"
find "$dir" -name 'rightswatch-*.dump.age' -mtime +14 -delete
echo "backup: wrote $(basename "$out") ($(wc -c < "$out") bytes)"
