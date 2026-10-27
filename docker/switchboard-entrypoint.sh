#!/bin/sh
set -e

# Attachment download URL signing (PH 6.2.3+). Filesystem attachment storage
# hands readers HMAC-signed /attachments URLs via download-target; under
# NODE_ENV=production the switchboard refuses those (503) unless
# PH_ATTACHMENT_URL_SIGNING_SECRET is set (>= 32 chars, no surrounding
# whitespace, same value on every instance sharing the storage). The file
# watcher downloads through download-target, so fail fast instead of
# starting a switchboard whose downloads are silently broken.
if [ -z "${PH_ATTACHMENT_URL_SIGNING_SECRET:-}" ]; then
    # An empty value would make the switchboard reject the secret at boot.
    unset PH_ATTACHMENT_URL_SIGNING_SECRET
    if [ "$NODE_ENV" = "production" ] && [ "${PH_ATTACHMENT_STORAGE:-filesystem}" = "filesystem" ]; then
        echo "[entrypoint] ERROR: PH_ATTACHMENT_URL_SIGNING_SECRET is not set." >&2
        echo "[entrypoint] Set it to a random secret of at least 32 characters, e.g. \$(openssl rand -hex 32)," >&2
        echo "[entrypoint] or use PH_ATTACHMENT_STORAGE=s3 (presigned URLs, no secret needed)." >&2
        exit 1
    fi
elif [ "${#PH_ATTACHMENT_URL_SIGNING_SECRET}" -lt 32 ]; then
    echo "[entrypoint] ERROR: PH_ATTACHMENT_URL_SIGNING_SECRET must be at least 32 characters." >&2
    exit 1
fi

# Regenerate Prisma client for current platform (fixes darwin-arm64 vs linux-musl-openssl mismatch)
echo "[entrypoint] Regenerating Prisma client for current platform..."
prisma generate --schema node_modules/document-drive/dist/prisma/schema.prisma

# Run migrations if DATABASE_URL is postgres and migrations not skipped
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "^postgres" && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running Prisma db push..."
    prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma --skip-generate
    echo "[entrypoint] Running migrations..."
    ph switchboard --migrate
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
exec ph switchboard --port ${PORT:-3000}
