#!/usr/bin/env bash
# Renew Let's Encrypt certificate and reload nginx.
# Intended for crontab: 0 3 * * * /opt/zisun/scripts/renew_cert.sh <domain> <ssl_dir>
set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <ssl_dir>}"
SSL_DIR="${2:?Usage: $0 <domain> <ssl_dir>}"

docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  certbot/certbot renew --quiet

CERT_PATH="$(pwd)/certbot/conf/live/$DOMAIN"
cp "$CERT_PATH/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$CERT_PATH/privkey.pem"   "$SSL_DIR/privkey.pem"
chmod 600 "$SSL_DIR/privkey.pem"

docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
