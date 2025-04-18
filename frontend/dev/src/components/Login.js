import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './Login.css';
import API_ENDPOINTS from '../config/api-config';

// Helper function to generate a unique ID
const generateUserId = () => {
  return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
};

const Login = ({ onLoginSuccess, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.login, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        setError('Server error. Please try again.');
        return;
      }

      if (response.ok) {
        // Store auth state and user info in localStorage for persistence
        localStorage.setItem('isAuthenticated', 'true');
        
        // Store user data
        if (data.user) {
          localStorage.setItem('userId', data.user.id);
          localStorage.setItem('userFirstName', data.user.firstName);
          localStorage.setItem('userLastName', data.user.lastName);
          localStorage.setItem('userEmail', data.user.email);
        } else {
          // Fallback to generated ID if no user data
          const generatedId = generateUserId();
          localStorage.setItem('userId', generatedId);
        }
        
        // Call the callback to update parent component state
        onLoginSuccess(localStorage.getItem('userId'));
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <motion.div 
        className="login-form-wrapper"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          Speech Transcription Login
        </motion.h1>
        
        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <motion.div 
              className="error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}
          
          <motion.div 
            className="form-group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              autoComplete="email"
            />
          </motion.div>
          
          <motion.div 
            className="form-group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </motion.div>
          
          <motion.button 
            type="submit" 
            className="login-button" 
            disabled={loading}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            whileHover={{ y: -2, boxShadow: "0 6px 12px rgba(80, 86, 224, 0.25)" }}
            whileTap={{ y: 0, boxShadow: "0 2px 4px rgba(80, 86, 224, 0.15)" }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </motion.button>
          
          <motion.div 
            className="login-help"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <p>Demo account: a@firmament / 123456</p>
            <p>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); onSwitchToRegister(); }}>Register</a></p>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;