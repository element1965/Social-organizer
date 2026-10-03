#!/bin/sh
# Нужные переменные (Railway variables сервиса, не в репо):
#   DATABASE_URL       — строка подключения к Postgres проекта (internal)
#   BACKUP_INGEST_URL  — https://so-backup-ingest.lambertain.workers.dev
#   BACKUP_INGEST_KEY  — секрет Worker'а
set -eu
TS=$(date -u +%Y-%m-%d_%H%M)
FILE=/tmp/so-$TS.dump
pg_dump --format=custom --compress=9 --no-owner --no-acl "$DATABASE_URL" -f "$FILE"
SIZE=$(wc -c < "$FILE")
[ "$SIZE" -gt 10000 ] || { echo "dump too small ($SIZE bytes) — aborting"; exit 1; }
put() { curl -fsS -X PUT -H "Authorization: Bearer $BACKUP_INGEST_KEY" --data-binary @"$FILE" "$BACKUP_INGEST_URL/b/$1"; echo; }
put "daily/so-$TS.dump"
# 1-го числа — ещё и месячная копия (хранится 400 дней).
[ "$(date -u +%d)" = "01" ] && put "monthly/so-$TS.dump"
echo "backup ok: $FILE ($SIZE bytes)"
