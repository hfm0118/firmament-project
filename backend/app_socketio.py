import logging
import os
import sys
import time
from flask import Flask, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from dotenv import load_dotenv
from deepgram import (
    DeepgramClient,
    LiveTranscriptionEvents,
    LiveOptions,
    DeepgramClientOptions
)
import base64
import random

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('socketio_app.log')
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

app_socketio = Flask("app_socketio")
# Enable CORS for all routes
CORS(app_socketio, origins=['http://34.126.116.68/'])

# Allow CORS from the main app and any production URLs
# Add socket.io config for better connection stability
socketio = SocketIO(
    app_socketio, 
    cors_allowed_origins=['http://127.0.0.1:8000', 'http://localhost:8000', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://34.126.116.68/', 'https://*', 'http://*'],
    binary=True,  # Important for binary audio data
    ping_timeout=60,  # Increase ping timeout to 60 seconds (default is 5)
    ping_interval=25,  # Increase ping interval to 25 seconds (default is 25)
    max_http_buffer_size=5*1024*1024,  # 5MB buffer for binary data
    async_mode='threading'  # Use threading mode for better stability
)

API_KEY = os.getenv("DEEPGRAM_API_KEY")

# Set up client configuration with better timeout handling
config = DeepgramClientOptions(
    verbose=logging.WARNING,  # Reduce back to WARNING from INFO
    options={
        "keepalive": "true",
        "keepalive_timeout": "30"  # 30 seconds timeout (default is 10)
    }
)

deepgram = DeepgramClient(API_KEY, config)

# Dictionary to store connections for each user session
user_connections = {}

# Dictionary to map socket IDs to session IDs for quick lookup
sid_to_session_map = {}

# Dictionary to track last activity time for each connection
connection_activity = {}

# When did we last print connection stats
last_stats_time = time.time()

def initialize_deepgram_connection(session_id):
    try:
        # Initialize Deepgram client and connection for a specific user
        logger.info(f"Initializing Deepgram connection for session {session_id}")
        dg_connection = deepgram.listen.websocket.v("1")
        
        def on_open(self, open, **kwargs):
            try:
                logger.info(f"Session {session_id}: Deepgram connection opened")
                # Track that this connection is active
                connection_activity[session_id] = time.time()
            except Exception as e:
                logger.error(f"Error in on_open handler: {e}")

        def on_message(self, result, **kwargs):
            try:
                # Store session_id in kwargs (this is the fix)
                kwargs['session_id'] = session_id
                
                # Update activity timestamp
                connection_activity[session_id] = time.time()
                
                transcript = result.channel.alternatives[0].transcript
                if len(transcript) > 0:
                    # Only log non-empty transcripts
                    logger.info(f"Session {session_id} transcript received: {transcript[:30]}...")
                    
                    # Find all socket IDs for this session
                    target_socket_ids = [
                        sid for sid, sid_session in sid_to_session_map.items() 
                        if sid_session == session_id
                    ]
                    
                    if target_socket_ids:
                        # Emit to all sockets associated with this session
                        logger.info(f"Sending transcript to {len(target_socket_ids)} clients for session {session_id}")
                        for socket_id in target_socket_ids:
                            socketio.emit('transcription_update', {'transcription': transcript}, room=socket_id)
                    else:
                        logger.warning(f"No active sockets for session {session_id} to receive transcript")
            except Exception as e:
                logger.error(f"Error in on_message handler: {e}", exc_info=True)

        def on_close(self, close, **kwargs):
            try:
                logger.info(f"Session {session_id}: Deepgram connection closed")
                # Clean up connection activity tracking
                if session_id in connection_activity:
                    connection_activity.pop(session_id, None)
            except Exception as e:
                logger.error(f"Error in on_close handler: {e}")

        def on_error(self, error, **kwargs):
            try:
                logger.error(f"Session {session_id} error: {error}")
            except Exception as e:
                logger.error(f"Error in on_error handler: {e}")
                
        def on_metadata(self, metadata, **kwargs):
            try:
                # Only log important metadata
                logger.debug(f"Session {session_id} metadata received")
                connection_activity[session_id] = time.time()  # Update activity
            except Exception as e:
                logger.error(f"Error in on_metadata handler: {e}")

        # Register all event handlers
        dg_connection.on(LiveTranscriptionEvents.Open, on_open)
        dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
        dg_connection.on(LiveTranscriptionEvents.Close, on_close)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)
        dg_connection.on(LiveTranscriptionEvents.Metadata, on_metadata)

        # Define the options for the live transcription
        options = LiveOptions(
            model="nova-3", 
            language="en-US",
            interim_results=False,  # Get results as they come
            punctuate=True        # Add punctuation
        )

        if dg_connection.start(options) is False:
            logger.error(f"Session {session_id}: Failed to start connection")
            return None
        
        logger.info(f"Session {session_id}: Deepgram connection started successfully")
        return dg_connection
    except Exception as e:
        logger.error(f"Error initializing Deepgram connection for session {session_id}: {e}", exc_info=True)
        return None

@socketio.on('audio_stream')
def handle_audio_stream(data):
    try:
        socket_id = request.sid
        
        # Get session ID from socket-to-session mapping
        session_id = sid_to_session_map.get(socket_id)
        
        # If session ID not found in mapping, try to extract from data
        if not session_id:
            if isinstance(data, dict) and 'userId' in data:
                session_id = data['userId']
                sid_to_session_map[socket_id] = session_id
                logger.info(f"Mapped socket {socket_id} to session {session_id} from audio payload")
            else:
                logger.error(f"Socket {socket_id}: No session ID found for audio stream")
                socketio.emit('connection_lost', {'message': 'Session not found. Please refresh the page.'}, room=socket_id)
                return
        
        # Print connection stats every 60 seconds
        global last_stats_time
        current_time = time.time()
        if current_time - last_stats_time > 60:
            logger.info(f"Active connections: {len(user_connections)}, Socket mappings: {len(sid_to_session_map)}")
            last_stats_time = current_time
        
        # Check if this session has an active connection
        if session_id not in user_connections or not user_connections[session_id]:
            # Try to create a new connection
            if not hasattr(handle_audio_stream, f"warned_{session_id}"):
                logger.warning(f"Session {session_id}: Received audio but no active connection exists, attempting to create one")
                setattr(handle_audio_stream, f"warned_{session_id}", True)
                
                # Try to establish a new connection
                conn = initialize_deepgram_connection(session_id)
                if conn:
                    user_connections[session_id] = conn
                    logger.info(f"Session {session_id}: Created new Deepgram connection automatically")
                    # Track connection activity
                    connection_activity[session_id] = time.time()
                    # Notify client that connection is ready
                    socketio.emit('deepgram_ready', {'status': 'connected'}, room=socket_id)
                else:
                    logger.error(f"Session {session_id}: Failed to create Deepgram connection")
                    socketio.emit('connection_lost', {'message': 'Failed to create Deepgram connection'}, room=socket_id)
                    return
            else:
                # Skip this audio packet
                return
                
        # Update activity timestamp
        connection_activity[session_id] = time.time()
        
        # Get audio data from payload
        if isinstance(data, dict) and 'audio' in data:
            audio_data = data['audio']
        else:
            # If not in expected format, use the data directly
            audio_data = data
        
        # Log some packets to help with debugging
        if random.randint(1, 50) == 1:
            data_type = type(audio_data)
            data_size = len(audio_data) if audio_data else 'unknown'
            logger.info(f"Audio packet from session {session_id}: type={data_type}, size={data_size} bytes")
        
        # Handle various data formats that might come from the client
        binary_data = None
        
        if isinstance(audio_data, str):
            # String data (likely base64)
            try:
                binary_data = base64.b64decode(audio_data)
            except Exception as e:
                logger.error(f"Error converting string to binary: {e}")
                return
        elif isinstance(audio_data, bytes):
            # Already binary data
            binary_data = audio_data
        elif hasattr(audio_data, 'read'):
            # File-like object
            binary_data = audio_data.read()
        else:
            # Unknown format
            logger.error(f"Unsupported data format: {type(audio_data)}")
            socketio.emit('deepgram_error', {'error': 'Unsupported audio format'}, room=socket_id)
            return
        
        # Send the audio data to Deepgram API
        try:
            if session_id in user_connections and user_connections[session_id]:
                user_connections[session_id].send(binary_data)
                if random.randint(1, 200) == 1:
                    logger.info(f"Successfully sent {len(binary_data)} bytes to Deepgram for session {session_id}")
            else:
                logger.error(f"Cannot send audio: No active connection for session {session_id}")
                socketio.emit('connection_lost', {'message': 'Connection lost. Please restart recording.'}, room=socket_id)
        except Exception as e:
            logger.error(f"Error sending data to Deepgram: {e}")
            socketio.emit('deepgram_error', {'error': f'Error sending audio: {str(e)}'}, room=socket_id)
        
    except Exception as e:
        logger.error(f"Error handling audio stream: {e}", exc_info=True)

@socketio.on('toggle_transcription')
def handle_toggle_transcription(data):
    try:
        socket_id = request.sid
        
        # Get session ID from mapping or from payload
        session_id = sid_to_session_map.get(socket_id)
        if not session_id and isinstance(data, dict) and 'userId' in data:
            session_id = data.get('userId')
            sid_to_session_map[socket_id] = session_id
            logger.info(f"Mapped socket {socket_id} to session {session_id} from toggle event")
        
        if not session_id:
            logger.error(f"Socket {socket_id}: No session ID found for toggle_transcription")
            socketio.emit('connection_error', {'message': 'Session not found. Please refresh the page.'}, room=socket_id)
            return
        
        logger.info(f"Session {session_id}: toggle_transcription {data}")
        action = data.get("action")
        
        if action == "start":
            logger.info(f"Session {session_id}: Starting Deepgram connection")
            
            # First ensure any existing connection is closed
            if session_id in user_connections:
                if user_connections[session_id]:
                    try:
                        logger.info(f"Session {session_id}: Closing existing connection before starting new one")
                        user_connections[session_id].finish()
                    except Exception as e:
                        logger.error(f"Error closing existing connection: {e}")
                user_connections.pop(session_id, None)
            
            # Create a new connection for this user
            conn = initialize_deepgram_connection(session_id)
            if conn:
                user_connections[session_id] = conn
                # Track connection activity
                connection_activity[session_id] = time.time()
                logger.info(f"Session {session_id}: Deepgram connection initialized successfully")
                # Notify client that connection is ready
                socketio.emit('deepgram_ready', {'status': 'connected'}, room=socket_id)
            else:
                logger.error(f"Session {session_id}: Failed to initialize Deepgram connection")
                socketio.emit('connection_error', {'message': 'Failed to connect to Deepgram'}, room=socket_id)
        
        elif action == "stop":
            logger.info(f"Session {session_id}: Stopping Deepgram connection")
            # Properly close the connection
            if session_id in user_connections:
                if user_connections[session_id]:
                    try:
                        logger.info(f"Session {session_id}: Sending finish signal to Deepgram")
                        user_connections[session_id].finish()
                        logger.info(f"Session {session_id}: Deepgram connection closed successfully")
                        # Notify client about successful stop
                        socketio.emit('deepgram_stopped', {'status': 'stopped'}, room=socket_id)
                    except Exception as e:
                        logger.error(f"Error closing connection: {e}")
                        # Still notify client even if there was an error
                        socketio.emit('deepgram_stopped', {'status': 'error', 'message': str(e)}, room=socket_id)
                
                # Always remove from connections dictionary
                logger.info(f"Session {session_id}: Removing from active connections")
                user_connections.pop(session_id, None)
                # Remove from activity tracking
                if session_id in connection_activity:
                    connection_activity.pop(session_id, None)
            else:
                logger.warning(f"Session {session_id}: No active connection to stop")
                socketio.emit('deepgram_stopped', {'status': 'no_connection'}, room=socket_id)
    except Exception as e:
        logger.error(f"Error handling toggle_transcription: {e}", exc_info=True)

@socketio.on('connect')
def server_connect():
    try:
        socket_id = request.sid
        
        # Extract userId from connection query params
        session_id = request.args.get('userId')
        
        if not session_id:
            logger.warning(f"Socket {socket_id} connected without userId")
            socketio.emit('connection_error', {'message': 'No session ID provided. Please refresh the page.'}, room=socket_id)
            return
        
        # Store the mapping between socket ID and session ID
        sid_to_session_map[socket_id] = session_id
        
        logger.info(f'Client connected: Socket {socket_id}, Session {session_id}')
        
        # Check if there's already an active connection for this session
        if session_id in user_connections and user_connections[session_id]:
            # If we have a recent activity timestamp, reuse connection
            if session_id in connection_activity and (time.time() - connection_activity[session_id]) < 60:
                logger.info(f"Session {session_id}: Reusing existing Deepgram connection")
                socketio.emit('deepgram_ready', {'status': 'connected'}, room=socket_id)
            else:
                # Connection exists but might be stale
                logger.info(f"Session {session_id}: Existing connection may be stale")
                socketio.emit('server_status', {'status': 'connected', 'note': 'May need to restart recording'}, room=socket_id)
        else:
            # No existing connection
            socketio.emit('server_status', {'status': 'connected'}, room=socket_id)
    except Exception as e:
        logger.error(f"Error handling connect: {e}")

@socketio.on('disconnect')
def server_disconnect():
    try:
        socket_id = request.sid
        session_id = sid_to_session_map.get(socket_id)
        
        logger.info(f'Client disconnected: Socket {socket_id}, Session {session_id}')
        
        # Remove the socket-to-session mapping
        if socket_id in sid_to_session_map:
            sid_to_session_map.pop(socket_id)
        
        # Don't immediately close Deepgram connection on disconnect
        # Check if any other sockets are using this session
        if session_id:
            other_sockets = [
                sid for sid, sid_session in sid_to_session_map.items() 
                if sid_session == session_id
            ]
            
            # Only clean up if this was the last socket AND connection is inactive
            if not other_sockets:
                # Keep connection open for a short time to allow for reconnects
                # The cleanup task will remove it if no reconnection occurs
                logger.info(f"Session {session_id}: Last socket disconnected, keeping connection for possible reconnect")
    except Exception as e:
        logger.error(f"Error handling disconnect: {e}")

# Periodically clean up inactive connections
def cleanup_inactive_connections():
    try:
        current_time = time.time()
        inactive_timeout = 60  # 60 seconds of inactivity
        
        # Find inactive sessions
        inactive_sessions = []
        for session_id, last_activity in connection_activity.items():
            if current_time - last_activity > inactive_timeout:
                inactive_sessions.append(session_id)
        
        # Clean up each inactive session
        for session_id in inactive_sessions:
            # Check if any sockets still use this session
            active_sockets = [
                sid for sid, sid_session in sid_to_session_map.items() 
                if sid_session == session_id
            ]
            
            if not active_sockets:
                logger.info(f"Cleaning up inactive session {session_id} (inactive for {current_time - connection_activity[session_id]:.1f}s)")
                if session_id in user_connections and user_connections[session_id]:
                    try:
                        user_connections[session_id].finish()
                        logger.info(f"Session {session_id}: Inactive Deepgram connection closed")
                    except Exception as e:
                        logger.error(f"Error closing inactive connection: {e}")
                    user_connections.pop(session_id, None)
                    connection_activity.pop(session_id, None)
    except Exception as e:
        logger.error(f"Error in cleanup task: {e}")

# Start background task for cleaning up inactive connections
@socketio.on('connect')
def start_cleanup_task():
    socketio.start_background_task(target=run_cleanup_task)

def run_cleanup_task():
    while True:
        socketio.sleep(30)  # Sleep for 30 seconds
        cleanup_inactive_connections()

if __name__ == '__main__':
    try:
        logging.info("Starting SocketIO server.")
        # Get port from environment variable (for cloud deployment) or use default
        port = int(os.environ.get("PORT", 5001))
        # Run socketio app - bind to 0.0.0.0 for cloud deployment
        socketio.run(
            app_socketio, 
            host='0.0.0.0', 
            debug=False, 
            allow_unsafe_werkzeug=True, 
            port=port
        )
    except Exception as e:
        logging.error(f"Error starting SocketIO server: {e}")
        # Attempt to restart the server
        try:
            logging.info("Attempting to restart SocketIO server...")
            socketio.run(app_socketio, host='0.0.0.0', debug=False, allow_unsafe_werkzeug=True, port=5001)
        except Exception as restart_error:
            logging.error(f"Failed to restart SocketIO server: {restart_error}")
