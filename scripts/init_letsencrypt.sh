#!/usr/bin/env bash
# Obtain a Let's Encrypt TLS certificate using Certbot (webroot challenge).
# Run this once on the production server before starting nginx with HTTPS.
#
# Usage:
#   ./scripts/init_letsencrypt.sh <domain> <email>
#   Example: ./scripts/init_letsencrypt.sh zisun.in ops@zisun.in
set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"
CERTBOT_WEBROOT="/var/www/certbot"
SSL_DIR="./nginx/ssl"

command -v docker >/dev/null 2>&1 || { echo "docker is required"; exit 1; }

echo "==> Requesting certificate for $DOMAIN (email: $EMAIL)"

# 1. Start nginx with HTTP only so the ACME challenge can be served
#    (comment out the ssl_certificate lines temporarily, or use a staging run)

# 2. Run certbot in webroot mode
docker run --rm \
  -v "${CERTBOT_WEBROOT}:/var/www/certbot" \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# 3. Copy the issued cert to nginx/ssl/
CERT_PATH="$(pwd)/certbot/conf/live/$DOMAIN"
mkdir -p "$SSL_DIR"
cp "$CERT_PATH/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$CERT_PATH/privkey.pem"   "$SSL_DIR/privkey.pem"
chmod 600 "$SSL_DIR/privkey.pem"

echo ""
echo "Certificate written to $SSL_DIR/"
echo "Reload nginx:  docker compose -f docker-compose.prod.yml exec nginx nginx -s reload"
echo ""
echo "Set up auto-renewal (add to crontab):"
echo "  0 3 * * * $(pwd)/scripts/renew_cert.sh $DOMAIN $SSL_DIR"
