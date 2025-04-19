#!/bin/bash

echo "Starting Flask backend and Socket.IO servers as persistent processes..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Create certs directory if it doesn't exist
mkdir -p backend/certs

# Check if certificates exist, generate them if they don't
if [ ! -f backend/certs/cert.pem ] || [ ! -f backend/certs/key.pem ]; then
  echo "Generating self-signed certificates..."
  cd backend/certs
  openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
  cd ../..
  echo "Certificates generated successfully."
fi

# Start Flask app as a nohup process with SSL support
cd backend
nohup python3 app.py --ssl > ../logs/flask_app.log 2>&1 &
FLASK_PID=$!
echo "Flask HTTPS backend started with PID: $FLASK_PID"

# Start Socket.IO server as a nohup process with SSL support
nohup python3 app_socketio.py --ssl > ../logs/socketio_app.log 2>&1 &
SOCKETIO_PID=$!
echo "Socket.IO HTTPS server started with PID: $SOCKETIO_PID"

# Store PIDs to file for later reference
echo "$FLASK_PID $SOCKETIO_PID" > ../logs/backend_pids.txt

# Return to original directory
cd ..

echo "Backend services are running persistently with HTTPS support."
echo "To stop them later, run: kill \$(cat logs/backend_pids.txt)"
echo "Log files: logs/flask_app.log and logs/socketio_app.log"
echo "You can safely disconnect from the server now."
