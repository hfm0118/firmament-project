#!/bin/bash

echo "Stopping Flask backend and Socket.IO servers..."

# Check if the PID file exists
if [ -f "logs/backend_pids.txt" ]; then
    # Read PIDs from the file
    read FLASK_PID SOCKETIO_PID < logs/backend_pids.txt
    
    # Stop Flask process
    if ps -p $FLASK_PID > /dev/null; then
        echo "Stopping Flask backend (PID: $FLASK_PID)..."
        kill $FLASK_PID
        echo "Flask backend stopped."
    else
        echo "Flask backend process (PID: $FLASK_PID) is not running."
    fi
    
    # Stop Socket.IO process
    if ps -p $SOCKETIO_PID > /dev/null; then
        echo "Stopping Socket.IO server (PID: $SOCKETIO_PID)..."
        kill $SOCKETIO_PID
        echo "Socket.IO server stopped."
    else
        echo "Socket.IO server process (PID: $SOCKETIO_PID) is not running."
    fi
    
    # Remove the PID file
    rm logs/backend_pids.txt
    echo "Removed PID file."
else
    echo "No PID file found at logs/backend_pids.txt."
    echo "The backend services might not be running, or they were started differently."
    echo "You may need to find and kill the processes manually with 'ps aux | grep python'."
fi

echo "Backend services shutdown complete."
