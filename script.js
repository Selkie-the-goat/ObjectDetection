// Global variables
let model = null;
let isDetecting = false;
let speechEnabled = true;
let videoStream = null;
let animationId = null;
let minConfidence = 0.5;
let speechRate = 1.0;
let previousDetections = {};
let announcedObjects = new Set(); // Track what's been announced
let objectFirstSeen = {}; // Track when each object was first seen
let lastRepeatTime = {}; // Track last repeat announcement
let speechQueue = [];
let isSpeaking = false;
let highContrastMode = false;

// Statistics
let stats = {
  totalObjectsSeen: 0,
  uniqueTypes: new Set(),
  totalAnnouncements: 0
};

// DOM elements
const statusText = document.getElementById('statusText');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const voiceBtn = document.getElementById('voiceBtn');
const summaryBtn = document.getElementById('summaryBtn');
const contrastBtn = document.getElementById('contrastBtn');
const shortcutsBtn = document.getElementById('shortcutsBtn');
const confidenceSlider = document.getElementById('confidenceSlider');
const speechRateSlider = document.getElementById('speechRate');
const detectionList = document.getElementById('detectionList');
const countSpan = document.getElementById('count');
const noDetections = document.getElementById('noDetections');
const errorDiv = document.getElementById('error');
const placeholder = document.getElementById('placeholder');
const speechStatus = document.getElementById('speechStatus');
const speechText = document.getElementById('speechText');
const shortcutsPanel = document.getElementById('shortcutsPanel');
const liveCaptions = document.getElementById('liveCaptions');
const captionText = document.getElementById('captionText');

// Initialize the app
async function initializeApp() {
  try {
    updateStatus('Loading AI model...');
    model = await cocoSsd.load();
    updateStatus('Ready!');
    
    document.getElementById('status').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    setupKeyboardShortcuts();
  } catch (err) {
    updateStatus('Error: ' + err.message);
  }
}

// Update loading status
function updateStatus(message) {
  console.log(message);
  statusText.textContent = message;
}

// Show error message
function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
  setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

// Update speech status display
function updateSpeechStatus(text, show = true) {
  speechText.textContent = text;
  if (show) {
    speechStatus.classList.remove('hidden');
  } else {
    speechStatus.classList.add('hidden');
  }
}

// Update live captions
function updateCaptions(text) {
  captionText.textContent = text;
  liveCaptions.classList.remove('hidden');
}

// Update statistics
function updateStats() {
  document.getElementById('totalObjectsSeen').textContent = stats.totalObjectsSeen;
  document.getElementById('uniqueTypes').textContent = stats.uniqueTypes.size;
  document.getElementById('totalAnnouncements').textContent = stats.totalAnnouncements;
}

// Add text to speech queue
function speakText(text, priority = false) {
  if (!speechEnabled || !('speechSynthesis' in window)) return;
  
  if (priority) {
    speechSynthesis.cancel();
    speechQueue = [];
  }
  
  speechQueue.push(text);
  stats.totalAnnouncements++;
  updateStats();
  processNextSpeech();
}

// Process speech queue
function processNextSpeech() {
  if (isSpeaking || speechQueue.length === 0) return;
  
  isSpeaking = true;
  const text = speechQueue.shift();
  updateSpeechStatus(text);
  updateCaptions(text);
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = speechRate;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  utterance.onend = () => {
    isSpeaking = false;
    if (speechQueue.length === 0) {
      updateSpeechStatus('', false);
      setTimeout(() => {
        captionText.textContent = 'Waiting for announcements...';
      }, 2000);
    }
    setTimeout(processNextSpeech, 150);
  };
  
  utterance.onerror = () => {
    isSpeaking = false;
    updateSpeechStatus('', false);
    processNextSpeech();
  };
  
  speechSynthesis.speak(utterance);
}

// Group detections by class
function groupDetections(predictions) {
  const grouped = {};
  predictions.forEach(pred => {
    if (!grouped[pred.class]) {
      grouped[pred.class] = [];
    }
    grouped[pred.class].push(pred);
  });
  return grouped;
}

// Check if object just entered frame (NEW detection)
function announceNewObjects(current, previous) {
  const now = Date.now();
  const currentClasses = new Set(Object.keys(current));
  const previousClasses = new Set(Object.keys(previous));
  
  // Find NEW object types that just entered the frame
  const newClasses = [...currentClasses].filter(c => !previousClasses.has(c));
  
  newClasses.forEach(className => {
    const count = current[className].length;
    const avgConfidence = Math.round(
      current[className].reduce((sum, p) => sum + p.score, 0) / count * 100
    );
    
    // Mark as announced
    announcedObjects.add(className);
    objectFirstSeen[className] = now;
    lastRepeatTime[className] = now;
    
    // Update stats
    stats.totalObjectsSeen += count;
    stats.uniqueTypes.add(className);
    updateStats();
    
    // Announce new object entering frame
    if (count === 1) {
      speakText(`${className} entered the frame, ${avgConfidence} percent confidence`);
    } else {
      speakText(`${count} ${className}s entered the frame, average ${avgConfidence} percent confidence`);
    }
  });
  
  // Check for significant count increases
  currentClasses.forEach(className => {
    if (previousClasses.has(className)) {
      const currentCount = current[className].length;
      const previousCount = previous[className].length;
      const diff = currentCount - previousCount;
      
      if (diff >= 2) {
        stats.totalObjectsSeen += diff;
        updateStats();
        speakText(`${diff} more ${className}${diff > 1 ? 's' : ''} detected`);
        lastRepeatTime[className] = now;
      }
    }
  });
  
  // Repeat announcements for existing objects (every 12 seconds)
  const REPEAT_INTERVAL = 12000; // 12 seconds
  currentClasses.forEach(className => {
    if (announcedObjects.has(className) && lastRepeatTime[className]) {
      if (now - lastRepeatTime[className] > REPEAT_INTERVAL) {
        const count = current[className].length;
        const avgConfidence = Math.round(
          current[className].reduce((sum, p) => sum + p.score, 0) / count * 100
        );
        speakText(`Still detecting ${count} ${className}${count > 1 ? 's' : ''}, ${avgConfidence} percent confidence`);
        lastRepeatTime[className] = now;
      }
    }
  });
  
  // Check for objects leaving the frame
  const leftClasses = [...previousClasses].filter(c => !currentClasses.has(c));
  leftClasses.forEach(className => {
    speakText(`${className} left the frame`);
    announcedObjects.delete(className);
    delete objectFirstSeen[className];
    delete lastRepeatTime[className];
  });
}

// Announce summary of all detections
function announceSummary(grouped) {
  const classes = Object.keys(grouped);
  
  if (classes.length === 0) {
    speakText('No objects currently detected', true);
    return;
  }
  
  let summary = `Currently detecting ${classes.length} type${classes.length > 1 ? 's' : ''} of objects: `;
  
  const descriptions = classes.map(className => {
    const count = grouped[className].length;
    if (count === 1) {
      return `one ${className}`;
    } else {
      return `${count} ${className}s`;
    }
  });
  
  summary += descriptions.join(', ');
  speakText(summary, true);
}

// Get unique color for each object class
function getColorForClass(className) {
  const colors = [
    '#10b981', '#3b82f6', '#ef4444', '#f59e0b', 
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    '#06b6d4', '#84cc16', '#f43f5e', '#a855f7'
  ];
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Draw bounding box on canvas
function drawBox(ctx, prediction) {
  const [x, y, w, h] = prediction.bbox;
  const color = getColorForClass(prediction.class);
  
  // Draw bounding box with glow effect
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;
  
  // Draw label background
  ctx.fillStyle = color;
  const label = `${prediction.class} ${Math.round(prediction.score * 100)}%`;
  ctx.font = 'bold 18px Arial';
  const textWidth = ctx.measureText(label).width;
  const padding = 10;
  ctx.fillRect(x, y - 35, textWidth + padding * 2, 35);
  
  // Draw label text
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + padding, y - 10);
  
  // Draw center dot
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
  ctx.fill();
}

// Main detection loop
async function detect() {
  if (!isDetecting) return;
  
  const predictions = await model.detect(video);
  const filteredPredictions = predictions.filter(p => p.score >= minConfidence);
  
  // Clear and redraw canvas
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  filteredPredictions.forEach(pred => drawBox(ctx, pred));
  
  // Update display
  const grouped = groupDetections(filteredPredictions);
  updateDetectionDisplay(grouped);
  
  // Smart announcements - only for NEW objects
  announceNewObjects(grouped, previousDetections);
  
  previousDetections = grouped;
  
  animationId = requestAnimationFrame(detect);
}

// Update the detection list display
function updateDetectionDisplay(grouped) {
  const classes = Object.keys(grouped);
  const totalObjects = classes.reduce((sum, c) => sum + grouped[c].length, 0);
  
  countSpan.textContent = totalObjects;
  
  if (totalObjects === 0) {
    detectionList.innerHTML = '';
    noDetections.style.display = 'block';
  } else {
    noDetections.style.display = 'none';
    
    let html = '';
    classes.forEach(className => {
      const objects = grouped[className];
      const avgConf = Math.round(
        objects.reduce((sum, p) => sum + p.score, 0) / objects.length * 100
      );
      
      const isNew = !previousDetections[className];
      
      html += `
        <div class="detection-group">
          <div class="group-header">
            <span>${className}</span>
            <span class="group-count">${objects.length}x</span>
          </div>
          <div class="detection-item ${isNew ? 'new' : ''}">
            <span class="detection-name">${objects.length} ${className}${objects.length > 1 ? 's' : ''}</span>
            <span class="detection-confidence">${avgConf}%</span>
          </div>
        </div>
      `;
    });
    
    detectionList.innerHTML = html;
  }
}

// Start camera and detection
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 1280, height: 720 } 
    });
    video.srcObject = videoStream;
    await video.play();
    isDetecting = true;
    startBtn.textContent = '⏹️ Stop Detection';
    startBtn.className = 'btn-danger';
    startBtn.setAttribute('aria-label', 'Stop detection (Space)');
    placeholder.classList.add('hidden');
    liveCaptions.classList.remove('hidden');
    speakText('Object detection started');
    detect();
  } catch (err) {
    showError('Camera access denied: ' + err.message);
  }
}

// Stop camera and detection
function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  isDetecting = false;
  startBtn.textContent = '▶️ Start Detection';
  startBtn.className = 'btn-primary';
  startBtn.setAttribute('aria-label', 'Start detection (Space)');
  placeholder.classList.remove('hidden');
  liveCaptions.classList.add('hidden');
  speechSynthesis.cancel();
  previousDetections = {};
  announcedObjects.clear();
  objectFirstSeen = {};
  lastRepeatTime = {};
}

// Toggle high contrast mode
function toggleHighContrast() {
  highContrastMode = !highContrastMode;
  document.body.classList.toggle('high-contrast', highContrastMode);
  contrastBtn.setAttribute('aria-pressed', highContrastMode);
  speakText(highContrastMode ? 'High contrast mode enabled' : 'High contrast mode disabled');
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in an input
    if (e.target.tagName === 'INPUT') return;
    
    switch(e.key.toLowerCase()) {
      case ' ':
        e.preventDefault();
        startBtn.click();
        break;
      case 'v':
        e.preventDefault();
        voiceBtn.click();
        break;
      case 's':
        e.preventDefault();
        summaryBtn.click();
        break;
      case 'h':
        e.preventDefault();
        toggleHighContrast();
        break;
      case 'k':
        e.preventDefault();
        shortcutsPanel.classList.toggle('hidden');
        break;
      case '+':
      case '=':
        e.preventDefault();
        if (minConfidence < 0.9) {
          minConfidence += 0.05;
          confidenceSlider.value = minConfidence * 100;
          document.getElementById('confidenceValue').textContent = Math.round(minConfidence * 100) + '%';
        }
        break;
      case '-':
        e.preventDefault();
        if (minConfidence > 0.1) {
          minConfidence -= 0.05;
          confidenceSlider.value = minConfidence * 100;
          document.getElementById('confidenceValue').textContent = Math.round(minConfidence * 100) + '%';
        }
        break;
    }
  });
}

// Event Listeners
startBtn.addEventListener('click', () => {
  if (isDetecting) {
    stopCamera();
  } else {
    startCamera();
  }
});

voiceBtn.addEventListener('click', () => {
  speechEnabled = !speechEnabled;
  if (speechEnabled) {
    voiceBtn.textContent = '🔊 Voice On';
    voiceBtn.className = 'btn-success';
    voiceBtn.setAttribute('aria-pressed', 'true');
    speakText('Voice announcements enabled');
  } else {
    voiceBtn.textContent = '🔇 Voice Off';
    voiceBtn.className = 'btn-secondary';
    voiceBtn.setAttribute('aria-pressed', 'false');
    speechSynthesis.cancel();
    updateSpeechStatus('', false);
  }
});

summaryBtn.addEventListener('click', () => {
  announceSummary(previousDetections);
});

contrastBtn.addEventListener('click', () => {
  toggleHighContrast();
});

shortcutsBtn.addEventListener('click', () => {
  shortcutsPanel.classList.toggle('hidden');
});

// Close shortcuts panel when clicking outside
shortcutsPanel.addEventListener('click', (e) => {
  if (e.target === shortcutsPanel) {
    shortcutsPanel.classList.add('hidden');
  }
});

confidenceSlider.addEventListener('input', (e) => {
  minConfidence = e.target.value / 100;
  document.getElementById('confidenceValue').textContent = e.target.value + '%';
});

speechRateSlider.addEventListener('input', (e) => {
  speechRate = e.target.value / 10;
  document.getElementById('speechRateValue').textContent = speechRate.toFixed(1) + 'x';
});

// Start the app when libraries are loaded
window.addEventListener('load', () => {
  if (typeof tf !== 'undefined' && typeof cocoSsd !== 'undefined') {
    initializeApp();
  } else {
    updateStatus('Error: Failed to load required libraries');
  }
});