$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  docker compose up -d --wait postgres
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
  # Also handles existing volumes created before the test database was introduced.
  docker compose exec -T postgres psql -U phonemail -d postgres -f /docker-entrypoint-initdb.d/01-test.sql
  if ($LASTEXITCODE -ne 0) { throw 'Test database setup failed.' }
  docker compose run --rm test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
} finally { Pop-Location }
