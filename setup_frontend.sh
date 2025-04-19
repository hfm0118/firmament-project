#!/bin/bash

# Frontend Setup Script for Firmament Project
# This script:
# 1. Sets up HTTPS certificates for the frontend
# 2. Applies the nginx-firmament configuration

set -e  # Exit immediately if a command exits with a non-zero status

# Output styling
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   Firmament Frontend Setup Script      ${NC}"
echo -e "${GREEN}=========================================${NC}"

# Check if script is run as root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}This script must be run as root. Try 'sudo $0'${NC}"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if nginx is installed
if ! command_exists nginx; then
    echo -e "${YELLOW}Nginx not found. Installing...${NC}"
    apt-get update
    apt-get install -y nginx
fi

# Create directory for certificates
CERT_DIR="/etc/nginx/ssl"
mkdir -p $CERT_DIR

# Determine the server name (IP or domain)
SERVER_NAME=$(grep "server_name" nginx-firmament | head -1 | awk '{print $2}' | sed 's/;$//')
if [ -z "$SERVER_NAME" ]; then
    # Fallback to the server's public IP if server_name not found
    SERVER_NAME=$(curl -s ifconfig.me)
    echo -e "${YELLOW}Server name not found in nginx config, using public IP: $SERVER_NAME${NC}"
fi

# Check if Let's Encrypt certificates are available
LETSENCRYPT_DIR="/etc/letsencrypt/live/$SERVER_NAME"
USE_LETSENCRYPT=false

if [ -d "$LETSENCRYPT_DIR" ] && [ -f "$LETSENCRYPT_DIR/fullchain.pem" ] && [ -f "$LETSENCRYPT_DIR/privkey.pem" ]; then
    echo -e "${GREEN}Let's Encrypt certificates found for $SERVER_NAME${NC}"
    USE_LETSENCRYPT=true
else
    echo -e "${YELLOW}Let's Encrypt certificates not found. Generating self-signed certificates...${NC}"
    
    # Generate self-signed certificates
    echo -e "${GREEN}Generating self-signed SSL certificate for $SERVER_NAME${NC}"
    
    # Generate SSL certificate with proper Subject Alternative Names
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$CERT_DIR/nginx-selfsigned.key" \
        -out "$CERT_DIR/nginx-selfsigned.crt" \
        -subj "/CN=$SERVER_NAME" \
        -addext "subjectAltName=DNS:$SERVER_NAME,DNS:localhost,IP:127.0.0.1"
    
    echo -e "${GREEN}Self-signed certificates generated successfully${NC}"
    
    # Create Diffie-Hellman parameters for added security
    echo -e "${GREEN}Generating Diffie-Hellman parameters (this might take a while)...${NC}"
    openssl dhparam -out "$CERT_DIR/dhparam.pem" 2048
    
    # Create a unified SSL parameters file for better security
    cat > /etc/nginx/snippets/self-signed.conf <<EOF
ssl_certificate $CERT_DIR/nginx-selfsigned.crt;
ssl_certificate_key $CERT_DIR/nginx-selfsigned.key;
EOF

    cat > /etc/nginx/snippets/ssl-params.conf <<EOF
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_dhparam $CERT_DIR/dhparam.pem;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
ssl_ecdh_curve secp384r1;
ssl_session_timeout 10m;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
EOF

    # Update the nginx-firmament config to use self-signed certs if we're not using Let's Encrypt
    TEMP_NGINX_CONFIG="nginx-firmament-temp"
    cp nginx-firmament "$TEMP_NGINX_CONFIG"
    
    # Update SSL certificate paths
    sed -i "s|ssl_certificate     /etc/letsencrypt/live/.*|ssl_certificate     $CERT_DIR/nginx-selfsigned.crt;|" "$TEMP_NGINX_CONFIG"
    sed -i "s|ssl_certificate_key /etc/letsencrypt/live/.*|ssl_certificate_key $CERT_DIR/nginx-selfsigned.key;|" "$TEMP_NGINX_CONFIG"
    
    # Add include for SSL parameters
    sed -i "/ssl_certificate_key/a\\    include /etc/nginx/snippets/ssl-params.conf;" "$TEMP_NGINX_CONFIG"
    
    # Use the modified config
    mv "$TEMP_NGINX_CONFIG" nginx-firmament
fi

# Apply Nginx configuration
echo -e "${GREEN}Applying Nginx configuration...${NC}"

# Copy the nginx configuration to the appropriate directory
cp nginx-firmament /etc/nginx/sites-available/firmament

# Create symbolic link to enable the site
ln -sf /etc/nginx/sites-available/firmament /etc/nginx/sites-enabled/

# Remove default site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

# Test Nginx configuration
echo -e "${GREEN}Testing Nginx configuration...${NC}"
nginx -t

if [ $? -ne 0 ]; then
    echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
    exit 1
fi

# Restart Nginx to apply changes
echo -e "${GREEN}Restarting Nginx...${NC}"
systemctl restart nginx

# Check if Nginx is running
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}Nginx is running successfully${NC}"
else
    echo -e "${RED}Nginx failed to start. Please check the logs with 'journalctl -xe'${NC}"
    exit 1
fi

# Create a browser trust script for frontend developers if using self-signed certs
if [ "$USE_LETSENCRYPT" = false ]; then
    echo -e "${YELLOW}Creating browser trust helper for self-signed certificates...${NC}"
    
    # Create a directory for browser helpers
    HELPER_DIR="frontend/dev/public"
    mkdir -p "$HELPER_DIR"
    
    # Create helper script
    cat > "$HELPER_DIR/setup-cert.js" <<EOF
/**
 * Utility script to help with certificate validation during development
 */
(function() {
  // Check if we're on HTTPS
  if (window.location.protocol !== 'https:') {
    console.warn('Not running on HTTPS - certificate handling not required');
    return;
  }

  // Show certificate warning if page loaded
  window.addEventListener('load', function() {
    // Check for certificate errors by attempting to fetch from backend
    checkBackendConnection();
  });

  function checkBackendConnection() {
    const API_URL = 'https://$SERVER_NAME:8000';
    const SOCKET_URL = 'https://$SERVER_NAME:5001';
    
    console.log('Checking backend connection...');
    
    // Display a banner with instructions if needed
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#f8d7da;color:#721c24;padding:10px;text-align:center;z-index:9999;font-family:sans-serif;';
    banner.innerHTML = \`
      <p><strong>⚠️ Certificate Warning</strong></p>
      <p>You need to accept the self-signed certificates for the backend servers:</p>
      <p>
        <a href="\${API_URL}" target="_blank" style="margin-right:10px;color:#721c24;">Accept REST API Certificate</a>
        <a href="\${SOCKET_URL}" target="_blank" style="color:#721c24;">Accept Socket.IO Certificate</a>
      </p>
      <p>After visiting both links and accepting the certificates, refresh this page.</p>
      <button style="background:#721c24;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;" onclick="this.parentNode.style.display='none'">Close</button>
    \`;
    
    // Check both API endpoints
    Promise.all([
      fetch(API_URL, { mode: 'no-cors' }).catch(e => false),
      fetch(SOCKET_URL, { mode: 'no-cors' }).catch(e => false)
    ]).then(results => {
      // If any fetch failed, show the banner
      if (results.includes(false)) {
        document.body.appendChild(banner);
      }
    });
  }
})();
EOF

    # Create a certificate instruction file
    cat > "CERTIFICATE_INSTRUCTIONS.md" <<EOF
# Certificate Setup Instructions

When using self-signed certificates for development and testing, browsers will show security warnings that need to be bypassed.

## Accepting Self-Signed Certificates

### Step 1: Visit Both Backend URLs

Your application uses two backend servers with self-signed certificates. You'll need to accept both certificates.

1. Visit the API server: https://$SERVER_NAME:8000
   - You'll see a security warning in your browser
   - Click "Advanced" (or similar option depending on your browser)
   - Click "Proceed to site" (or similar option)

2. Visit the Socket.IO server: https://$SERVER_NAME:5001
   - Repeat the same steps to accept this certificate

### Step 2: Refresh Your Application

After accepting both certificates, refresh your application page.

## Chrome-Specific Instructions

In Chrome, you might see a warning that says "Your connection is not private" with error code NET::ERR_CERT_AUTHORITY_INVALID.

1. Click on "Advanced"
2. Click on "Proceed to $SERVER_NAME (unsafe)"

## Firefox-Specific Instructions

In Firefox, you might see a warning that says "Warning: Potential Security Risk Ahead".

1. Click on "Advanced..."
2. Click on "Accept the Risk and Continue"

## Safari-Specific Instructions

In Safari, you might see a warning that says "This Connection Is Not Private".

1. Click "Show Details"
2. Click "visit this website"
3. Enter your system password if prompted

## Edge-Specific Instructions

In Edge, the process is similar to Chrome:

1. Click on "Advanced"
2. Click on "Continue to site (unsafe)"

## Permanent Certificate Installation (Optional)

For a more permanent solution:

### Windows:
1. Download the certificate from: https://$SERVER_NAME/nginx-selfsigned.crt
   (We've made it available through Nginx for convenience)
2. Double-click the certificate file
3. Click "Install Certificate"
4. Select "Current User" and click "Next"
5. Select "Place all certificates in the following store"
6. Click "Browse" and select "Trusted Root Certification Authorities"
7. Click "Next" and then "Finish"

### macOS:
1. Download the certificate from: https://$SERVER_NAME/nginx-selfsigned.crt
2. Double-click the certificate file to open it in Keychain Access
3. Keychain Access will prompt you to add the certificate
4. Add the certificate
5. Find the certificate in Keychain Access, double-click it
6. Expand the "Trust" section
7. Change "When using this certificate" to "Always Trust"
8. Close the certificate window (you may be prompted for your password)

### Linux:
1. Download the certificate from: https://$SERVER_NAME/nginx-selfsigned.crt
2. Run: \`sudo cp nginx-selfsigned.crt /usr/local/share/ca-certificates/\`
3. Run: \`sudo update-ca-certificates\`
EOF

    # Make the certificate available for download through nginx
    ln -sf "$CERT_DIR/nginx-selfsigned.crt" "frontend/dev/public/nginx-selfsigned.crt"
    
    echo -e "${GREEN}Browser trust helpers created. See CERTIFICATE_INSTRUCTIONS.md for detailed instructions.${NC}"
fi

# Log script success
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   Frontend Setup Completed Successfully ${NC}"
echo -e "${GREEN}=========================================${NC}"

if [ "$USE_LETSENCRYPT" = false ]; then
    echo -e "${YELLOW}Note: Using self-signed certificates. Users will need to trust these certificates in their browsers.${NC}"
    echo -e "${YELLOW}See CERTIFICATE_INSTRUCTIONS.md for detailed instructions on handling certificate warnings.${NC}"
fi

echo -e "${GREEN}Your Firmament application should now be accessible at: https://$SERVER_NAME${NC}"
echo ""
