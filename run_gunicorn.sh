#!/bin/bash

echo "Starting Flask backend and Socket.IO servers with Gunicorn..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Get current timestamp for log file naming
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Set the number of workers
FLASK_WORKERS=3
SOCKETIO_WORKERS=3

# Set application module paths
FLASK_APP="app:app"
SOCKETIO_APP="app_socketio:app_socketio"

# Set ports - make sure these match what your application expects
FLASK_PORT=8000
SOCKETIO_PORT=5001

# Start Flask app with Gunicorn
cd backend
echo "Starting Flask backend with Gunicorn on port $FLASK_PORT..."
nohup gunicorn $FLASK_APP \
    --bind 0.0.0.0:$FLASK_PORT \
    --workers $FLASK_WORKERS \
    --log-level info \
    --log-file ../logs/gunicorn_flask_$TIMESTAMP.log \
    --daemon \
    --pid ../logs/gunicorn_flask.pid \
    --access-logfile ../logs/gunicorn_flask_access_$TIMESTAMP.log \
    --error-logfile ../logs/gunicorn_flask_error_$TIMESTAMP.log \
    --timeout 120

# Check if Flask app started successfully
if [ $? -ne 0 ]; then
    echo "Failed to start Flask backend with Gunicorn"
    exit 1
fi
echo "Flask backend started with Gunicorn (PID in ../logs/gunicorn_flask.pid)"

# Start Socket.IO app with Gunicorn and the socketio worker class
echo "Starting Socket.IO server with Gunicorn on port $SOCKETIO_PORT..."
nohup gunicorn $SOCKETIO_APP \
    --bind 0.0.0.0:$SOCKETIO_PORT \
    --worker-class eventlet \
    --workers $SOCKETIO_WORKERS \
    --log-level info \
    --log-file ../logs/gunicorn_socketio_$TIMESTAMP.log \
    --daemon \
    --pid ../logs/gunicorn_socketio.pid \
    --access-logfile ../logs/gunicorn_socketio_access_$TIMESTAMP.log \
    --error-logfile ../logs/gunicorn_socketio_error_$TIMESTAMP.log \
    --timeout 120

# Check if Socket.IO server started successfully
if [ $? -ne 0 ]; then
    echo "Failed to start Socket.IO server with Gunicorn"
    # Try to kill the Flask server if it's running
    if [ -f ../logs/gunicorn_flask.pid ]; then
        kill -15 $(cat ../logs/gunicorn_flask.pid)
        echo "Stopped Flask backend due to Socket.IO startup failure"
    fi
    exit 1
fi
echo "Socket.IO server started with Gunicorn (PID in ../logs/gunicorn_socketio.pid)"

# Return to original directory
cd ..

echo "Both services are running persistently with Gunicorn."
echo "To stop them later, run: ./stop_gunicorn.sh"
echo "Log files are in the logs directory"
echo "You can safely disconnect from the server now."
