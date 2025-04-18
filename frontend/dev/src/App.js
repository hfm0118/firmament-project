import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import TranscriptionMic from './components/TranscriptionMic';
import Login from './components/Login';
import Register from './components/Register';
import NotebookList from './components/NotebookList';
import NotebookDetail from './components/NotebookDetail';
import API_ENDPOINTS from './config/api-config';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.4 }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.3 }
  }
};

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4 }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: { duration: 0.3 }
  }
};

function App() {
  // Force re-render mechanism
  const [, forceUpdate] = useState({});
  
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  
  // Notebook states
  const [notebooks, setNotebooks] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'new', 'view'
  const [selectedNotebook, setSelectedNotebook] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Check if user is already authenticated
  useEffect(() => {
    const authenticated = localStorage.getItem('isAuthenticated') === 'true';
    const storedUserId = localStorage.getItem('userId');
    
    // Only consider authenticated if both auth flag and userId exist
    if (authenticated && storedUserId) {
      setIsAuthenticated(true);
      setUserId(storedUserId);
      
      // Fetch user info from localStorage
      setUserInfo({
        firstName: localStorage.getItem('userFirstName') || '',
        lastName: localStorage.getItem('userLastName') || '',
        email: localStorage.getItem('userEmail') || ''
      });

      // Fetch notebooks from database
      fetchUserNotebooks(storedUserId);
    } else if (authenticated && !storedUserId) {
      // If authenticated but no userId, force logout
      handleLogout();
    }
  }, []);

  // Fetch user notebooks from the server
  const fetchUserNotebooks = async (userId) => {
    try {
      // Fetch from notebooks collection
      const response = await fetch(API_ENDPOINTS.notebooksByUser(userId));
      
      if (!response.ok) {
        // Handle HTTP errors
        console.error(`Error fetching notebooks: HTTP ${response.status}`);
        return;
      }
      
      // Try to parse the JSON response
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        return;
      }

      // Update state with notebooks data
      if (data.success && Array.isArray(data.notes)) {
        setNotebooks(data.notes);
      } else {
        console.error('Failed to fetch notebooks:', data.message || 'Unknown error');
        // Initialize with empty array if no data
        setNotebooks([]);
      }
    } catch (error) {
      console.error('Error fetching notebooks:', error);
      // Initialize with empty array on error
      setNotebooks([]);
    }
  };

  const handleLoginSuccess = (userId) => {
    setIsAuthenticated(true);
    setUserId(userId);
    
    // Fetch user info from localStorage
    setUserInfo({
      firstName: localStorage.getItem('userFirstName') || '',
      lastName: localStorage.getItem('userLastName') || '',
      email: localStorage.getItem('userEmail') || ''
    });

    // Fetch notebooks from database
    fetchUserNotebooks(userId);
  };

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('userFirstName');
    localStorage.removeItem('userLastName');
    localStorage.removeItem('userEmail');
    
    // Update state
    setIsAuthenticated(false);
    setUserId(null);
    setUserInfo(null);
    setShowLogin(true);
    setNotebooks([]);
    setCurrentView('list');
    setSelectedNotebook(null);
  };

  const handleStartNewNotebook = () => {
    console.log("Starting new notebook, current view:", currentView);

    // First update the view state
    setCurrentView('new');
    
    // Then force a re-render to ensure the component updates
    forceUpdate({});
    
    console.log("View state updated to 'new'");
  };

  const handleViewNotebook = (notebookId) => {
    console.log("View notebook requested for ID:", notebookId);
    const notebook = notebooks.find(n => n._id === notebookId);
    
    if (notebook) {
      console.log("Found notebook to view:", notebook);
      setSelectedNotebook(notebook);
      setCurrentView('view');
    } else {
      console.error("Notebook not found with ID:", notebookId);
    }
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setSelectedNotebook(null);
  };

  const handleSaveNotebook = async (notebookData) => {
    // Only save if there's actual content in either notes or transcript
    if ((!notebookData.noteText || notebookData.noteText.trim() === '') &&
        (!notebookData.curTranscript || notebookData.curTranscript.trim() === '')) {
      console.warn("Nothing to save - both note and transcript are empty");
      return null;
    }
    
    setIsSaving(true);
    
    try {
      // Prepare data for API
      const apiData = {
        userId: userId,
        noteId: notebookData.noteId || null,
        title: notebookData.title || `Note ${new Date().toLocaleDateString()}`,
        noteText: notebookData.noteText || '',
        curTranscript: notebookData.curTranscript || '',
        curSummary: notebookData.curSummary || '',
        date: notebookData.date || new Date().toISOString(),
        duration: notebookData.duration || 0,
        collection: 'notebooks' // Always use notebooks collection
      };
      
      // Save to MongoDB using the notebooks endpoint
      const response = await fetch(API_ENDPOINTS.notebooks, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // If save was successful, fetch latest notebooks
        await fetchUserNotebooks(userId);

        // Update the selectedNotebook to make sure it shows the latest content
        if (notebookData.noteId) {
          const updatedNotebook = {
            ...notebookData,
            _id: notebookData.noteId,
            updatedAt: new Date().toISOString()
          };
          setSelectedNotebook(updatedNotebook);
        }

        // Return the noteId (either the existing one or the new one from the result)
        return result.noteId || notebookData.noteId;

      } else {
        console.error('Error saving notebook:', result.message);
        alert(`Failed to save notebook: ${result.message}`);
        return null;
      }

    } catch (error) {
      console.error('Error saving notebook:', error);
      alert(`Error saving notebook: ${error.message}`);
      return null;
      
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeleteNotebook = async (notebookId) => {
    if (!notebookId) {
      console.error("Cannot delete notebook: No notebook ID provided");
      return;
    }
    
    console.log("Deleting notebook with ID:", notebookId);
    
    try {
      // Send delete request to the server
      const response = await fetch(API_ENDPOINTS.deleteNotebook(notebookId), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log("Notebook deleted successfully");
        
        // Update the local notebooks list by removing the deleted notebook
        setNotebooks(prevNotebooks => prevNotebooks.filter(notebook => notebook._id !== notebookId));
        
        // If the currently selected notebook is the one being deleted, go back to list view
        if (selectedNotebook && selectedNotebook._id === notebookId) {
          setCurrentView('list');
          setSelectedNotebook(null);
        }
      } else {
        console.error('Error deleting notebook:', result.message);
        alert(`Failed to delete notebook: ${result.message}`);
      }
    } catch (error) {
      console.error('Error deleting notebook:', error);
      alert(`Error deleting notebook: ${error.message}`);
    }
  };
  
  // Effect to log when currentView changes
  useEffect(() => {
    // Special handling for 'new' view
    if (currentView === 'new') {
      // Reset state or prep work for new notebook
    }
  }, [currentView]);
  
  // Show login/register page if not authenticated
  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        {showLogin ? (
          <motion.div
            key="login"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={containerVariants}
          >
            <Login 
              onLoginSuccess={handleLoginSuccess} 
              onSwitchToRegister={() => setShowLogin(false)} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="register"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={containerVariants}
          >
            <Register 
              onRegisterSuccess={handleLoginSuccess} 
              onSwitchToLogin={() => setShowLogin(true)} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
  
  // Show authenticated content
  return (
    <motion.div 
      className="App"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="app-header"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="header-title">
          <h1>Firmament Notebooks</h1>
          {userInfo && (
            <motion.div 
              className="user-info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              Welcome, {userInfo.firstName} {userInfo.lastName}
            </motion.div>
          )}
        </div>
        <motion.button 
          className="logout-button" 
          onClick={handleLogout}
          whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)" }}
          whileTap={{ y: 0, boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)" }}
        >
          Logout
        </motion.button>
      </motion.div>

      <motion.div 
        className="app-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <AnimatePresence mode="wait">
          {/* List View */}
          {currentView === 'list' && (
            <motion.div
              key="list"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <NotebookList 
                notebooks={notebooks}
                onStartNewNotebook={handleStartNewNotebook}
                onViewNotebook={handleViewNotebook}
                onDeleteNotebook={handleDeleteNotebook}
              />
            </motion.div>
          )}
          
          {/* New Notebook View */}
          {currentView === 'new' && (
            <motion.div
              key="new"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <NotebookDetail
                isNewNotebook={true}
                userId={userId}
                onSaveNotebook={handleSaveNotebook}
                onBackToList={handleBackToList}
              />
            </motion.div>
          )}
          
          {/* View Existing Notebook */}
          {currentView === 'view' && selectedNotebook && (
            <motion.div
              key="view"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <NotebookDetail
                notebook={selectedNotebook}
                userId={userId}
                onSaveNotebook={handleSaveNotebook}
                onBackToList={handleBackToList}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      <AnimatePresence>
        {isSaving && (
          <motion.div 
            className="saving-indicator"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="saving-spinner"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <span>Saving notebook...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
