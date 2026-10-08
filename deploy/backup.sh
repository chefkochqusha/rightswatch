#!/bin/sh
# Nightly encrypted Postgres dump. Needs BACKUP_AGE_RECIPIENT (an age public key)
# in deploy/.env; the private key never lives on the server.
set -eu
stamp=$(date -u +%Y-%m-%dT%H%M)
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "backup: BACKUP_AGE_RECIPIENT is not set, refusing to write an unencrypted dump" >&2
  exit 1
fi
pg_dump -h db -U rightswatch -d rightswatch --format=custom \
  | age -r "$BACKUP_AGE_RECIPIENT" > "/backups/rightswatch-$stamp.dump.age"
find /backups -name 'rightswatch-*.dump.age' -mtime +14 -delete
echo "backup: wrote rightswatch-$stamp.dump.age"
