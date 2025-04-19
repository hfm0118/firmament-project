#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs
cd certs

echo "Generating self-signed SSL certificates for development..."

# Generate a private key and a self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1"

echo "Certificates generated successfully in $(pwd)"
echo "  - cert.pem: SSL certificate"
echo "  - key.pem: Private key"
cd ..
