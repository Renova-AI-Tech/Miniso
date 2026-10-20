#!/bin/sh
set -eu

# Pre-deploy uses the migrator; the application inherits only runtime credentials.
unset MIGRATION_DATABASE_URL BOOTSTRAP_DATABASE_URL POSTGRES_ADMIN_PASSWORD
exec node apps/backend/dist/index.js
