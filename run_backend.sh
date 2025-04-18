#!/bin/bash

echo "Starting Flask backend and Socket.IO servers as persistent processes..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Start Flask app as a nohup process
cd backend
nohup python3 app.py > ../logs/flask_app.log 2>&1 &
FLASK_PID=$!
echo "Flask backend started with PID: $FLASK_PID"

# Start Socket.IO server as a nohup process
nohup python3 app_socketio.py > ../logs/socketio_app.log 2>&1 &
SOCKETIO_PID=$!
echo "Socket.IO server started with PID: $SOCKETIO_PID"

# Store PIDs to file for later reference
echo "$FLASK_PID $SOCKETIO_PID" > ../logs/backend_pids.txt

# Return to original directory
cd ..

echo "Backend services are running persistently."
echo "To stop them later, run: kill \$(cat logs/backend_pids.txt)"
echo "Log files: logs/flask_app.log and logs/socketio_app.log"
echo "You can safely disconnect from the server now."
