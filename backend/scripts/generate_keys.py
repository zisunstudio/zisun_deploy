#!/usr/bin/env python3
"""
Generate an RS256 key pair for JWT signing and print them as env-var-ready strings.

Usage:
  python scripts/generate_keys.py

Copy the output values into your .env file (or secrets manager) as:
  JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n..."
  JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\\n..."
"""

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization


def main() -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    # Encode newlines so the value fits on one .env line
    private_env = private_pem.replace("\n", "\\n")
    public_env = public_pem.replace("\n", "\\n")

    print("# Add these to your .env file (quote the values):\n")
    print(f'JWT_PRIVATE_KEY="{private_env}"\n')
    print(f'JWT_PUBLIC_KEY="{public_env}"\n')


if __name__ == "__main__":
    main()
