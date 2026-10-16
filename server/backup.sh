#!/bin/bash
# Backup harian DB Super Muncul (cron di VPS: 0 4 * * * = 03.00 WIB, server ber-zona Asia/Shanghai).
# Simpan 14 hari terakhir di ~/backups/supermuncul. Restore:
#   gunzip -c FILE | docker compose -f ~/supermuncul/docker-compose.yml exec -T db psql -U supermuncul supermuncul
set -euo pipefail
DIR="$HOME/backups/supermuncul"
mkdir -p "$DIR"
F="$DIR/supermuncul-$(date +%Y%m%d-%H%M).sql.gz"

docker compose -f "$HOME/supermuncul/docker-compose.yml" exec -T db \
  pg_dump -U supermuncul --clean --if-exists supermuncul | gzip > "$F.tmp"
gzip -t "$F.tmp"   # dump rusak/terpotong -> gagal di sini, file lama tetap aman
mv "$F.tmp" "$F"
find "$DIR" -name 'supermuncul-*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') OK $(du -h "$F" | cut -f1) $F"
