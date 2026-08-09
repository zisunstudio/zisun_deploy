#!/usr/bin/env bash
# Generate RSA-2048 key pair for JWT signing (RS256).
# Writes private.pem and public.pem, then prints the .env-ready single-line values.
set -euo pipefail

OUTDIR="${1:-./keys}"
mkdir -p "$OUTDIR"

echo "Generating RSA-2048 key pair in $OUTDIR ..."

openssl genrsa -out "$OUTDIR/private.pem" 2048 2>/dev/null
openssl rsa -in "$OUTDIR/private.pem" -pubout -out "$OUTDIR/public.pem" 2>/dev/null

chmod 600 "$OUTDIR/private.pem"

echo ""
echo "Keys written to $OUTDIR/private.pem and $OUTDIR/public.pem"
echo ""
echo "Add these to your .env (newlines replaced with \\n):"
echo ""
echo "JWT_PRIVATE_KEY=\"$(awk 'NF{printf "%s\\n", $0}' "$OUTDIR/private.pem")\""
echo ""
echo "JWT_PUBLIC_KEY=\"$(awk 'NF{printf "%s\\n", $0}' "$OUTDIR/public.pem")\""
echo ""
echo "IMPORTANT: Keep private.pem secret. Never commit it to version control."
