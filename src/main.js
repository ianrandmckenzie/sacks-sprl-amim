// Import tutorial system
import TutorialManager from './tutorial.js';
import { SecurityUtils, inputRateLimiter, fullscreenRateLimiter } from './security.js';

// Polyfill for requestIdleCallback in environments where it's not available
if (typeof requestIdleCallback === 'undefined') {
  window.requestIdleCallback = function(callback) {
    const start = Date.now();
    return setTimeout(function() {
      callback({
        didTimeout: false,
        timeRemaining: function() {
          return Math.max(0, 50 - (Date.now() - start));
        }
      });
    }, 1);
  };
}

if (typeof cancelIdleCallback === 'undefined') {
  window.cancelIdleCallback = function(id) {
    clearTimeout(id);
  };
}

const canvas = document.getElementById('spiralCanvas')
const ctx    = canvas.getContext('2d')

// spiral settings
let scale = 5
let maxN = 5000
let spiralCoeff = 2
let points = []
let showPrimes = true
let showClusters = true
let showRotation = true
let rotationSpeed = 0.1
let currentRotation = 0
let useSquares = false
let dotSize = 0.1
let primeSize = 10.0
let isFullscreen = false
let wasFullscreenBefore = false // Track if window was fullscreen before entering current fullscreen session
let menuVisible = true // Track menu visibility state
let interfaceVisibleInFullscreen = false // Track if interface is currently visible while in fullscreen
let instantRender = true

// Tutorial system
let tutorialManager = null;

// Spiral coefficient animation settings
let animateSpiralCoeff = false
let spiralAnimationSpeed = 100 // milliseconds
let spiralAnimationIncrement = 0.1
let spiralAnimationMin = 1
let spiralAnimationMax = 500
let spiralAnimationDirection = 1 // 1 for incrementing, -1 for decrementing
let spiralAnimationInterval = null

// Cursor auto-hide functionality for fullscreen
let cursorTimeout = null
let cursorHidden = false
const CURSOR_HIDE_DELAY = 2000 // 2 seconds

// cluster settings
let clusterCount = 100
const clusterRadius = 200
const sizeBoost     = 1
const liftHeight    = 10
const trailAlpha    = 0.25

const clusters = []

// Cursor auto-hide functionality
function hideCursor() {
  if (!cursorHidden) {
    document.body.style.cursor = 'none'
    cursorHidden = true
  }
}

function showCursor() {
  if (cursorHidden) {
    document.body.style.cursor = 'default'
    cursorHidden = false
  }
}

function resetCursorTimer() {
  // Clear existing timeout
  if (cursorTimeout) {
    clearTimeout(cursorTimeout)
  }

  // Show cursor and set new timeout
  showCursor()

  // Only auto-hide cursor in fullscreen mode
  if (isFullscreen) {
    cursorTimeout = setTimeout(hideCursor, CURSOR_HIDE_DELAY)
  }
}

// Accessibility helper functions
function announceToScreenReader(message, isError = false) {
  const announcement = document.getElementById(isError ? 'errorAnnouncements' : 'statusAnnouncements');
  if (announcement) {
    announcement.textContent = message;
    // Clear after a delay to allow re-announcing the same message if needed
    setTimeout(() => {
      announcement.textContent = '';
    }, 1000);
  }
}

function updateCanvasDescription() {
  const spiralValue = document.getElementById('currentSpiralValue');
  const pointCount = document.getElementById('currentPointCount');
  if (spiralValue) spiralValue.textContent = spiralCoeff.toFixed(1);
  if (pointCount) pointCount.textContent = maxN.toLocaleString();
}

// Enhanced keyboard navigation for canvas
function addCanvasKeyboardSupport() {
  const canvas = document.getElementById('spiralCanvas');
  if (!canvas) return;

  canvas.addEventListener('keydown', (e) => {
    // Don't handle if user is typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch(e.key) {
      case 'ArrowUp':
        e.preventDefault();
        const currentSpiral = parseFloat(document.getElementById('spiralNumber').value);
        const newSpiral = Math.min(2000, currentSpiral + 0.5);
        document.getElementById('spiralSlider').value = newSpiral;
        document.getElementById('spiralNumber').value = newSpiral;
        spiralCoeff = newSpiral;
        computePoints();
        announceToScreenReader(`Spiral coefficient increased to ${newSpiral.toFixed(1)}`);
        break;
      case 'ArrowDown':
        e.preventDefault();
        const currentSpiralDown = parseFloat(document.getElementById('spiralNumber').value);
        const newSpiralDown = Math.max(0.1, currentSpiralDown - 0.5);
        document.getElementById('spiralSlider').value = newSpiralDown;
        document.getElementById('spiralNumber').value = newSpiralDown;
        spiralCoeff = newSpiralDown;
        computePoints();
        announceToScreenReader(`Spiral coefficient decreased to ${newSpiralDown.toFixed(1)}`);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        announceToScreenReader(`Current spiral shows ${maxN} points with coefficient ${spiralCoeff.toFixed(1)}. Prime numbers are ${showPrimes ? 'highlighted' : 'not highlighted'}. Rotation is ${showRotation ? 'active' : 'inactive'}.`);
        break;
    }
  });
}

// Fullscreen functionality
let toastTimeout = null

// Helper function to generate mobile-friendly messages
function getMobileMessage(desktopMessage) {
  const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  if (!isMobile) return desktopMessage

  // Replace ESC references with mobile equivalent
  return desktopMessage
    .replace(/Press ESC/g, 'Tap ✕ at the top-right of this screen')
    .replace(/ESC to/g, 'Tap ✕ at the top-right of this screen to')
    .replace(/or ESC/g, 'or tap ✕ at the top-right of this screen')
}

function showFullscreenToast() {
  const toast = document.getElementById('fullscreenToast')
  toast.classList.add('show')

  // Clear existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  // Hide toast after 3 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

async function enterFullscreen() {
  // Rate limiting for fullscreen requests
  if (!fullscreenRateLimiter()) {
    console.warn('Fullscreen rate limit exceeded');
    return;
  }

  // Check if we're in Tauri environment
  if (window.__TAURI__) {
    try {
      // Use Tauri's window API
      await window.__TAURI__.window.getCurrentWindow().setFullscreen(true);
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  } else {
    // Browser fullscreen API
    const element = document.documentElement;
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }

  // Start cursor auto-hide timer when entering fullscreen
  resetCursorTimer();
}

async function exitFullscreen() {
  // Stop cursor auto-hide when exiting fullscreen
  if (cursorTimeout) {
    clearTimeout(cursorTimeout)
    cursorTimeout = null
  }
  showCursor()

  // Check if we're in Tauri environment
  if (window.__TAURI__) {
    try {
      // Use Tauri's window API
      await window.__TAURI__.window.getCurrentWindow().setFullscreen(false)
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
    }
  } else {
    // Browser fullscreen API
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen()
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen()
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
    }
  }
}

async function showInterfaceInFullscreen() {
  // When in fullscreen mode but wanting to show interface (for users who were already fullscreen)
  console.log('Showing interface in fullscreen mode')

  // Force show the interface elements temporarily
  const sidebar = document.getElementById('sidebar')
  const sidebarToggle = document.getElementById('sidebarToggle')
  const fullscreenToggle = document.getElementById('fullscreenToggle')

  sidebar.style.display = 'flex'
  sidebarToggle.style.display = 'flex'
  fullscreenToggle.style.display = 'flex'

  // Show cursor when interface is shown and stop auto-hide
  if (cursorTimeout) {
    clearTimeout(cursorTimeout)
    cursorTimeout = null
  }
  showCursor()

  // Show informative toast
  const toast = document.getElementById('fullscreenToast')
  toast.textContent = getMobileMessage('Interface restored - Use macOS fullscreen controls to exit, or ESC to hide interface')
  toast.classList.add('show')

  // Clear existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  // Hide toast after 4 seconds (longer since it has more text)
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show')
    toast.textContent = getMobileMessage('Press ESC to exit fullscreen')
  }, 4000)
}

function hideInterfaceInFullscreen() {
  // When in fullscreen mode and wanting to hide interface again
  console.log('Hiding interface in fullscreen mode')

  // Hide the interface elements
  const sidebar = document.getElementById('sidebar')
  const sidebarToggle = document.getElementById('sidebarToggle')
  const fullscreenToggle = document.getElementById('fullscreenToggle')

  sidebar.style.display = 'none'
  sidebarToggle.style.display = 'none'
  fullscreenToggle.style.display = 'none'

  // Restart cursor auto-hide when interface is hidden
  resetCursorTimer()

  // Show informative toast
  const toast = document.getElementById('fullscreenToast')
  toast.textContent = getMobileMessage('Interface hidden - Press ESC to show interface')
  toast.classList.add('show')

  // Clear existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }

  // Hide toast after 3 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show')
  }, 3000)
}

async function toggleFullscreen() {
  if (window.__TAURI__) {
    if (isFullscreen) {
      // We're currently in fullscreen, check if we should exit or just toggle interface
      if (wasFullscreenBefore) {
        // Window was fullscreen before entering current fullscreen session
        // Just toggle interface visibility instead of exiting fullscreen
        console.log('Toggling interface visibility instead of exiting fullscreen (was fullscreen before)')
        if (interfaceVisibleInFullscreen) {
          hideInterfaceInFullscreen()
          interfaceVisibleInFullscreen = false
        } else {
          showInterfaceInFullscreen()
          interfaceVisibleInFullscreen = true
        }
      } else {
        // Window was not fullscreen before, so actually exit fullscreen
        console.log('Exiting fullscreen (was not fullscreen before)')
        isFullscreen = false
        wasFullscreenBefore = false
        menuVisible = true // Reset menu state when exiting fullscreen
        interfaceVisibleInFullscreen = false // Reset interface visibility state
        await exitFullscreen()
        // Update UI immediately for Tauri
        updateFullscreenState()
        // Save fullscreen state
        savePreference('isFullscreen', isFullscreen)
        // Save window state after a short delay to capture correct windowed dimensions
        setTimeout(() => {
          saveWindowState()
        }, 500)
      }
    } else {
      // We're not in fullscreen, so enter fullscreen
      // First, record the current fullscreen state as "before" state
      console.log('Entering fullscreen (was fullscreen before:', isFullscreen, ')')
      wasFullscreenBefore = isFullscreen
      isFullscreen = true
      menuVisible = true // Reset menu visibility when entering fullscreen
      interfaceVisibleInFullscreen = false // Start with interface hidden in fullscreen
      await enterFullscreen()
      // Update UI immediately for Tauri
      updateFullscreenState()
      // Save fullscreen state
      savePreference('isFullscreen', isFullscreen)
    }
  } else {
    // Browser fullscreen - state will be updated by event listeners
    if (!isFullscreen) {
      wasFullscreenBefore = isFullscreen
      await enterFullscreen()
    } else {
      if (wasFullscreenBefore) {
        // In browser, we can't toggle menu visibility, so just show a toast
        showFullscreenToast()
        return
      } else {
        await exitFullscreen()
        wasFullscreenBefore = false
        interfaceVisibleInFullscreen = false
        // Save window state after a short delay to capture correct windowed dimensions
        setTimeout(() => {
          saveWindowState()
        }, 500)
      }
    }
  }
}

function updateFullscreenState() {
  const wasFullscreen = isFullscreen

  // Check fullscreen state based on environment
  if (window.__TAURI__) {
    // For Tauri, we need to track this manually since there's no direct API
    // The state will be updated when we call setFullscreen
    // isFullscreen is already set correctly in toggleFullscreen
  } else {
    // Browser fullscreen detection
    isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement)
  }

  const sidebar = document.getElementById('sidebar')
  const sidebarToggle = document.getElementById('sidebarToggle')
  const fullscreenToggle = document.getElementById('fullscreenToggle')
  const mobileFullscreenExit = document.getElementById('mobileFullscreenExit')

  if (isFullscreen) {
    // Hide all UI elements in fullscreen for screensaver experience
    sidebar.style.display = 'none'
    sidebarToggle.style.display = 'none'
    fullscreenToggle.style.display = 'none'

    // Show mobile exit button on touch devices
    mobileFullscreenExit.classList.add('show')

    // Start cursor auto-hide timer when entering fullscreen
    if (!wasFullscreen) {
      resetCursorTimer()
    }

    // Show toast when entering fullscreen
    if (!wasFullscreen) {
      const toast = document.getElementById('fullscreenToast')
      // Check if on mobile device
      const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches
      if (wasFullscreenBefore) {
        toast.textContent = isMobile ? 'Fullscreen mode - Tap ✕ at the top-right of this screen to toggle menu' : 'Fullscreen mode - Press ESC to toggle menu'
      } else {
        toast.textContent = isMobile ? 'Fullscreen mode - Tap ✕ at the top-right of this screen to exit fullscreen' : 'Fullscreen mode - Press ESC to exit fullscreen'
      }
      showFullscreenToast()
    }
  } else {
    // Show all UI elements when exiting fullscreen
    sidebar.style.display = 'flex'
    sidebarToggle.style.display = 'flex'
    fullscreenToggle.style.display = 'flex'
    fullscreenToggle.textContent = '⛶'
    fullscreenToggle.title = 'Toggle Fullscreen'

    // Hide mobile exit button
    mobileFullscreenExit.classList.remove('show')

    // Stop cursor auto-hide and show cursor when exiting fullscreen
    if (wasFullscreen) {
      if (cursorTimeout) {
        clearTimeout(cursorTimeout)
        cursorTimeout = null
      }
      showCursor()
    }

    // Hide toast when exiting fullscreen
    const toast = document.getElementById('fullscreenToast')
    toast.classList.remove('show')
    // Reset toast text to default
    toast.textContent = getMobileMessage('Press ESC to exit fullscreen')
  }
}

// IndexedDB storage for user preferences
let db;
const DB_NAME = 'SpiralPrefs';
const DB_VERSION = 1;
const STORE_NAME = 'preferences';

// Initialize IndexedDB
function initDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onerror = () => console.warn('IndexedDB not available');

  request.onsuccess = (event) => {
    db = event.target.result;
    window.db = db; // Make globally accessible for tutorial system
    loadPreferences();
    // Load window state after a short delay to ensure Tauri APIs are ready
    if (window.__TAURI__) {
      setTimeout(() => {
        loadWindowState();
      }, 200);
    }
  };

  request.onupgradeneeded = (event) => {
    db = event.target.result;
    window.db = db; // Make globally accessible for tutorial system
    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  };
}

// Save preference to IndexedDB
function savePreference(key, value) {
  if (!db) return;

  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const objectStore = transaction.objectStore(STORE_NAME);
  objectStore.put({ id: key, value: value });
}

// Make db and savePreference globally accessible for tutorial system
window.db = null;
window.savePreference = savePreference;

// Save window state (Tauri only)
async function saveWindowState() {
  if (!window.__TAURI__) return;

  try {
    const currentWindow = window.__TAURI__.window.getCurrentWindow();
    const size = await currentWindow.innerSize();
    const position = await currentWindow.innerPosition();
    const isMaximized = await currentWindow.isMaximized();

    // Don't save window dimensions when in fullscreen mode to prevent
    // ultra-wide window issues when exiting fullscreen
    if (!isFullscreen) {
      // Save window dimensions and position only when not in fullscreen
      savePreference('windowWidth', size.width);
      savePreference('windowHeight', size.height);
      savePreference('windowX', position.x);
      savePreference('windowY', position.y);
      savePreference('windowMaximized', isMaximized);

      console.log('Window state saved:', { width: size.width, height: size.height, fullscreen: isFullscreen });
    } else {
      console.log('Skipping window size save (in fullscreen mode)');
    }

    // Always save fullscreen state regardless
    savePreference('isFullscreen', isFullscreen);

  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}

// Load and apply window state (Tauri only)
async function loadWindowState() {
  if (!window.__TAURI__ || !db) {
    console.log('Skipping window state load - Tauri not available or DB not ready');
    return;
  }

  console.log('Loading window state...');

  try {
    const currentWindow = window.__TAURI__.window.getCurrentWindow();

    // Wait a bit more to ensure window is fully ready
    await new Promise(resolve => setTimeout(resolve, 100));

    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    // Helper function to get values from IndexedDB
    const getValue = (key) => new Promise(resolve => {
      const request = objectStore.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => resolve(null);
    });

    // Load all window state values
    const [width, height, x, y, maximized, fullscreen] = await Promise.all([
      getValue('windowWidth'),
      getValue('windowHeight'),
      getValue('windowX'),
      getValue('windowY'),
      getValue('windowMaximized'),
      getValue('isFullscreen')
    ]);

    console.log('Loaded window state:', { width, height, x, y, maximized, fullscreen });

    // Apply window size if saved
    if (width && height && width > 200 && height > 200) {
      // Add additional validation to prevent ultra-wide windows
      const maxReasonableWidth = 3840; // 4K width
      const maxReasonableHeight = 2160; // 4K height

      if (width <= maxReasonableWidth && height <= maxReasonableHeight) {
        try {
          await currentWindow.setSize(new window.__TAURI__.window.LogicalSize(width, height));
          console.log('✅ Window size restored:', width, 'x', height);
        } catch (error) {
          console.error('❌ Failed to restore window size:', error);
        }
      } else {
        console.log('❌ Saved window size too large, skipping restore:', width, 'x', height);
        // Clear the invalid saved dimensions
        savePreference('windowWidth', null);
        savePreference('windowHeight', null);
      }
    } else {
      console.log('❌ No valid window size to restore');
    }

    // Apply window position if saved (validate it's reasonable)
    if (x !== null && y !== null && x >= -1000 && y >= -1000) {
      try {
        await currentWindow.setPosition(new window.__TAURI__.window.LogicalPosition(x, y));
        console.log('✅ Window position restored:', x, ',', y);
      } catch (error) {
        console.error('❌ Failed to restore window position:', error);
      }
    } else {
      console.log('❌ No valid window position to restore');
    }

    // Apply maximized state if saved
    if (maximized) {
      try {
        await currentWindow.maximize();
        console.log('✅ Window maximized state restored');
      } catch (error) {
        console.error('❌ Failed to restore maximized state:', error);
      }
    }

    // Apply fullscreen state if saved (with additional delay and better handling)
    if (fullscreen) {
      setTimeout(async () => {
        try {
          console.log('⚠️  Restoring fullscreen state...');
          // DISABLE fullscreen restoration during development - set to true to enable
          const shouldRestoreFullscreen = false; // Change to true when you want fullscreen restored

          if (shouldRestoreFullscreen) {
            // When restoring fullscreen, mark it as "was fullscreen before"
            wasFullscreenBefore = true
            isFullscreen = true
            menuVisible = true
            interfaceVisibleInFullscreen = false // Start with interface hidden
            await currentWindow.setFullscreen(true);
            updateFullscreenState();
            console.log('✅ Fullscreen state restored (marked as was fullscreen before)');
          } else {
            console.log('⏭️  Skipping fullscreen restoration (disabled for development)');
            // Clear the saved fullscreen state so it doesn't keep trying
            isFullscreen = false
            wasFullscreenBefore = false
            interfaceVisibleInFullscreen = false
            savePreference('isFullscreen', false);
          }
        } catch (error) {
          console.error('❌ Failed to restore fullscreen state:', error);
          // If fullscreen restoration fails, clear the saved state
          isFullscreen = false
          wasFullscreenBefore = false
          interfaceVisibleInFullscreen = false
          savePreference('isFullscreen', false);
        }
      }, 300);
    }

  } catch (error) {
    console.error('❌ Failed to load window state:', error);
  }
}

// Load all preferences from IndexedDB
function loadPreferences() {
  if (!db) return;

  const transaction = db.transaction([STORE_NAME], 'readonly');
  const objectStore = transaction.objectStore(STORE_NAME);

  // Load sidebar state
  objectStore.get('sidebarCollapsed').onsuccess = (event) => {
    if (event.target.result) {
      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('sidebarToggle');
      if (event.target.result.value) {
        sidebar.classList.add('collapsed');
        updateButtonText(toggle, '☰');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        // Sidebar is open, so show close icon
        updateButtonText(toggle, '✕');
        toggle.setAttribute('aria-expanded', 'true');
      }
    } else {
      // No saved state, sidebar is open by default, show close icon
      const toggle = document.getElementById('sidebarToggle');
      updateButtonText(toggle, '✕');
      toggle.setAttribute('aria-expanded', 'true');
    }
  };

  // Load spiral coefficient
  objectStore.get('spiralCoeff').onsuccess = (event) => {
    if (event.target.result && event.target.result.value !== undefined) {
      const loadedValue = parseFloat(event.target.result.value);
      // Validate the loaded value
      if (!isNaN(loadedValue) && isFinite(loadedValue) && loadedValue > 0) {
        spiralCoeff = loadedValue;
        document.getElementById('spiralSlider').value = spiralCoeff;
        document.getElementById('spiralNumber').value = spiralCoeff;
        computePoints();
      } else {
        // Invalid value, reset to default
        console.warn('Invalid spiralCoeff value loaded, resetting to default (2)');
        spiralCoeff = 2;
        document.getElementById('spiralSlider').value = spiralCoeff;
        document.getElementById('spiralNumber').value = spiralCoeff;
        savePreference('spiralCoeff', spiralCoeff);
        computePoints();
      }
    }
  };

  // Load maxN
  objectStore.get('maxN').onsuccess = (event) => {
    if (event.target.result) {
      maxN = event.target.result.value;
      document.getElementById('maxNSlider').value = maxN;
      document.getElementById('maxNNumber').value = maxN;
      computePoints();
    }
  };

  // Load cluster count
  objectStore.get('clusterCount').onsuccess = (event) => {
    if (event.target.result) {
      clusterCount = event.target.result.value;
      document.getElementById('clusterCountSlider').value = clusterCount;
      document.getElementById('clusterCountNumber').value = clusterCount;
      initClusters();
    }
  };

  // Load show primes
  objectStore.get('showPrimes').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      showPrimes = event.target.result.value;
      const primeToggle = document.getElementById('primeToggle');
      primeToggle.classList.toggle('active', showPrimes);
      primeToggle.setAttribute('aria-checked', showPrimes.toString());
      updateButtonText(primeToggle, showPrimes ? 'Defocus Prime Numbers' : 'Focus Prime Numbers');
    }
  };

  // Load show clusters
  objectStore.get('showClusters').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      showClusters = event.target.result.value;
      const clusterToggle = document.getElementById('clusterToggle');
      clusterToggle.classList.toggle('active', showClusters);
      clusterToggle.setAttribute('aria-checked', showClusters.toString());
      updateButtonText(clusterToggle, showClusters ? 'Stop Animation' : 'Start Animation');
    }
  };

  // Load show rotation
  objectStore.get('showRotation').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      showRotation = event.target.result.value;
      const rotationToggle = document.getElementById('rotationToggle');
      rotationToggle.classList.toggle('active', showRotation);
      rotationToggle.setAttribute('aria-checked', showRotation.toString());
      updateButtonText(rotationToggle, showRotation ? 'Stop Rotation' : 'Start Rotation');
    }
  };

  // Load rotation speed
  objectStore.get('rotationSpeed').onsuccess = (event) => {
    if (event.target.result) {
      rotationSpeed = event.target.result.value;
      document.getElementById('rotationSpeedSlider').value = rotationSpeed;
      document.getElementById('rotationSpeedNumber').value = rotationSpeed;
    }
  };

  // Load shape preference
  objectStore.get('useSquares').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      useSquares = event.target.result.value;
      const shapeToggle = document.getElementById('shapeToggle');
      shapeToggle.classList.toggle('active', useSquares);
      shapeToggle.setAttribute('aria-checked', useSquares.toString());
      updateButtonText(shapeToggle, useSquares ? 'Use Circles' : 'Use Squares');
    }
  };

  // Load instant render preference
  objectStore.get('instantRender').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      instantRender = event.target.result.value;
      const instantRenderToggle = document.getElementById('instantRenderToggle');
      instantRenderToggle.classList.toggle('active', instantRender);
      instantRenderToggle.setAttribute('aria-checked', instantRender.toString());
      updateButtonText(instantRenderToggle, instantRender ? 'Disable Instant Render' : 'Enable Instant Render');
    }
  };

  // Load dot size
  objectStore.get('dotSize').onsuccess = (event) => {
    if (event.target.result) {
      dotSize = event.target.result.value;
      document.getElementById('dotSizeSlider').value = dotSize;
      document.getElementById('dotSizeNumber').value = dotSize;
    }
  };

  // Load prime size
  objectStore.get('primeSize').onsuccess = (event) => {
    if (event.target.result) {
      primeSize = event.target.result.value;
      document.getElementById('primeSizeSlider').value = primeSize;
      document.getElementById('primeSizeNumber').value = primeSize;
    }
  };

  // Load scale
  objectStore.get('scale').onsuccess = (event) => {
    if (event.target.result) {
      scale = event.target.result.value;
      computePoints();
    }
  };

  // Load spiral animation preference
  objectStore.get('animateSpiralCoeff').onsuccess = (event) => {
    if (event.target.result !== undefined) {
      animateSpiralCoeff = event.target.result.value;
      const spiralAnimationToggle = document.getElementById('spiralAnimationToggle');
      spiralAnimationToggle.classList.toggle('active', animateSpiralCoeff);
      spiralAnimationToggle.setAttribute('aria-checked', animateSpiralCoeff.toString());
      updateButtonText(spiralAnimationToggle, animateSpiralCoeff ? 'Stop Spiral Animation' : 'Animate Spiral Coefficient');

      // Show/hide controls based on saved state
      const controls = document.getElementById('spiralAnimationControls');
      controls.style.display = animateSpiralCoeff ? 'block' : 'none';

      if (animateSpiralCoeff) {
        startSpiralCoeffAnimation();
      }
    }
  };

  // Load spiral animation speed
  objectStore.get('spiralAnimationSpeed').onsuccess = (event) => {
    if (event.target.result && event.target.result.value !== undefined) {
      const loadedValue = parseInt(event.target.result.value);
      if (!isNaN(loadedValue) && isFinite(loadedValue) && loadedValue >= 10 && loadedValue <= 2000) {
        spiralAnimationSpeed = loadedValue;
        document.getElementById('spiralAnimationSpeedSlider').value = spiralAnimationSpeed;
        document.getElementById('spiralAnimationSpeedNumber').value = spiralAnimationSpeed;
      } else {
        console.warn('Invalid spiralAnimationSpeed value, using default (100)');
        spiralAnimationSpeed = 100;
      }
    }
  };

  // Load spiral animation increment
  objectStore.get('spiralAnimationIncrement').onsuccess = (event) => {
    if (event.target.result && event.target.result.value !== undefined) {
      const loadedValue = parseFloat(event.target.result.value);
      if (!isNaN(loadedValue) && isFinite(loadedValue) && loadedValue > 0 && loadedValue <= 10) {
        spiralAnimationIncrement = loadedValue;
        document.getElementById('spiralAnimationIncrementSlider').value = spiralAnimationIncrement;
        document.getElementById('spiralAnimationIncrementNumber').value = spiralAnimationIncrement;
      } else {
        console.warn('Invalid spiralAnimationIncrement value, using default (0.1)');
        spiralAnimationIncrement = 0.1;
      }
    }
  };

  // Load spiral animation min
  objectStore.get('spiralAnimationMin').onsuccess = (event) => {
    if (event.target.result && event.target.result.value !== undefined) {
      const loadedValue = parseFloat(event.target.result.value);
      if (!isNaN(loadedValue) && isFinite(loadedValue) && loadedValue > 0) {
        spiralAnimationMin = loadedValue;
        document.getElementById('spiralAnimationMinSlider').value = spiralAnimationMin;
        document.getElementById('spiralAnimationMinNumber').value = spiralAnimationMin;
      } else {
        console.warn('Invalid spiralAnimationMin value, using default (1)');
        spiralAnimationMin = 1;
      }
    }
  };

  // Load spiral animation max
  objectStore.get('spiralAnimationMax').onsuccess = (event) => {
    if (event.target.result && event.target.result.value !== undefined) {
      const loadedValue = parseFloat(event.target.result.value);
      if (!isNaN(loadedValue) && isFinite(loadedValue) && loadedValue > spiralAnimationMin) {
        spiralAnimationMax = loadedValue;
        document.getElementById('spiralAnimationMaxSlider').value = spiralAnimationMax;
        document.getElementById('spiralAnimationMaxNumber').value = spiralAnimationMax;
      } else {
        console.warn('Invalid spiralAnimationMax value, using default (500)');
        spiralAnimationMax = 500;
      }
    }
  };
}

// Prime number checking function with memoization
const primeCache = new Map();
function isPrime(n) {
  if (primeCache.has(n)) return primeCache.get(n);

  if (n < 2) {
    primeCache.set(n, false);
    return false;
  }
  if (n === 2) {
    primeCache.set(n, true);
    return true;
  }
  if (n % 2 === 0) {
    primeCache.set(n, false);
    return false;
  }

  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) {
      primeCache.set(n, false);
      return false;
    }
  }

  primeCache.set(n, true);
  return true;
}

function resize() {
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  computePoints()
  initClusters()
}

function computePoints() {
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2
  points = []

  // Cancel any ongoing computation
  if (window.currentComputationId) {
    cancelIdleCallback(window.currentComputationId)
    window.currentComputationId = null
  }

  // Performance safety: limit computation for very large values
  const effectiveMaxN = Math.min(maxN, 2000000) // Hard cap at 2M points

  // Calculate diagonal to ensure rotated content covers entire screen
  const diagonal = Math.sqrt(W * W + H * H)
  const margin = diagonal / 2

  if (instantRender) {
    // Instant computation - compute all points immediately without chunking
    for (let n = 1; n <= effectiveMaxN; n++) {
      const r = Math.sqrt(n) * scale
      const θ = spiralCoeff * Math.PI * Math.sqrt(n)
      const x = cx + r * Math.cos(θ)
      const y = cy + r * Math.sin(θ)

      // Use expanded bounds when rotation is enabled to prevent clipping
      const bounds = showRotation ? margin : 0
      if (x < -bounds || x > W + bounds || y < -bounds || y > H + bounds) continue

      points.push({x, y, n, isPrime: isPrime(n)})
    }

    if (maxN > effectiveMaxN) {
      console.warn(`Capped point calculation at ${effectiveMaxN} for performance`)
    }
  } else {
    // Progressive computation with chunking for animation effect
    const chunkSize = 1000;
    let currentN = 1;

    function computeChunk() {
      const endN = Math.min(currentN + chunkSize, effectiveMaxN);

      for (let n = currentN; n <= endN; n++) {
        const r = Math.sqrt(n) * scale
        const θ = spiralCoeff * Math.PI * Math.sqrt(n)
        const x = cx + r * Math.cos(θ)
        const y = cy + r * Math.sin(θ)

        // Use expanded bounds when rotation is enabled to prevent clipping
        const bounds = showRotation ? margin : 0
        if (x < -bounds || x > W + bounds || y < -bounds || y > H + bounds) continue

        points.push({x, y, n, isPrime: isPrime(n)})
      }

      currentN = endN + 1;

      if (currentN <= effectiveMaxN) {
        // Continue with next chunk on next frame
        window.currentComputationId = requestIdleCallback(computeChunk, { timeout: 50 });
      } else {
        // Computation complete
        window.currentComputationId = null
        if (maxN > effectiveMaxN) {
          console.warn(`Capped point calculation at ${effectiveMaxN} for performance`)
        }
      }
    }

    // Schedule the first chunk
    window.currentComputationId = requestIdleCallback(computeChunk, { timeout: 50 });
  }

  // Update canvas description for screen readers
  updateCanvasDescription()
}

function initClusters() {
  clusters.length = 0
  const W = canvas.width, H = canvas.height

  // Performance safety: limit clusters for very large values
  const effectiveClusterCount = Math.min(clusterCount, 1000) // Hard cap at 1000 clusters

  for (let i = 0; i < effectiveClusterCount; i++) {
    const x = Math.random()*W
    const y = Math.random()*H
    clusters.push({
      x, y,
      targetX: Math.random()*W,
      targetY: Math.random()*H,
      speed: 2 + Math.random()*1.0  // px per frame
    })
  }

  if (clusterCount > effectiveClusterCount) {
    console.warn(`Capped cluster count at ${effectiveClusterCount} for performance`)
  }
}

function updateClusters() {
  const W = canvas.width, H = canvas.height
  clusters.forEach(c => {
    const dx = c.targetX - c.x
    const dy = c.targetY - c.y
    const d  = Math.hypot(dx, dy)
    if (d < c.speed) {
      // reached target → pick a new one
      c.targetX = Math.random() * W
      c.targetY = Math.random() * H
    } else {
      // move toward target
      c.x += (dx / d) * c.speed
      c.y += (dy / d) * c.speed
    }
  })
}

function drawFrame() {
  if (showClusters) {
    updateClusters()
  }

  // Update rotation if enabled
  if (showRotation) {
    currentRotation += rotationSpeed * 0.01 // Convert to radians per frame
  }

  // fading trail
  ctx.fillStyle = `rgba(0,0,0,${trailAlpha})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Save canvas state for rotation
  ctx.save()

  // Apply rotation to the entire canvas
  if (showRotation) {
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(currentRotation)
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
  }

  // Batch drawing operations for better performance
  // Dynamic render batch size based on instant render setting and performance needs
  let renderBatchSize;
  if (instantRender) {
    renderBatchSize = points.length; // Render all points instantly when enabled
  } else {
    // Progressive rendering for the nice animation effect
    if (points.length <= 10000) {
      renderBatchSize = points.length; // Render all points for smaller datasets
    } else if (points.length <= 50000) {
      renderBatchSize = Math.min(points.length, 2000); // Medium batch size
    } else {
      renderBatchSize = Math.min(points.length, 5000); // Larger batch size for big datasets
    }
  }

  let currentColor = '';

  // Group points by color and shape to reduce state changes
  const primePoints = [];
  const normalPoints = [];

  for (let i = 0; i < renderBatchSize; i++) {
    const p = points[i % points.length];

    let factor = 0;
    if (showClusters) {
      for (const c of clusters) {
        const dx = p.x - c.x, dy = p.y - c.y;
        if (Math.abs(dx) < clusterRadius && Math.abs(dy) < clusterRadius) {
          const fx = 1 - Math.abs(dx) / clusterRadius;
          const fy = 1 - Math.abs(dy) / clusterRadius;
          const squareFalloff = Math.min(fx, fy);
          factor = Math.max(factor, squareFalloff);
        }
      }
    }

    // Calculate size based on base size, prime multiplier, and cluster effect
    let baseSize = dotSize;
    if (showPrimes && p.isPrime) {
      baseSize *= primeSize;
    }
    const size = baseSize + factor * sizeBoost;
    const offsetY = -factor * liftHeight;

    const pointData = { ...p, size, offsetY };

    if (showPrimes && p.isPrime) {
      primePoints.push(pointData);
    } else {
      normalPoints.push(pointData);
    }
  }

  // Draw normal points in batch
  if (normalPoints.length > 0) {
    ctx.fillStyle = '#009900';
    normalPoints.forEach(p => {
      if (useSquares) {
        ctx.fillRect(p.x - p.size/2, p.y + p.offsetY - p.size/2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.offsetY, p.size/2, 0, 2*Math.PI);
        ctx.fill();
      }
    });
  }

  // Draw prime points in batch
  if (primePoints.length > 0) {
    ctx.fillStyle = '#00ff00';
    primePoints.forEach(p => {
      if (useSquares) {
        ctx.fillRect(p.x - p.size/2, p.y + p.offsetY - p.size/2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.offsetY, p.size/2, 0, 2*Math.PI);
        ctx.fill();
      }
    });
  }

  // Restore canvas state
  ctx.restore()

  requestAnimationFrame(drawFrame)
}

// scroll-to-zoom with debouncing
function scrollClamp(v,min,max){ return Math.max(min, Math.min(max, v)) }
const debouncedSaveScale = debounce((scale) => savePreference('scale', scale), 200);

window.addEventListener('wheel', e => {
  e.preventDefault()
  const vel = scale * (e.deltaY>0 ? 1.10 : 0.90)
  console.log('velocity:', vel)
  scale = scrollClamp(vel, 2, 200)
  debouncedSaveScale(scale)

  // Use instant computation if instant render is enabled, otherwise debounce
  if (instantRender) {
    computePoints()
  } else {
    debouncedComputePoints()
  }
}, { passive: false })

// Prevent canvas zoom when scrolling over sidebar
const sidebarElement = document.getElementById('sidebar')
sidebarElement.addEventListener('wheel', e => {
  // Stop wheel events from propagating to the window listener
  e.stopPropagation()
}, { passive: true })

// Fullscreen toggle functionality
const fullscreenToggle = document.getElementById('fullscreenToggle')
fullscreenToggle.addEventListener('click', toggleFullscreen)

// Mobile fullscreen exit button functionality
const mobileFullscreenExit = document.getElementById('mobileFullscreenExit')
mobileFullscreenExit.addEventListener('click', () => {
  // Same logic as ESC key for exiting fullscreen
  if (isFullscreen) {
    if (window.__TAURI__) {
      if (wasFullscreenBefore) {
        // Window was fullscreen before, toggle interface visibility instead of exiting fullscreen
        if (interfaceVisibleInFullscreen) {
          hideInterfaceInFullscreen()
          interfaceVisibleInFullscreen = false
        } else {
          showInterfaceInFullscreen()
          interfaceVisibleInFullscreen = true
        }
      } else {
        // Window was not fullscreen before, exit fullscreen
        isFullscreen = false
        wasFullscreenBefore = false
        menuVisible = true
        interfaceVisibleInFullscreen = false
        exitFullscreen()
        updateFullscreenState()
        savePreference('isFullscreen', isFullscreen)
        setTimeout(() => {
          saveWindowState()
        }, 500)
      }
    } else {
      // Browser behavior
      if (wasFullscreenBefore) {
        // In browser, show interface if hidden, hide if shown
        if (interfaceVisibleInFullscreen) {
          hideInterfaceInFullscreen()
          interfaceVisibleInFullscreen = false
        } else {
          showInterfaceInFullscreen()
          interfaceVisibleInFullscreen = true
        }
      } else {
        isFullscreen = false
        exitFullscreen()
        updateFullscreenState()
        wasFullscreenBefore = false
        interfaceVisibleInFullscreen = false
        setTimeout(() => {
          saveWindowState()
        }, 500)
      }
    }
  }
})

// Add touch event handling for better mobile support
mobileFullscreenExit.addEventListener('touchstart', (e) => {
  e.preventDefault()
}, { passive: false })

mobileFullscreenExit.addEventListener('touchend', (e) => {
  e.preventDefault()
  mobileFullscreenExit.click()
}, { passive: false })

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', updateFullscreenState)
document.addEventListener('webkitfullscreenchange', updateFullscreenState)
document.addEventListener('msfullscreenchange', updateFullscreenState)

// Canvas click to show toast in fullscreen
canvas.addEventListener('click', () => {
  if (isFullscreen) {
    showFullscreenToast()
  }
})

// Sidebar toggle functionality
const sidebar = document.getElementById('sidebar')
const sidebarToggle = document.getElementById('sidebarToggle')

sidebarToggle.addEventListener('click', () => {
  const isCollapsed = sidebar.classList.toggle('collapsed')
  const fullscreenToggle = document.getElementById('fullscreenToggle')
  updateButtonText(sidebarToggle, isCollapsed ? '☰' : '✕')
  sidebarToggle.setAttribute('aria-expanded', (!isCollapsed).toString())
  savePreference('sidebarCollapsed', isCollapsed)

  // On larger screens, completely hide sidebar and toggle button when collapsed
  if (window.innerWidth >= 768) {
    if (isCollapsed) {
      // Completely hide sidebar and toggle button
      sidebar.style.display = 'none'
      sidebarToggle.style.display = 'none'
      fullscreenToggle.style.display = 'none'

      // Show toast notification
      const toast = document.getElementById('fullscreenToast')
      toast.textContent = getMobileMessage('Sidebar hidden - Press S to reopen')
      toast.classList.add('show')

      // Clear existing timeout
      if (toastTimeout) {
        clearTimeout(toastTimeout)
      }

      // Hide toast after 3 seconds
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show')
        // Reset toast text to default
        toast.textContent = getMobileMessage('Press ESC to exit fullscreen')
      }, 3000)
    } else {
      // Show sidebar and toggle button
      sidebar.style.display = 'flex'
      sidebarToggle.style.display = 'flex'
      fullscreenToggle.style.display = 'flex'
    }
  }
})

// Prime toggle functionality
const primeToggle = document.getElementById('primeToggle')
primeToggle.addEventListener('click', () => {
  showPrimes = !showPrimes
  primeToggle.classList.toggle('active', showPrimes)
  primeToggle.setAttribute('aria-checked', showPrimes.toString())

  // Preserve tooltip elements when updating text
  const newText = showPrimes ? 'Defocus Prime Numbers' : 'Focus Prime Numbers'
  updateButtonText(primeToggle, newText)

  // Announce change to screen readers
  announceToScreenReader(`Prime number highlighting ${showPrimes ? 'enabled' : 'disabled'}`)

  savePreference('showPrimes', showPrimes)
})

// Cluster toggle functionality
const clusterToggle = document.getElementById('clusterToggle')
clusterToggle.addEventListener('click', () => {
  showClusters = !showClusters
  clusterToggle.classList.toggle('active', showClusters)
  clusterToggle.setAttribute('aria-checked', showClusters.toString())

  // Preserve tooltip elements when updating text
  const newText = showClusters ? 'Stop Animation' : 'Start Animation'
  updateButtonText(clusterToggle, newText)

  savePreference('showClusters', showClusters)
})

// Rotation toggle functionality
const rotationToggle = document.getElementById('rotationToggle')
rotationToggle.addEventListener('click', () => {
  showRotation = !showRotation
  rotationToggle.classList.toggle('active', showRotation)
  rotationToggle.setAttribute('aria-checked', showRotation.toString())

  // Preserve tooltip elements when updating text
  const newText = showRotation ? 'Stop Rotation' : 'Start Rotation'
  updateButtonText(rotationToggle, newText)

  // Announce change to screen readers
  announceToScreenReader(`Spiral rotation ${showRotation ? 'started' : 'stopped'}`)

  savePreference('showRotation', showRotation)
  // Recompute points when rotation state changes to adjust clipping bounds
  computePoints()
})

// Shape toggle functionality
const shapeToggle = document.getElementById('shapeToggle')
shapeToggle.addEventListener('click', () => {
  useSquares = !useSquares
  shapeToggle.classList.toggle('active', useSquares)
  shapeToggle.setAttribute('aria-checked', useSquares.toString())

  // Preserve tooltip elements when updating text
  const newText = useSquares ? 'Use Circles' : 'Use Squares'
  updateButtonText(shapeToggle, newText)

  savePreference('useSquares', useSquares)
})

// Instant render toggle functionality
const instantRenderToggle = document.getElementById('instantRenderToggle')
instantRenderToggle.addEventListener('click', () => {
  instantRender = !instantRender
  instantRenderToggle.classList.toggle('active', instantRender)
  instantRenderToggle.setAttribute('aria-checked', instantRender.toString())

  // Preserve tooltip elements when updating text
  const newText = instantRender ? 'Disable Instant Render' : 'Enable Instant Render'
  updateButtonText(instantRenderToggle, newText)

  savePreference('instantRender', instantRender)
})

// Spiral coefficient animation logic
function startSpiralCoeffAnimation() {
  if (spiralAnimationInterval) return; // Already animating

  spiralAnimationInterval = setInterval(() => {
    // Validate all animation parameters before using them
    if (isNaN(spiralCoeff) || !isFinite(spiralCoeff)) {
      spiralCoeff = 2; // Reset to default
    }
    if (isNaN(spiralAnimationIncrement) || !isFinite(spiralAnimationIncrement) || spiralAnimationIncrement <= 0) {
      spiralAnimationIncrement = 0.1; // Reset to default
    }
    if (isNaN(spiralAnimationMin) || !isFinite(spiralAnimationMin) || spiralAnimationMin <= 0) {
      spiralAnimationMin = 1; // Reset to default
    }
    if (isNaN(spiralAnimationMax) || !isFinite(spiralAnimationMax) || spiralAnimationMax <= spiralAnimationMin) {
      spiralAnimationMax = 500; // Reset to default
    }

    // Calculate new value
    const newValue = spiralCoeff + (spiralAnimationIncrement * spiralAnimationDirection);

    // Validate the new value before assigning
    if (isNaN(newValue) || !isFinite(newValue)) {
      console.warn('Invalid spiral coefficient calculated, resetting to safe value');
      spiralCoeff = clamp(2, spiralAnimationMin, spiralAnimationMax);
    } else {
      spiralCoeff = newValue;
    }

    // Reverse direction if out of bounds
    if (spiralCoeff <= spiralAnimationMin || spiralCoeff >= spiralAnimationMax) {
      spiralAnimationDirection *= -1;
      // Clamp to bounds to prevent going beyond
      spiralCoeff = clamp(spiralCoeff, spiralAnimationMin, spiralAnimationMax);
    }

    // Update UI with validated value
    document.getElementById('spiralSlider').value = spiralCoeff;
    document.getElementById('spiralNumber').value = spiralCoeff;

    // Save preference
    savePreference('spiralCoeff', spiralCoeff);

    // Recompute points
    computePoints();
  }, spiralAnimationSpeed);
}

function stopSpiralCoeffAnimation() {
  if (spiralAnimationInterval) {
    clearInterval(spiralAnimationInterval);
    spiralAnimationInterval = null;
  }
}

// Toggle spiral coefficient animation
const spiralAnimationToggle = document.getElementById('spiralAnimationToggle');
spiralAnimationToggle.addEventListener('click', () => {
  animateSpiralCoeff = !animateSpiralCoeff;
  spiralAnimationToggle.classList.toggle('active', animateSpiralCoeff);
  spiralAnimationToggle.setAttribute('aria-checked', animateSpiralCoeff.toString());
  updateButtonText(spiralAnimationToggle, animateSpiralCoeff ? 'Stop Spiral Animation' : 'Animate Spiral Coefficient');

  // Show/hide the animation controls
  const controls = document.getElementById('spiralAnimationControls');
  controls.style.display = animateSpiralCoeff ? 'block' : 'none';

  if (animateSpiralCoeff) {
    startSpiralCoeffAnimation();
  } else {
    stopSpiralCoeffAnimation();
  }

  savePreference('animateSpiralCoeff', animateSpiralCoeff);
});

// Update spiral coefficient animation speed
const spiralAnimationSpeedSlider = document.getElementById('spiralAnimationSpeedSlider');
const spiralAnimationSpeedNumber = document.getElementById('spiralAnimationSpeedNumber');

spiralAnimationSpeedSlider.addEventListener('input', (e) => {
  spiralAnimationSpeed = parseInt(e.target.value);
  spiralAnimationSpeedNumber.value = spiralAnimationSpeed;
  savePreference('spiralAnimationSpeed', spiralAnimationSpeed);

  // Restart animation with new speed
  if (animateSpiralCoeff) {
    stopSpiralCoeffAnimation();
    startSpiralCoeffAnimation();
  }
});

spiralAnimationSpeedNumber.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  if (value >= 50 && value <= 500 && !isNaN(value)) {
    spiralAnimationSpeed = value;
    // Only update slider if value is within slider range
    if (value >= 100 && value <= 500) {
      spiralAnimationSpeedSlider.value = spiralAnimationSpeed;
    }
    savePreference('spiralAnimationSpeed', spiralAnimationSpeed);

    // Restart animation with new speed
    if (animateSpiralCoeff) {
      stopSpiralCoeffAnimation();
      startSpiralCoeffAnimation();
    }
  }
});

// Spiral animation increment controls
const spiralAnimationIncrementSlider = document.getElementById('spiralAnimationIncrementSlider');
const spiralAnimationIncrementNumber = document.getElementById('spiralAnimationIncrementNumber');

spiralAnimationIncrementSlider.addEventListener('input', (e) => {
  spiralAnimationIncrement = parseFloat(e.target.value);
  spiralAnimationIncrementNumber.value = spiralAnimationIncrement;
  savePreference('spiralAnimationIncrement', spiralAnimationIncrement);
});

spiralAnimationIncrementNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  if (value >= 0.01 && value <= 10.0 && !isNaN(value)) {
    spiralAnimationIncrement = value;
    // Only update slider if value is within slider range
    if (value >= 0.01 && value <= 2.0) {
      spiralAnimationIncrementSlider.value = spiralAnimationIncrement;
    }
    savePreference('spiralAnimationIncrement', spiralAnimationIncrement);
  }
});

// Spiral animation min range controls
const spiralAnimationMinSlider = document.getElementById('spiralAnimationMinSlider');
const spiralAnimationMinNumber = document.getElementById('spiralAnimationMinNumber');

spiralAnimationMinSlider.addEventListener('input', (e) => {
  spiralAnimationMin = parseFloat(e.target.value);
  spiralAnimationMinNumber.value = spiralAnimationMin;
  savePreference('spiralAnimationMin', spiralAnimationMin);

  // Ensure min is less than max
  if (spiralAnimationMin >= spiralAnimationMax) {
    spiralAnimationMax = spiralAnimationMin + 10;
    document.getElementById('spiralAnimationMaxSlider').value = spiralAnimationMax;
    document.getElementById('spiralAnimationMaxNumber').value = spiralAnimationMax;
    savePreference('spiralAnimationMax', spiralAnimationMax);
  }
});

spiralAnimationMinNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  if (value >= 0.1 && value <= 1000 && !isNaN(value)) {
    spiralAnimationMin = value;
    // Only update slider if value is within slider range
    if (value >= 0.1 && value <= 100) {
      spiralAnimationMinSlider.value = spiralAnimationMin;
    }
    savePreference('spiralAnimationMin', spiralAnimationMin);

    // Ensure min is less than max
    if (spiralAnimationMin >= spiralAnimationMax) {
      spiralAnimationMax = spiralAnimationMin + 10;
      document.getElementById('spiralAnimationMaxSlider').value = spiralAnimationMax;
      document.getElementById('spiralAnimationMaxNumber').value = spiralAnimationMax;
      savePreference('spiralAnimationMax', spiralAnimationMax);
    }
  }
});

// Spiral animation max range controls
const spiralAnimationMaxSlider = document.getElementById('spiralAnimationMaxSlider');
const spiralAnimationMaxNumber = document.getElementById('spiralAnimationMaxNumber');

spiralAnimationMaxSlider.addEventListener('input', (e) => {
  spiralAnimationMax = parseFloat(e.target.value);
  spiralAnimationMaxNumber.value = spiralAnimationMax;
  savePreference('spiralAnimationMax', spiralAnimationMax);

  // Ensure max is greater than min
  if (spiralAnimationMax <= spiralAnimationMin) {
    spiralAnimationMin = Math.max(0.1, spiralAnimationMax - 10);
    document.getElementById('spiralAnimationMinSlider').value = spiralAnimationMin;
    document.getElementById('spiralAnimationMinNumber').value = spiralAnimationMin;
    savePreference('spiralAnimationMin', spiralAnimationMin);
  }
});

spiralAnimationMaxNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  if (value >= 10 && value <= 2000 && !isNaN(value)) {
    spiralAnimationMax = value;
    // Only update slider if value is within slider range
    if (value >= 10 && value <= 1000) {
      spiralAnimationMaxSlider.value = spiralAnimationMax;
    }
    savePreference('spiralAnimationMax', spiralAnimationMax);

    // Ensure max is greater than min
    if (spiralAnimationMax <= spiralAnimationMin) {
      spiralAnimationMin = Math.max(0.1, spiralAnimationMax - 10);
      document.getElementById('spiralAnimationMinSlider').value = spiralAnimationMin;
      document.getElementById('spiralAnimationMinNumber').value = spiralAnimationMin;
      savePreference('spiralAnimationMin', spiralAnimationMin);
    }
  }
});

// Clamp function for value mapping
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Update spiral coefficient bounds based on UI inputs
function updateSpiralCoeffBounds() {
  const minInput = document.getElementById('spiralAnimationMinNumber');
  const maxInput = document.getElementById('spiralAnimationMaxNumber');

  const newMin = parseFloat(minInput.value);
  const newMax = parseFloat(maxInput.value);

  // Validate the new values
  if (!isNaN(newMin) && isFinite(newMin) && newMin > 0) {
    spiralAnimationMin = newMin;
  } else {
    spiralAnimationMin = 1; // Default fallback
    minInput.value = spiralAnimationMin;
  }

  if (!isNaN(newMax) && isFinite(newMax) && newMax > spiralAnimationMin) {
    spiralAnimationMax = newMax;
  } else {
    spiralAnimationMax = Math.max(500, spiralAnimationMin + 10); // Default fallback
    maxInput.value = spiralAnimationMax;
  }

  // Validate current spiralCoeff and clamp it to new bounds
  if (isNaN(spiralCoeff) || !isFinite(spiralCoeff)) {
    spiralCoeff = 2; // Reset to default if invalid
  }
  spiralCoeff = clamp(spiralCoeff, spiralAnimationMin, spiralAnimationMax);

  // Update UI with validated values
  document.getElementById('spiralSlider').value = spiralCoeff;
  document.getElementById('spiralNumber').value = spiralCoeff;

  // Save preferences
  savePreference('spiralCoeff', spiralCoeff);
  savePreference('spiralAnimationMin', spiralAnimationMin);
  savePreference('spiralAnimationMax', spiralAnimationMax);
}

// Initialize spiral coefficient bounds from preferences
function initSpiralCoeffBounds() {
  const minInput = document.getElementById('spiralAnimationMinNumber');
  const maxInput = document.getElementById('spiralAnimationMaxNumber');

  // Load from preferences or use defaults
  minInput.value = spiralAnimationMin = parseFloat(getPreference('spiralAnimationMin', 1));
  maxInput.value = spiralAnimationMax = parseFloat(getPreference('spiralAnimationMax', 500));

  // Update UI
  updateSpiralCoeffBounds();
}

// Load preference helper function
function getPreference(key, defaultValue) {
  if (!db) return defaultValue;

  const transaction = db.transaction([STORE_NAME], 'readonly');
  const objectStore = transaction.objectStore(STORE_NAME);

  return new Promise((resolve) => {
    const request = objectStore.get(key);
    request.onsuccess = () => resolve(request.result?.value || defaultValue);
    request.onerror = () => resolve(defaultValue);
  });
}

// On load, initialize spiral coefficient bounds from preferences
window.addEventListener('load', () => {
  initSpiralCoeffBounds();
});

// Debounce function to reduce excessive computations
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounced computation functions
const debouncedComputePoints = debounce(computePoints, 100);
const debouncedInitClusters = debounce(initClusters, 100);

// Spiral coefficient slider functionality
const spiralSlider = document.getElementById('spiralSlider')
const spiralNumber = document.getElementById('spiralNumber')

// Debounced announcements for slider changes
const debouncedAnnounceSpiral = debounce((value) => {
  announceToScreenReader(`Spiral coefficient: ${value}`)
}, 500)

spiralSlider.addEventListener('input', (e) => {
  if (!inputRateLimiter()) return; // Rate limiting

  const value = SecurityUtils.validateNumber(parseFloat(e.target.value), 2, 200, spiralCoeff);
  spiralCoeff = value;
  spiralNumber.value = spiralCoeff;
  savePreference('spiralCoeff', spiralCoeff);

  // Announce value change
  debouncedAnnounceSpiral(value.toFixed(1))

  // Use instant computation if instant render is enabled, otherwise debounce
  if (instantRender) {
    computePoints();
  } else {
    debouncedComputePoints();
  }
});

spiralNumber.addEventListener('input', (e) => {
  if (!inputRateLimiter()) return; // Rate limiting

  const value = SecurityUtils.validateNumber(parseFloat(e.target.value), 0, 2000, spiralCoeff);
  if (isNaN(value) || value < 0 || value > 2000) {
    announceToScreenReader('Invalid spiral coefficient value. Please enter a number between 0 and 2000.', true)
    return
  }

  spiralCoeff = value;
  // Only update slider if value is within slider range
  if (value >= 2 && value <= 200) {
    spiralSlider.value = spiralCoeff;
  }
  savePreference('spiralCoeff', spiralCoeff);

  // Use instant computation if instant render is enabled, otherwise debounce
  if (instantRender) {
    computePoints();
  } else {
    debouncedComputePoints();
  }
});

// Max N slider functionality
const maxNSlider = document.getElementById('maxNSlider')
const maxNNumber = document.getElementById('maxNNumber')

// Debounced announcements for max N changes
const debouncedAnnounceMaxN = debounce((value) => {
  const formattedValue = value.toLocaleString()
  announceToScreenReader(`Point count: ${formattedValue}`)
}, 500)

maxNSlider.addEventListener('input', (e) => {
  maxN = parseInt(e.target.value)
  maxNNumber.value = maxN
  savePreference('maxN', maxN)

  // Announce value change
  debouncedAnnounceMaxN(maxN)

  // Use instant computation if instant render is enabled, otherwise debounce
  if (instantRender) {
    computePoints()
  } else {
    debouncedComputePoints()
  }
})

maxNNumber.addEventListener('input', (e) => {
  const value = parseInt(e.target.value)
  if (value >= 1 && value <= 1900000 && !isNaN(value)) {
    maxN = value
    // Only update slider if value is within slider range
    if (value >= 500 && value <= 190000) {
      maxNSlider.value = maxN
    }
    // Add performance warning for very large values
    if (value > 500000) {
      console.warn(`Warning: Using ${value} points may impact performance`)
      announceToScreenReader(`Warning: ${value.toLocaleString()} points may impact performance`, true)
    }
    savePreference('maxN', maxN)

    // Use instant computation if instant render is enabled, otherwise debounce
    if (instantRender) {
      computePoints()
    } else {
      debouncedComputePoints()
    }
  } else {
    announceToScreenReader('Invalid point count. Please enter a number between 1 and 1,900,000.', true)
  }
})

// Cluster count slider functionality
const clusterCountSlider = document.getElementById('clusterCountSlider')
const clusterCountNumber = document.getElementById('clusterCountNumber')

clusterCountSlider.addEventListener('input', (e) => {
  clusterCount = parseInt(e.target.value)
  clusterCountNumber.value = clusterCount
  savePreference('clusterCount', clusterCount)
  debouncedInitClusters()
})

clusterCountNumber.addEventListener('input', (e) => {
  const value = parseInt(e.target.value)
  if (value >= 0 && value <= 2000 && !isNaN(value)) {
    clusterCount = value
    // Only update slider if value is within slider range
    if (value >= 100 && value <= 200) {
      clusterCountSlider.value = clusterCount
    }
    // Add performance warning for very large values
    if (value > 500) {
      console.warn(`Warning: Using ${value} clusters may impact performance`)
    }
    savePreference('clusterCount', clusterCount)
    debouncedInitClusters()
  }
})

// Rotation speed slider functionality
const rotationSpeedSlider = document.getElementById('rotationSpeedSlider')
const rotationSpeedNumber = document.getElementById('rotationSpeedNumber')

rotationSpeedSlider.addEventListener('input', (e) => {
  rotationSpeed = parseFloat(e.target.value)
  rotationSpeedNumber.value = rotationSpeed
  savePreference('rotationSpeed', rotationSpeed)
})

rotationSpeedNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value)
  if (value >= 0.1 && value <= 10.0 && !isNaN(value)) {
    rotationSpeed = value
    // Only update slider if value is within slider range
    if (value >= 0.1 && value <= 5.0) {
      rotationSpeedSlider.value = rotationSpeed
    }
    savePreference('rotationSpeed', rotationSpeed)
  }
})

// Dot size slider functionality
const dotSizeSlider = document.getElementById('dotSizeSlider')
const dotSizeNumber = document.getElementById('dotSizeNumber')

dotSizeSlider.addEventListener('input', (e) => {
  dotSize = parseFloat(e.target.value)
  dotSizeNumber.value = dotSize
  savePreference('dotSize', dotSize)
})

dotSizeNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value)
  if (value >= 0.1 && value <= 20.0 && !isNaN(value)) {
    dotSize = value
    // Only update slider if value is within slider range
    if (value >= 0.5 && value <= 10.0) {
      dotSizeSlider.value = dotSize
    }
    savePreference('dotSize', dotSize)
  }
})

// Prime size slider functionality
const primeSizeSlider = document.getElementById('primeSizeSlider')
const primeSizeNumber = document.getElementById('primeSizeNumber')

primeSizeSlider.addEventListener('input', (e) => {
  primeSize = parseFloat(e.target.value)
  primeSizeNumber.value = primeSize
  savePreference('primeSize', primeSize)
})

primeSizeNumber.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value)
  if (value >= 0.1 && value <= 10.0 && !isNaN(value)) {
    primeSize = value
    // Only update slider if value is within slider range
    if (value >= 0.5 && value <= 5.0) {
      primeSizeSlider.value = primeSize
    }
    savePreference('primeSize', primeSize)
  }
})

document.getElementById('spiralCanvas').addEventListener('click', () => {
  sidebarToggle.click();
});

// Keyboard navigation support for accessibility
document.addEventListener('keydown', (e) => {
  // Reset cursor timer for any key activity
  resetCursorTimer()

  // Don't handle shortcuts if user is typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return
  }

  // ESC key to exit fullscreen or close sidebar
  if (e.key === 'Escape') {
    if (isFullscreen) {
      // Use the same logic as toggleFullscreen for ESC key
      if (window.__TAURI__) {
        if (wasFullscreenBefore) {
          // Window was fullscreen before, toggle interface visibility instead of exiting fullscreen
          console.log('ESC: Toggling interface visibility in fullscreen (was fullscreen before)')
          if (interfaceVisibleInFullscreen) {
            hideInterfaceInFullscreen()
            interfaceVisibleInFullscreen = false
          } else {
            showInterfaceInFullscreen()
            interfaceVisibleInFullscreen = true
          }
        } else {
          // Window was not fullscreen before, exit fullscreen
          console.log('ESC: Exiting fullscreen')
          isFullscreen = false
          wasFullscreenBefore = false
          menuVisible = true
          interfaceVisibleInFullscreen = false
          exitFullscreen()
          updateFullscreenState()
          savePreference('isFullscreen', isFullscreen)
          // Save window state after a short delay to capture correct windowed dimensions
          setTimeout(() => {
            saveWindowState()
          }, 500)
        }
      } else {
        // Browser behavior
        if (wasFullscreenBefore) {
          // In browser, show interface if hidden, hide if shown
          if (interfaceVisibleInFullscreen) {
            hideInterfaceInFullscreen()
            interfaceVisibleInFullscreen = false
          } else {
            showInterfaceInFullscreen()
            interfaceVisibleInFullscreen = true
          }
        } else {
          isFullscreen = false
          exitFullscreen()
          updateFullscreenState()
          wasFullscreenBefore = false
          interfaceVisibleInFullscreen = false
          // Save window state after a short delay to capture correct windowed dimensions
          setTimeout(() => {
            saveWindowState()
          }, 500)
        }
      }
    } else if (!sidebar.classList.contains('collapsed')) {
      sidebarToggle.click()
    }
  }

  // F11 or F key to toggle fullscreen
  if (e.key === 'F11' || (e.key === 'f' && !e.ctrlKey && !e.metaKey)) {
    e.preventDefault()

    // If in fullscreen and was fullscreen before, toggle interface instead
    if (isFullscreen && wasFullscreenBefore) {
      console.log('F key: Toggling interface visibility in fullscreen (was fullscreen before)')
      if (interfaceVisibleInFullscreen) {
        hideInterfaceInFullscreen()
        interfaceVisibleInFullscreen = false
      } else {
        showInterfaceInFullscreen()
        interfaceVisibleInFullscreen = true
      }
    } else {
      // Normal fullscreen toggle behavior
      toggleFullscreen()
    }
  }

  // S key to toggle sidebar
  if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()

    // Handle case where sidebar is completely hidden on larger screens
    if (window.innerWidth >= 768 && sidebar.style.display === 'none') {
      // Manually restore sidebar and toggle button
      sidebar.style.display = 'flex'
      sidebarToggle.style.display = 'flex'
      fullscreenToggle.style.display = 'flex'
      sidebar.classList.remove('collapsed')
      updateButtonText(sidebarToggle, '✕')
      sidebarToggle.setAttribute('aria-expanded', 'true')
      savePreference('sidebarCollapsed', false)
    } else {
      // Use normal toggle button click
      sidebarToggle.click()
    }
  }

  // P key to toggle primes
  if (e.key === 'p' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    primeToggle.click()
  }

  // A key to toggle animation
  if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    clusterToggle.click()
  }

  // R key to toggle rotation
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    rotationToggle.click()
  }

  // C key to toggle circles/squares
  if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    shapeToggle.click()
  }

  // I key to toggle instant render
  if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    instantRenderToggle.click()
  }

  // M key to toggle spiral coefficient animation
  if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    spiralAnimationToggle.click()
  }

  // H key to show tutorial
  if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (tutorialManager) {
      tutorialManager.triggerManually(); // Manual trigger with preference handling
    }
  }
})

// Make tutorial state debugging methods available globally for development
if (typeof window !== 'undefined') {
  window.debugTutorial = {
    async checkStatus() {
      if (!tutorialManager) {
        console.log('Tutorial manager not available');
        return;
      }

      const skipped = await tutorialManager.hasBeenSkipped();
      const completed = await tutorialManager.hasBeenCompleted();
      const started = await tutorialManager.getTutorialPreference('started');
      const manualTrigger = await tutorialManager.getTutorialPreference('manualTrigger');

      console.log('Tutorial Status:', {
        skipped,
        completed,
        started: started ? new Date(started) : null,
        manualTrigger,
        isCurrentlyActive: tutorialManager.isActive
      });
    },

    async reset() {
      if (!tutorialManager) {
        console.log('Tutorial manager not available');
        return;
      }
      await tutorialManager.resetTutorialState();
    },

    async trigger() {
      if (!tutorialManager) {
        console.log('Tutorial manager not available');
        return;
      }
      await tutorialManager.triggerManually();
    }
  };

  console.log('Tutorial debugging available: debugTutorial.checkStatus(), debugTutorial.reset(), debugTutorial.trigger()');
}

// Add mouse move listener for cursor auto-hide functionality
document.addEventListener('mousemove', resetCursorTimer)
document.addEventListener('click', resetCursorTimer)
document.addEventListener('mousedown', resetCursorTimer)

window.addEventListener('resize', resize)

// Ensure window can receive keyboard focus
window.addEventListener('load', () => {
  // Make sure the window can receive keyboard focus
  if (document.body) {
    document.body.tabIndex = -1
    document.body.focus()
  }

  // For Tauri, try loading window state again on window load as a fallback
  if (window.__TAURI__) {
    setTimeout(() => {
      console.log('Attempting window state restore from window load event...');
      loadWindowState();
    }, 500);
  }
})


// Add window state saving listeners for Tauri
if (window.__TAURI__) {
  // Debounced function to save window state
  const debouncedSaveWindowState = debounce(saveWindowState, 500);

  // Listen for window resize events
  window.addEventListener('resize', debouncedSaveWindowState);

  // Listen for window move events (if available)
  // Note: Tauri doesn't have direct move events, but we can save on focus changes
  window.addEventListener('focus', debouncedSaveWindowState);
  window.addEventListener('blur', debouncedSaveWindowState);

  // Save window state when the page is about to unload
  window.addEventListener('beforeunload', () => {
    saveWindowState();
  });

  // Debug functions for manual testing
  window.debugSaveWindowState = saveWindowState;
  window.debugLoadWindowState = loadWindowState;

  console.log('Tauri window state persistence enabled');
  console.log('Debug commands available: debugSaveWindowState(), debugLoadWindowState()');
}

// Tooltip System
let tooltipsEnabled = true;

// Helper function to update button text while preserving tooltip elements
function updateButtonText(button, newText) {
  // Find tooltip elements
  const tooltip = button.querySelector('.tooltip');
  const tooltipIcon = button.querySelector('.tooltip-icon');

  // Store references to tooltip elements
  const tooltipElements = [];
  if (tooltip) tooltipElements.push(tooltip);
  if (tooltipIcon) tooltipElements.push(tooltipIcon);

  // Remove tooltip elements temporarily
  tooltipElements.forEach(el => el.remove());

  // Update the text content with sanitization
  button.textContent = SecurityUtils.sanitizeText(newText);

  // Re-add tooltip elements
  tooltipElements.forEach(el => button.appendChild(el));
}

// Global function to close all tooltips
function closeAllTooltips() {
  const allTooltips = document.querySelectorAll('.tooltip.show');
  allTooltips.forEach(tooltip => {
    tooltip.classList.remove('show');
  });

  // Clear any existing timeouts
  document.querySelectorAll('.tooltip-icon').forEach(icon => {
    if (icon._tapTimeout) {
      clearTimeout(icon._tapTimeout);
      icon._tapTimeout = null;
    }
  });
}

// Global tap handler to close all tooltips when tapping anywhere
document.addEventListener('click', closeAllTooltips);
document.addEventListener('touchend', closeAllTooltips, { passive: true });

function createTooltip(element, text) {
  if (!text) return;

  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip bottom';
  tooltip.textContent = text;
  element.appendChild(tooltip);

  // Create mobile info icon
  const icon = document.createElement('div');
  icon.className = 'tooltip-icon';
  icon.textContent = 'i';
  element.appendChild(icon);

  // Position tooltip based on available space
  function positionTooltip() {
    if (!tooltipsEnabled) return;

    console.log('Positioning tooltip for:', text); // Debug log

    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Reset classes
    tooltip.className = 'tooltip';

    // For mobile, prefer bottom position for better visibility
    const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    if (isMobile) {
      // On mobile, always position at bottom for consistency
      tooltip.classList.add('bottom');
    } else {
      // Desktop positioning logic
      if (rect.top > tooltipRect.height + 10) {
        tooltip.classList.add('top');
      } else if (rect.bottom + tooltipRect.height + 10 < viewportHeight) {
        tooltip.classList.add('bottom');
      } else if (rect.left > tooltipRect.width + 10) {
        tooltip.classList.add('left');
      } else {
        tooltip.classList.add('right');
      }
    }

    console.log('Tooltip positioned with class:', tooltip.className); // Debug log
  }

  // Mobile tap handling - Use both click and touchend for better mobile support
  let tapTimeout;

  function showTooltip() {
    if (!tooltipsEnabled) return;

    console.log('Showing tooltip for:', text); // Debug log

    // First close all other tooltips
    closeAllTooltips();

    positionTooltip();
    tooltip.classList.add('show');

    // Clear existing timeout for this tooltip
    if (tapTimeout) {
      clearTimeout(tapTimeout);
    }

    // Store timeout reference on the icon for global cleanup
    icon._tapTimeout = tapTimeout;

    // Auto-hide after 4 seconds (longer for mobile)
    tapTimeout = setTimeout(() => {
      tooltip.classList.remove('show');
      icon._tapTimeout = null;
    }, 4000);
  }

  // Add both touch and click events for better mobile support
  icon.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    e.preventDefault();
  }, { passive: false });

  icon.addEventListener('touchend', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showTooltip();
  }, { passive: false });

  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showTooltip();
  });

  // Prevent button clicks from interfering with tooltip display
  if (element.classList.contains('toggle-button')) {
    element.addEventListener('click', (e) => {
      // Allow the button's normal function but prevent hiding tooltips
      e.stopPropagation();
    });
  }

  // Desktop hover handling
  let hoverTimeout;
  element.addEventListener('mouseenter', (e) => {
    if (!tooltipsEnabled) return;

    // Stop event propagation to prevent parent hover effects
    e.stopPropagation();

    hoverTimeout = setTimeout(() => {
      // Close all other tooltips first
      closeAllTooltips();
      positionTooltip();
      tooltip.classList.add('show');
    }, 500);
  });

  element.addEventListener('mouseleave', (e) => {
    // Stop event propagation
    e.stopPropagation();

    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    tooltip.classList.remove('show');
  });
}

function initTooltips() {
  // Find all elements with data-tooltip attribute
  const elementsWithTooltips = document.querySelectorAll('[data-tooltip]');

  console.log('Initializing tooltips for', elementsWithTooltips.length, 'elements'); // Debug log

  elementsWithTooltips.forEach((element, index) => {
    const tooltipText = element.getAttribute('data-tooltip');
    console.log(`Creating tooltip ${index + 1}:`, tooltipText); // Debug log
    createTooltip(element, tooltipText);
  });

  // Test mobile detection
  const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  console.log('Mobile device detected:', isMobile); // Debug log
}

function updateTooltipVisibility() {
  const body = document.body;

  if (tooltipsEnabled) {
    body.classList.remove('tooltips-disabled');
  } else {
    body.classList.add('tooltips-disabled');
    // Hide any currently shown tooltips
    closeAllTooltips();
  }
}

// Initialize tooltip toggle
function initTooltipToggle() {
  const disableTooltipsCheckbox = document.getElementById('disableTooltips');

  if (disableTooltipsCheckbox) {
    // Load saved preference
    if (db) {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      objectStore.get('tooltipsEnabled').onsuccess = (event) => {
        if (event.target.result !== undefined) {
          tooltipsEnabled = event.target.result.value;
          disableTooltipsCheckbox.checked = !tooltipsEnabled;
          updateTooltipVisibility();
        }
      };
    }

    disableTooltipsCheckbox.addEventListener('change', (e) => {
      tooltipsEnabled = !e.target.checked;
      updateTooltipVisibility();
      savePreference('tooltipsEnabled', tooltipsEnabled);
    });
  }
}

// Initialize tutorial system
function initTutorial() {
  try {
    // Create tutorial manager instance
    tutorialManager = new TutorialManager();

    // Set up tutorial link in sidebar
    const tutorialLink = document.getElementById('tutorialLink');
    if (tutorialLink) {
      tutorialLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (tutorialManager) {
          tutorialManager.triggerManually(); // Manual trigger with preference handling
        }
      });
    }



    // Start tutorial automatically for first-time users
    // Wait a bit to ensure all elements are ready
    setTimeout(async () => {
      if (tutorialManager) {
        try {
          const shouldShow = await tutorialManager.shouldShowTutorial();
          if (shouldShow) {
            // Additional delay to let the spiral render first
            setTimeout(() => {
              tutorialManager.start(false); // Automatic trigger
            }, 1000);
          }
        } catch (error) {
          console.warn('Failed to check tutorial status:', error);
        }
      }
    }, 500);

    // Add debug functions to window for testing
    window.tutorialManager = tutorialManager;
    window.startTutorial = () => tutorialManager?.start(true);
    window.resetTutorial = () => tutorialManager?.reset();
    window.forceResetTutorial = () => tutorialManager?.forceReset();
    window.getTutorialStats = () => tutorialManager?.getStats();

    console.log('Tutorial system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize tutorial system:', error);
  }
}

// About Modal functionality
function initAboutModal() {
  const aboutLink = document.getElementById('aboutLink');
  const aboutModal = document.getElementById('aboutModal');
  const aboutModalClose = document.getElementById('aboutModalClose');

  if (!aboutLink || !aboutModal || !aboutModalClose) {
    return;
  }

  // Get all focusable elements in the modal
  function getFocusableElements() {
    return aboutModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
  }

  // Trap focus within modal
  function trapFocus(e) {
    const focusableElements = getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  }

  // Open modal
  function openModal() {
    aboutModal.classList.add('show');
    aboutModal.setAttribute('aria-hidden', 'false');
    // Focus the close button for accessibility
    aboutModalClose.focus();
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    // Add focus trap
    document.addEventListener('keydown', trapFocus);
    // Announce to screen readers
    announceToScreenReader('About modal opened');
  }

  // Close modal
  function closeModal() {
    aboutModal.classList.remove('show');
    aboutModal.setAttribute('aria-hidden', 'true');
    // Restore body scroll
    document.body.style.overflow = 'hidden'; // Keep hidden since this is the main app style
    // Return focus to the about link
    aboutLink.focus();
    // Remove focus trap
    document.removeEventListener('keydown', trapFocus);
    // Announce to screen readers
    announceToScreenReader('About modal closed');
  }

  // Event listeners
  aboutLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  aboutModalClose.addEventListener('click', closeModal);

  // Close modal when clicking outside content
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) {
      closeModal();
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aboutModal.classList.contains('show')) {
      e.stopPropagation(); // Prevent other escape handlers
      closeModal();
    }
  });

  // Close modal when global closeAllTooltips is called (for consistency)
  const originalCloseAllTooltips = closeAllTooltips;
  window.closeAllTooltips = function() {
    originalCloseAllTooltips();
    if (aboutModal.classList.contains('show')) {
      closeModal();
    }
  };
}

initDB()
resize()
requestAnimationFrame(drawFrame)

// Initialize tooltips and about modal after DOM is ready
setTimeout(() => {
  initTooltips();
  initTooltipToggle();
  initAboutModal();
  initTutorial();
  addCanvasKeyboardSupport(); // Initialize enhanced canvas keyboard navigation
}, 100);
