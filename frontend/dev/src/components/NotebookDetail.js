import React, { useState, useEffect, useRef } from 'react';
import TranscriptionMic from './TranscriptionMic';
import { GEMINI_API_KEY } from '../config/api-keys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './NotebookDetail.css';

// Initialize the Generative AI model
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const NotebookDetail = ({ 
  transcript, 
  userId, 
  onSaveTranscript, 
  onBackToList, 
  isNewTranscription = false 
}) => {
  // Track both the current recording state and whether we ever had text
  const [isRecording, setIsRecording] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [hasTranscript, setHasTranscript] = useState(false);
  const [status, setStatus] = useState('');
  const [title, setTitle] = useState(isNewTranscription ? 'New Note' : transcript?.title || 'Untitled');
  const [activeTab, setActiveTab] = useState('transcript'); // 'transcript' or 'summary'
  
  // Flag to track if a transcript was just saved (to prevent double saves)
  const [recentlySaved, setRecentlySaved] = useState(false);
  const lastSavedNoteId = useRef(null);
  
  // Summary and keywords state
  const [summaryText, setSummaryText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  
  // State for copy button feedback
  const [copyFeedback, setCopyFeedback] = useState({ type: '', message: '' });
  
  // State for title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef(null);
  
  // Track recording start time
  const recordingStartTimeRef = useRef(null);
  
  // Set initial note and transcript content if viewing an existing one
  useEffect(() => {
    if (!isNewTranscription && transcript) {
      const initialText = transcript?.noteText || transcript?.originalText || transcript?.text || '';
      const initialTranscript = transcript?.curTranscript || '';
      
      setNoteText(initialText);
      setTranscriptText(initialTranscript);
      setTitle(transcript?.title || 'Untitled');
      lastSavedNoteId.current = transcript?._id || null;
      
      // If there's transcript text, mark that we have a transcript
      if (initialTranscript && initialTranscript.trim() !== '') {
        setHasTranscript(true);
      }
      
      // Load existing summary and keywords if available
      if (transcript?.curSummary) {
        try {
          const summaryData = JSON.parse(transcript.curSummary);
          setSummaryText(summaryData.summary || '');
          setKeywords(summaryData.keywords || []);
        } catch (e) {
          // If it's not JSON, treat it as just summary text
          setSummaryText(transcript.curSummary);
        }
      }
      
      // Always start in transcript tab when viewing a notebook
      setActiveTab('transcript');
    }
  }, [transcript, isNewTranscription]);

  // Reset to transcript tab when recording state changes
  useEffect(() => {
    console.log("🎙️ [NotebookDetail] Recording state changed:", isRecording);
    if (isRecording) {
      console.log("🔴 [NotebookDetail] Recording started - switching to transcript tab");
      setActiveTab('transcript');
      
      // Reset summary and keywords when starting a new recording
      setSummaryText('');
      setKeywords([]);
      
      // If we have a note ID, clear the summary in the database
      if (lastSavedNoteId.current) {
        // Prepare data with empty summary
        const notebookData = {
          userId: userId,
          noteId: lastSavedNoteId.current,
          title: title,
          noteText: noteText,
          originalText: noteText,
          text: noteText,
          curTranscript: transcriptText,
          curSummary: '', // Clear summary
          date: transcript?.date || new Date().toISOString(),
          duration: transcript?.duration || 0
        };
        
        // Update the note in the database with empty summary
        console.log("🧹 [NotebookDetail] Clearing summary in database");
        onSaveTranscript(notebookData, null, true);
      }
      
      // Set start time when recording begins
      recordingStartTimeRef.current = new Date();
      console.log("📊 [NotebookDetail] Recording started, setting start time:", recordingStartTimeRef.current);
    } else {
      console.log("⏹️ [NotebookDetail] Recording stopped");
      
      // Calculate duration when recording stops
      if (recordingStartTimeRef.current) {
        const endTime = new Date();
        const durationSeconds = Math.round((endTime - recordingStartTimeRef.current) / 1000);
        console.log(`📊 [NotebookDetail] Recording ended, duration: ${durationSeconds} seconds`);
      }
    }
  }, [isRecording]);
  
  // Generate summary and keywords when switching to summary tab
  useEffect(() => {
    if (activeTab === 'summary' && transcriptText.length > 100 && !summaryText && !isSummaryLoading) {
      generateSummaryAndKeywords();
    }
  }, [activeTab, transcriptText, summaryText, isSummaryLoading]);

  // Get current date and time formatted for display
  const getCurrentDateTime = () => {
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric'
    });
    const time = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${date} at ${time}`;
  };

  // Generate summary and keywords using Gemini Flash API
  const generateSummaryAndKeywords = async () => {
    if (transcriptText.length <= 100) {
      setSummaryError('Transcript is too short to generate a summary.');
      return;
    }
    
    setIsSummaryLoading(true);
    setSummaryError('');
    
    try {
      // Create the prompts for summary and keywords
      const summaryPrompt = `Summarize the following transcript in 3-4 clear sentences that capture the main points:
                    
                     "${transcriptText}"
                     
                     Summary:`;
      
      const keywordsPrompt = `Extract 5-7 important keywords or key phrases from this transcript. Return just the keywords separated by commas, without numbering or explanation:
                    
                     "${transcriptText}"
                     
                     Keywords:`;
      
      // Run both API calls in parallel for better performance
      const [summaryResponse, keywordsResponse] = await Promise.all([
        model.generateContent(summaryPrompt),
        model.generateContent(keywordsPrompt)
      ]);
      
      // Extract results from responses
      const summaryResult = summaryResponse.response.text().trim();
      const keywordsResult = keywordsResponse.response.text().trim();
      
      // Process the keywords into an array and clean up
      const keywordsList = keywordsResult
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0);
      
      setSummaryText(summaryResult);
      setKeywords(keywordsList);
      
      // Save the summary and keywords with the note - Automatically
      const summaryPayload = {
        summary: summaryResult,
        keywords: keywordsList
      };
      
      // Prepare data for saving
      const notebookData = {
        userId: userId,
        noteId: lastSavedNoteId.current || transcript?._id || null,
        title: title,
        noteText: noteText,
        originalText: noteText,
        text: noteText,
        curTranscript: transcriptText,
        curSummary: JSON.stringify(summaryPayload),
        date: transcript?.date || new Date().toISOString(),
        duration: transcript?.duration || 0
      };
      
      // Automatically save the summary data
      if (notebookData.noteId) {
        console.log("Automatically saving summary and keywords");
        setStatus("Saving summary...");
        onSaveTranscript(notebookData, null, true).then(noteId => {
          if (noteId) {
            lastSavedNoteId.current = noteId;
            setStatus("Summary saved");
            // Clear status after a few seconds
            setTimeout(() => setStatus(""), 2000);
          }
        });
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      setSummaryError('Failed to generate summary: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleStatusChange = (newStatus) => {
    console.log("ℹ️ [NotebookDetail] Status change:", newStatus);
    setStatus(newStatus || '');
    
    // Update recording state based on status
    if (newStatus && newStatus.includes('start recording')) {
      console.log("🔴 [NotebookDetail] Setting isRecording to TRUE - start recording detected");
      setIsRecording(true);
      // Force switch to transcript tab when recording starts
      setActiveTab('transcript');
      // Reset saved flag when starting new recording
      setRecentlySaved(false);
    } else if (newStatus && (
      newStatus.includes('stop') || 
      newStatus.includes('Click the microphone to start') || 
      newStatus.includes('disconnected')
    )) {
      console.log("⏹️ [NotebookDetail] Setting isRecording to FALSE - stop/click/disconnect detected");
      setIsRecording(false);
    }
  };

  const handleTranscriptChange = (newTranscript, recordingStatus) => {
    console.log("📝 [NotebookDetail] Transcript updated:", { 
      textLength: newTranscript.length,
      recordingStatus,
      hasContent: newTranscript && newTranscript.trim().length > 0,
      currentRecordingState: isRecording
    });
    
    // Always update the transcript text state
    setTranscriptText(newTranscript);
    
    // If we received transcript text, mark that we have a transcript
    if (newTranscript && newTranscript.trim() !== '') {
      if (!hasTranscript) {
        console.log("✅ [NotebookDetail] Setting hasTranscript to TRUE");
        setHasTranscript(true);
      }
    }
    
    // Reset saved flag if text changed
    if (recentlySaved && newTranscript !== transcriptText) {
      setRecentlySaved(false);
    }
    
    // IMPORTANT: Only update recording state if explicitly provided and different
    // AND only if it's transitioning from true to false (stopping recording)
    // Don't allow transcript updates to start recording automatically
    if (recordingStatus === false && isRecording === true) {
      console.log(`🔄 [NotebookDetail] Stopping recording based on update from TranscriptionMic`);
      setIsRecording(false);
    } else if (recordingStatus !== undefined) {
      console.log(`ℹ️ [NotebookDetail] Received recording status ${recordingStatus}, current is ${isRecording} - not changing`);
    }
  };

  const handleCompleteTranscript = (completeTranscript) => {
    console.log("Complete transcript received:", {
      textLength: completeTranscript.text?.length || 0,
      stayOnPage: completeTranscript.stayOnPage,
      duration: completeTranscript.duration || 0
    });
  
    // Don't save if there's no content
    if (!completeTranscript.text || completeTranscript.text.trim() === '') {
      console.log("Nothing to save - transcript is empty");
      return;
    }
    
    // Reset recording start time reference
    recordingStartTimeRef.current = null;
  
    // When complete transcript is ready, prepare data for saving
    const notebookData = {
      userId: userId,
      noteId: lastSavedNoteId.current || transcript?._id || null,
      title: title || `Note ${new Date().toLocaleDateString()}`,
      noteText: noteText || '',
      originalText: noteText || '', // For compatibility 
      text: noteText || '', // For compatibility
      curTranscript: completeTranscript.text || '',
      curSummary: '',
      date: completeTranscript.date || new Date().toISOString(),
      duration: completeTranscript.duration || calculateCurrentDuration() || 0
    };
    
    // Log the duration being saved
    console.log(`📊 [NotebookDetail] Saving transcript with duration: ${notebookData.duration} seconds`);
    
    // Determine if we should stay on the page after saving
    const shouldStayOnPage = true;
    
    // Mark as recently saved to prevent duplicate saves
    setRecentlySaved(true);
    
    // Show status
    setStatus("Saving transcript...");
    
    // Send to parent component to save (without alert message)
    onSaveTranscript(notebookData, null, shouldStayOnPage).then(noteId => {
      if (noteId) {
        lastSavedNoteId.current = noteId;
        setStatus("Transcript saved");
        setTimeout(() => setStatus(""), 2000);
      } else {
        setStatus("Error saving transcript");
        setTimeout(() => setStatus(""), 2000);
      }
    });
  };

  const handleNoteChange = (e) => {
    // Reset saved flag when note text changes
    if (recentlySaved && e.target.value !== noteText) {
      setRecentlySaved(false);
    }
    setNoteText(e.target.value);
  };

  const handleTitleChange = (e) => {
    // Reset saved flag when title changes
    if (recentlySaved && e.target.value !== title) {
      setRecentlySaved(false);
    }
    setTitle(e.target.value);
  };
  
  // Handle title edit mode
  const startEditingTitle = () => {
    setIsEditingTitle(true);
    // Focus the input after state update
    setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, 10);
  };
  
  // Handle title save on blur
  const handleTitleBlur = async () => {
    setIsEditingTitle(false);
    
    // Don't save if title is empty, revert to previous or default title
    if (!title.trim()) {
      setTitle(transcript?.title || 'Untitled');
      return;
    }
    
    // If we don't have a note ID yet or title hasn't changed, don't save
    if (!lastSavedNoteId.current || title === transcript?.title) {
      return;
    }
    
    // Save the updated title
    const notebookData = {
      userId: userId,
      noteId: lastSavedNoteId.current,
      title: title,
      // Keep other fields the same
      noteText: noteText,
      curTranscript: transcriptText || '',
      curSummary: transcript?.curSummary || '',
      date: transcript?.date || new Date().toISOString(),
      duration: transcript?.duration || 0
    };
    
    // Show saving status
    setStatus("Saving title...");
    
    // Auto-save the title change
    try {
      await onSaveTranscript(notebookData, null, true);
      setStatus("Title saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      console.error("Error saving title:", error);
      setStatus("Error saving title");
      setTimeout(() => setStatus(""), 2000);
    }
  };
  
  // Handle keyboard events on title input
  const handleTitleKeyDown = (e) => {
    // Save on Enter key
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur(); // Trigger blur to save
    }
    // Cancel on Escape key
    if (e.key === 'Escape') {
      e.preventDefault();
      setTitle(transcript?.title || 'Untitled');
      setIsEditingTitle(false);
    }
  };

  // Calculate current duration in seconds
  const calculateCurrentDuration = () => {
    if (!recordingStartTimeRef.current) {
      // Use existing duration if available
      return transcript?.duration || 0;
    }
    
    // Calculate elapsed time since recording started
    const now = new Date();
    const durationSeconds = Math.round((now - recordingStartTimeRef.current) / 1000);
    console.log(`📊 [NotebookDetail] Current duration: ${durationSeconds} seconds`);
    return durationSeconds;
  };
  
  const handleSaveNote = async () => {
    // If recording is active, we need to handle recording stop first
    if (isRecording) {
      // No need for a separate confirmation dialog - just inform the user what's happening
      setStatus("Stopping recording and saving notebook...");
      
      // Calculate duration before stopping recording
      const currentDuration = calculateCurrentDuration();
      
      // Force stop recording via TranscriptionMic
      setIsRecording(false);
      
      // Small delay to allow TranscriptionMic to properly close connections
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // If we don't have any content yet, don't save
      if (!transcriptText.trim() && !noteText.trim()) {
        setStatus("Nothing to save yet");
        setTimeout(() => setStatus(""), 2000);
        return;
      }
      
      // Directly proceed to saving without additional confirmations
      const notebookData = {
        userId: userId,
        noteId: lastSavedNoteId.current || transcript?._id || null,
        title: title || `Note ${new Date().toLocaleDateString()}`,
        noteText: noteText,
        originalText: noteText, // For compatibility
        text: noteText, // For compatibility
        curTranscript: transcriptText || '', // Include current transcript
        curSummary: '', // Clear summary since we're stopping mid-recording
        date: new Date().toISOString(),
        duration: currentDuration // Use calculated duration
      };
      
      if (!userId) {
        console.error("Cannot save note: No userId provided");
        alert("Cannot save note: No user ID provided");
        return;
      }
      
      // Show saving indicator
      setStatus("Saving notebook...");
      
      // Mark as recently saved
      setRecentlySaved(true);
      
      try {
        // Force stayOnPage to be false to ensure navigation
        const noteId = await onSaveTranscript(notebookData, null, false);
        
        if (noteId) {
          lastSavedNoteId.current = noteId;
          // Navigation will happen automatically through onSaveTranscript
        } else {
          // In case of error, show a message
          setStatus("Error saving notebook");
          setTimeout(() => setStatus(""), 2000);
        }
      } catch (error) {
        console.error("Error saving notebook:", error);
        setStatus("Error saving notebook: " + error.message);
        setTimeout(() => setStatus(""), 3000);
      }
      
      return;
    }
    
    // If we're not recording, handle normal save
    
    // If we just saved from stopping the recording and haven't changed anything, skip the save
    if (recentlySaved && !isRecording) {
      // Just navigate back without saving again
      onBackToList();
      return;
    }
    
    // Save the current note without new transcription
    const notebookData = {
      userId: userId,
      noteId: lastSavedNoteId.current || transcript?._id || null,
      title: title || `Note ${new Date().toLocaleDateString()}`,
      noteText: noteText,
      originalText: noteText, // For compatibility
      text: noteText, // For compatibility
      curTranscript: transcriptText || '', // Include current transcript
      curSummary: summaryText ? JSON.stringify({
        summary: summaryText,
        keywords: keywords || []
      }) : '',
      date: new Date().toISOString(),
      duration: transcript?.duration || 0 // No duration for manual save
    };
    
    if (!userId) {
      console.error("Cannot save note: No userId provided");
      alert("Cannot save note: No user ID provided");
      return;
    }
    
    // Show a temporary saving indicator
    setStatus("Saving notebook...");
    
    // Mark as recently saved
    setRecentlySaved(true);
    
    try {
      // Force stayOnPage to be false to ensure navigation
      const noteId = await onSaveTranscript(notebookData, null, false);
      if (noteId) {
        lastSavedNoteId.current = noteId;
      }
    } catch (error) {
      console.error("Error saving notebook:", error);
      setStatus("Error saving notebook: " + error.message);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  // Handle going back to the list - forcibly stop recording
  const handleBackToList = async () => {
    // If currently recording, force stop first
    if (isRecording) {
      // Force stop recording via TranscriptionMic
      setIsRecording(false);
      
      // Show status while stopping
      setStatus("Stopping recording...");
      
      // Small delay to allow TranscriptionMic to properly close connections
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Navigate back to the list without saving
    onBackToList();
  };
  
  // IMPORTANT: Check if we should show the summary tab
  // Only show when:
  // 1. Not recording
  // 2. Has transcript text
  const shouldShowSummaryTab = !isRecording && hasTranscript && transcriptText.trim() !== '';
  
  // Handle tab change - only allow switching to summary when not recording
  const handleTabChange = (tab) => {
    if (tab === 'summary' && isRecording) {
      return; // Don't allow switching to summary during recording
    }
    
    // Only allow summary tab if we have a transcript and not recording
    if (tab === 'summary' && (!hasTranscript || transcriptText.trim() === '')) {
      return; // Don't allow switching without transcript
    }
    
    setActiveTab(tab);
  };
  
  // Regenerate summary and keywords if desired
  const handleRegenerateSummary = () => {
    setSummaryText('');
    setKeywords([]);
    setIsSummaryLoading(false);
    setSummaryError('');
    // Setting these to empty will trigger the useEffect to regenerate
  };

  // Function to handle copying text to clipboard
  const handleCopy = async (text, type) => {
    if (!text) {
      setCopyFeedback({ type, message: 'Nothing to copy' });
      setTimeout(() => setCopyFeedback({ type: '', message: '' }), 2000);
      return;
    }
    
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback({ type, message: 'Copied to clipboard!' });
      setTimeout(() => setCopyFeedback({ type: '', message: '' }), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopyFeedback({ type, message: 'Failed to copy' });
      setTimeout(() => setCopyFeedback({ type: '', message: '' }), 2000);
    }
  };

  // Function to open Perplexity AI with a keyword in the context of the summary
  const openPerplexityWithKeyword = (keyword) => {
    if (!keyword) return;
    
    // Create a query that includes the keyword and summary context
    let query = `Explain the concept of "${keyword}"`;
    
    // Add summary context if available
    if (summaryText && summaryText.trim().length > 0) {
      query += ` in the context of: "${summaryText.trim()}"`;
    }
    
    // URL encode the query
    const encodedQuery = encodeURIComponent(query);
    
    // Create Perplexity URL with the query
    const perplexityUrl = `https://www.perplexity.ai/search?q=${encodedQuery}`;
    
    // Open in a new browser tab
    window.open(perplexityUrl, '_blank');
  };

  return (
    <div className="notebook-detail-container">
      {/* Header row with title and navigation */}
      <div className="notebook-header">
        <div className="notebook-title-section">
          {isEditingTitle ? (
            <input 
              ref={titleInputRef}
              type="text" 
              className="notebook-title-input editing"
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              placeholder="Enter notebook title"
            />
          ) : (
            <h2 
              className="notebook-title-display"
              onClick={startEditingTitle}
              title="Click to edit title"
            >
              {title}
            </h2>
          )}
          <div className="notebook-date">{getCurrentDateTime()}</div>
        </div>
        
        <div className="notebook-actions">
          <button 
            className="home-button" 
            onClick={handleBackToList}
          >
            Home
          </button>
          
          <button 
            className="save-button" 
            onClick={handleSaveNote}
          >
            Save
          </button>
        </div>
      </div>
      
      {/* Main content area with two columns */}
      <div className="notebook-content">
        {/* Left column - Note taking area */}
        <div className="note-column">
          <textarea
            className="note-textarea"
            value={noteText}
            onChange={handleNoteChange}
            placeholder="Start typing your notes here..."
          />
        </div>
        
        {/* Right column - Transcription/Summary area */}
        <div className="transcription-column">
          {/* Microphone component */}
          <div className="microphone-container">
            <TranscriptionMic
              onStatusChange={handleStatusChange}
              onTranscriptChange={handleTranscriptChange}
              onCompleteTranscript={handleCompleteTranscript}
              userId={userId}
              isRecording={isRecording}
              setIsRecording={setIsRecording}
            />
            {status && (
              <div className="transcription-status">{status}</div>
            )}
          </div>
          
          {/* Tabs for Transcript and Summary */}
          <div className="transcription-tabs">
            <div 
              className={`tab ${activeTab === 'transcript' ? 'active' : ''}`}
              onClick={() => handleTabChange('transcript')}
            >
              Transcript
              {isRecording && <span className="recording-indicator"></span>}
            </div>
            
            {/* Only show the summary tab when NOT recording and we have transcript content */}
            {shouldShowSummaryTab ? (
              <div 
                className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => handleTabChange('summary')}
              >
                Summary
              </div>
            ) : (
              hasTranscript && !isRecording && (
                <div className="tab disabled">
                  Summary (Waiting for transcript)
                </div>
              )
            )}
          </div>
          
          {/* Transcription/Summary display area */}
          <div className="tab-content">
            {activeTab === 'transcript' && (
              <div className="transcription-text-container">
                <div className="transcription-header">
                  <h3>Transcript</h3>
                  <button 
                    className="copy-button"
                    onClick={() => handleCopy(transcriptText, 'transcript')}
                    disabled={!transcriptText}
                    title="Copy transcript to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    {copyFeedback.type === 'transcript' && (
                      <span className="copy-feedback">{copyFeedback.message}</span>
                    )}
                  </button>
                </div>
                <div className="transcription-text">
                  {transcriptText || <span className="placeholder-text">Transcript will appear here...</span>}
                </div>
              </div>
            )}
            
            {activeTab === 'summary' && !isRecording && (
              <div className="summary-content">
                {isSummaryLoading ? (
                  <div className="summary-loading">
                    <div className="spinner"></div>
                    <p>Generating summary and keywords with Gemini AI...</p>
                  </div>
                ) : summaryError ? (
                  <div className="summary-error">
                    <p>{summaryError}</p>
                    <button onClick={handleRegenerateSummary}>Try Again</button>
        </div>
      ) : (
                  <>
                    {keywords && keywords.length > 0 && (
                      <div className="keywords-section">
                        <div className="section-header">
                          <h3>Keywords</h3>
                          <button 
                            className="copy-button"
                            onClick={() => handleCopy(keywords.join(', '), 'keywords')}
                            disabled={!keywords.length}
                            title="Copy keywords to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            {copyFeedback.type === 'keywords' && (
                              <span className="copy-feedback">{copyFeedback.message}</span>
                            )}
                          </button>
                        </div>
                        <div className="keywords-list">
                          {keywords.map((keyword, index) => (
                            <button 
                              key={index} 
                              className="keyword-tag clickable"
                              onClick={() => openPerplexityWithKeyword(keyword)}
                              title={`Click to search for "${keyword}" on Perplexity AI`}
                            >
                              {keyword}
                              <span className="keyword-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                  <polyline points="15 3 21 3 21 9"></polyline>
                                  <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="summary-section">
                      <div className="section-header">
                        <h3>Summary</h3>
                        <button 
                          className="copy-button"
                          onClick={() => handleCopy(summaryText, 'summary')}
                          disabled={!summaryText}
                          title="Copy summary to clipboard"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          {copyFeedback.type === 'summary' && (
                            <span className="copy-feedback">{copyFeedback.message}</span>
                          )}
                        </button>
            </div>
                      <div className="summary-text">
                        {summaryText || <span className="placeholder-text">No summary available. Click "Generate" to create one.</span>}
            </div>
          </div>
          
                    <div className="summary-actions">
                      <button 
                        onClick={handleRegenerateSummary}
                        className="regenerate-button"
                      >
                        Regenerate
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotebookDetail;