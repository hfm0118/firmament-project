#!/bin/bash
echo "Stopping Gunicorn services..."

# Stop Flask backend
if [ -f logs/gunicorn_flask.pid ]; then
    echo "Stopping Flask backend..."
    kill -15 $(cat logs/gunicorn_flask.pid)
    rm logs/gunicorn_flask.pid
else
    echo "Flask backend PID file not found"
fi

# Stop Socket.IO server
if [ -f logs/gunicorn_socketio.pid ]; then
    echo "Stopping Socket.IO server..."
    kill -15 $(cat logs/gunicorn_socketio.pid)
    rm logs/gunicorn_socketio.pid
else
    echo "Socket.IO server PID file not found"
fi

echo "Gunicorn services stopped"
