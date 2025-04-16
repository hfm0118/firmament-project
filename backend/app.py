import logging
import os
import sys

from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import db  # Import our MongoDB module

# Configure logging (similar to app_socketio.py)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

def create_app():
    """Application factory function"""
    app = Flask("app_http")
    CORS(app)  # Enable CORS for all routes
    
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/login', methods=['POST'])
    def login():
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        logger.info(f"Login attempt for email: {email}")
        
        # MongoDB authentication
        user = db.authenticate_user(email, password)
        
        if user:
            # Return user data (excluding password) and success message
            return jsonify({
                'success': True, 
                'message': 'Login successful',
                'user': {
                    'id': user['_id'],
                    'firstName': user.get('firstName', ''),
                    'lastName': user.get('lastName', ''),
                    'email': user.get('email', '')
                }
            })
        else:
            return jsonify({'success': False, 'message': 'Invalid credentials'}), 401
    
    @app.route('/register', methods=['POST'])
    def register():
        data = request.get_json()
        
        # Extract user data
        user_data = {
            'firstName': data.get('firstName', ''),
            'lastName': data.get('lastName', ''),
            'email': data.get('email', ''),
            'password': data.get('password', '')
        }
        
        # Validate required fields
        if not all([user_data['firstName'], user_data['email'], user_data['password']]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        logger.info(f"Registration attempt for email: {user_data['email']}")
        
        # Create user in MongoDB
        result = db.create_user(user_data)
        
        if result and result.get('success'):
            user = result.get('user')
            # Return user data (excluding password) and success message
            return jsonify({
                'success': True, 
                'message': 'Registration successful',
                'user': {
                    'id': user['_id'],
                    'firstName': user.get('firstName', ''),
                    'lastName': user.get('lastName', ''),
                    'email': user.get('email', '')
                }
            })
        else:
            error_message = result.get('message', 'Registration failed') if result else 'Database error'
            return jsonify({'success': False, 'message': error_message}), 400
    
    @app.route('/users', methods=['GET'])
    def get_users():
        """Get all users (for testing only)"""
        users = db.get_all_users()
        return jsonify({
            'success': True,
            'users': users
        })
    
    @app.route('/user/<user_id>', methods=['GET'])
    def get_user(user_id):
        """Get a specific user by ID"""
        user = db.get_user_by_id(user_id)
        if user:
            # Don't return the password
            if 'password' in user:
                del user['password']
            return jsonify({
                'success': True,
                'user': user
            })
        else:
            return jsonify({'success': False, 'message': 'User not found'}), 404
    
    @app.route('/userdata', methods=['POST'])
    def save_note():
        """Save user data to the database"""
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['userId', 'noteId', 'title', 'noteText', 'curTranscript', 'curSummary']
        if not all(field in data for field in required_fields):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Log the request
        logger.info(f"Saving user data for user: {data.get('userId')}")
        
        # Save to MongoDB
        result = db.insert_note(data)
        
        if result and result.get('success'):
            return jsonify(result)
        else:
            error_message = result.get('message', 'Failed to save user data') if result else 'Database error'
            return jsonify({'success': False, 'message': error_message}), 500
        
    @app.route('/userdata/<user_id>', methods=['GET'])
    def get_user_notes(user_id):
        """Get user data by user ID"""
        logger.info(f"Retrieving user data for user: {user_id}")
        
        # Get from MongoDB
        result = db.get_userdata(user_id)
        
        if result and result.get('success'):
            return jsonify(result)
        else:
            error_message = result.get('message', 'Failed to retrieve user data') if result else 'Database error'
            return jsonify({'success': False, 'message': error_message}), 500


    # LEGACY
    @app.route('/transcripts', methods=['POST'])
    def save_transcript():
        """Save a transcript to the database"""
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['userId', 'originalText', 'title']
        if not all(field in data for field in required_fields):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Log the request
        logger.info(f"Saving transcript for user: {data.get('userId')}")
        
        # Save to MongoDB
        result = db.save_transcript(data)
        
        if result and result.get('success'):
            return jsonify(result)
        else:
            error_message = result.get('message', 'Failed to save transcript') if result else 'Database error'
            return jsonify({'success': False, 'message': error_message}), 500
    
    # LEGACY
    @app.route('/transcripts/<user_id>', methods=['GET'])
    def get_user_transcripts(user_id):
        """Get all transcripts for a specific user"""
        logger.info(f"Retrieving transcripts for user: {user_id}")
        
        # Get from MongoDB
        result = db.get_user_transcripts(user_id)
        
        if result and result.get('success'):
            return jsonify(result)
        else:
            error_message = result.get('message', 'Failed to retrieve transcripts') if result else 'Database error'
            return jsonify({'success': False, 'message': error_message}), 500
    
    return app

# This is used by Gunicorn
app = create_app()

if __name__ == '__main__':
    # This code only runs when you execute this file directly
    # It doesn't run when imported by Gunicorn
    logger.info("Starting Flask server.")
    # Get port from environment variable (for cloud deployment) or use default
    port = int(os.environ.get("PORT", 8000))
    # Run flask app - bind to 0.0.0.0 for cloud deployment
    app.run(host='0.0.0.0', debug=False, port=port)
