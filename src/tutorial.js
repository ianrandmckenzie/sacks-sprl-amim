/**
 * Tutorial System for Spiral Animator
 * Provides onboarding for new users with step-by-step guidance
 * Integrates with existing IndexedDB preferences system
 */

class TutorialManager {
  constructor() {
    this.currentStep = 0;
    this.isActive = false;
    this.overlay = null;
    this.highlightElement = null;
    this.skipButton = null;
    this.nextButton = null;
    this.prevButton = null;
    this.allowSkip = true;
    this.autoAdvanceTimeout = null;
    this.originalAnimationState = null;
    this.originalKeyHandler = null;
    this.sidebarProtected = false;

    // Tutorial steps configuration
    this.steps = [
      {
        target: null,
        title: "Welcome to Spiral Animator",
        content: "Create beautiful animated spirals and explore the fascinating patterns hidden in prime numbers. Let's take a quick tour!",
        duration: 0, // Manual advance only
        position: "center",
        showControls: true,
        actions: []
      },
      {
        target: "#spiralCanvas",
        title: "The Spiral Canvas",
        content: "This is where the magic happens! Numbers are arranged in a spiral pattern, with prime numbers highlighted in bright green.",
        duration: 0, // Manual advance only
        position: "center",
        showControls: true,
        actions: []
      },
      {
        target: "#rotationToggle",
        title: "Rotation Control",
        content: "Control whether the entire spiral rotates continuously. Watch how it transforms the visual experience!",
        duration: 0, // Manual advance only
        position: "right",
        showControls: true,
        actions: ["highlight", "demonstrate"]
      },
      {
        target: "#spiralSlider",
        title: "Spiral Coefficient",
        content: "This is the heart of the spiral! Adjust this slider to change how tightly the spiral winds. Small changes create dramatic effects.",
        duration: 0, // Manual advance only
        position: "right",
        showControls: true,
        actions: ["highlight", "demonstrate"]
      },
      {
        target: "#spiralAnimationToggle",
        title: "Automatic Animation",
        content: "Let the spiral coefficient animate automatically for a mesmerizing, ever-changing display of mathematical beauty.",
        duration: 0, // Manual advance only
        position: "right",
        showControls: true,
        actions: ["highlight"]
      },
      {
        target: "#maxNSlider",
        title: "Point Density",
        content: "Control how many points are displayed. More points reveal greater detail but may impact performance on slower devices.",
        duration: 0, // Manual advance only
        position: "right",
        showControls: true,
        actions: ["highlight"]
      },
      {
        target: "#fullscreenToggle",
        title: "Immersive Experience",
        content: "Enter fullscreen mode for the most immersive mathematical journey. Perfect for presentations or deep exploration!",
        duration: 0, // Manual advance only
        position: "left",
        showControls: true,
        actions: ["highlight"]
      },
      {
        target: null,
        title: "Start Exploring!",
        content: "You're all set! Experiment with different settings, discover hidden patterns, and enjoy the mathematical beauty. You can always access this tutorial again from the help menu.",
        duration: 0, // Manual advance only
        position: "center",
        showControls: true,
        actions: []
      }
    ];

    // Bind methods
    this.handleKeyPress = this.handleKeyPress.bind(this);
    this.handleClickOutside = this.handleClickOutside.bind(this);
    this.nextStep = this.nextStep.bind(this);
    this.prevStep = this.prevStep.bind(this);
    this.skipTutorial = this.skipTutorial.bind(this);
  }

  /**
   * Check if user should see tutorial (first visit or manual trigger)
   */
  async shouldShowTutorial() {
    const completed = await this.getTutorialPreference('completed');
    const skipped = await this.getTutorialPreference('skipped');
    const manualTrigger = await this.getTutorialPreference('manualTrigger');

    // Don't show if completed or skipped, unless manually triggered
    return (!completed && !skipped) || manualTrigger;
  }

  /**
   * Get tutorial-related preference from IndexedDB
   */
  getTutorialPreference(key) {
    if (!window.db) return Promise.resolve(null);

    try {
      const transaction = window.db.transaction(['preferences'], 'readonly');
      const objectStore = transaction.objectStore('preferences');
      const request = objectStore.get(`tutorial_${key}`);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          resolve(request.result?.value || null);
        };
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.warn('Failed to get tutorial preference:', error);
      return Promise.resolve(null);
    }
  }

  /**
   * Save tutorial-related preference to IndexedDB
   */
  saveTutorialPreference(key, value) {
    if (!window.db || typeof window.savePreference !== 'function') return;

    try {
      window.savePreference(`tutorial_${key}`, value);
    } catch (error) {
      console.warn('Failed to save tutorial preference:', error);
    }
  }

  /**
   * Initialize and start tutorial
   */
  async start(manual = false) {
    try {
      // Check if tutorial should run
      if (!manual) {
        const shouldShow = await this.shouldShowTutorial();
        if (!shouldShow) return;
      }

      // Ensure we don't run multiple tutorials simultaneously
      if (this.isActive) {
        console.warn('Tutorial is already active');
        return;
      }

      // Store original animation state to restore later
      this.originalAnimationState = {
        showClusters: window.showClusters,
        showRotation: window.showRotation,
        animateSpiralCoeff: window.animateSpiralCoeff
      };

      this.isActive = true;
      this.currentStep = 0;

      // If triggered manually, reset the manual trigger flag after starting
      if (manual) {
        this.saveTutorialPreference('manualTrigger', false);
      }

      this.createOverlay();
      this.addEventListeners();
      this.showStep(0);

      // Track tutorial start
      this.saveTutorialPreference('started', Date.now());
    } catch (error) {
      console.error('Failed to start tutorial:', error);
      this.end();
    }
  }

  /**
   * Create the tutorial overlay and controls
   */
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'tutorial-title');
    this.overlay.setAttribute('aria-describedby', 'tutorial-description');
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-labelledby', 'tutorial-title');
    this.overlay.setAttribute('aria-describedby', 'tutorial-content');
    this.overlay.setAttribute('aria-modal', 'true');

    // Create elements programmatically for better security
    const tutorialContent = document.createElement('div');
    tutorialContent.className = 'tutorial-content';

    const tutorialHeader = document.createElement('div');
    tutorialHeader.className = 'tutorial-header';

    const tutorialTitle = document.createElement('h2');
    tutorialTitle.id = 'tutorial-title';
    tutorialTitle.className = 'tutorial-title';

    const closeButton = document.createElement('button');
    closeButton.className = 'tutorial-close';
    closeButton.setAttribute('aria-label', 'Close tutorial');
    closeButton.textContent = '×';

    tutorialHeader.appendChild(tutorialTitle);
    tutorialHeader.appendChild(closeButton);

    const tutorialBody = document.createElement('div');
    tutorialBody.className = 'tutorial-body';

    const tutorialDescription = document.createElement('p');
    tutorialDescription.id = 'tutorial-content';
    tutorialDescription.className = 'tutorial-description';

    tutorialBody.appendChild(tutorialDescription);

    const tutorialFooter = document.createElement('div');
    tutorialFooter.className = 'tutorial-footer';

    const tutorialProgress = document.createElement('div');
    tutorialProgress.className = 'tutorial-progress';

    const progressBar = document.createElement('div');
    progressBar.className = 'tutorial-progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = 'tutorial-progress-fill';

    progressBar.appendChild(progressFill);

    const stepCounter = document.createElement('span');
    stepCounter.className = 'tutorial-step-counter';
    stepCounter.setAttribute('aria-live', 'polite');

    tutorialProgress.appendChild(progressBar);
    tutorialProgress.appendChild(stepCounter);

    const tutorialControls = document.createElement('div');
    tutorialControls.className = 'tutorial-controls';

    const skipButton = document.createElement('button');
    skipButton.className = 'tutorial-btn tutorial-skip';
    skipButton.textContent = 'Skip Tutorial';
    skipButton.setAttribute('aria-label', 'Skip tutorial and close');

    const tutorialNav = document.createElement('div');
    tutorialNav.className = 'tutorial-nav';

    const prevButton = document.createElement('button');
    prevButton.className = 'tutorial-btn tutorial-prev';
    prevButton.disabled = true;
    prevButton.textContent = 'Previous';
    prevButton.setAttribute('aria-label', 'Go to previous tutorial step');

    const nextButton = document.createElement('button');
    nextButton.className = 'tutorial-btn tutorial-next tutorial-primary';
    nextButton.textContent = 'Next';
    nextButton.setAttribute('aria-label', 'Go to next tutorial step');

    tutorialNav.appendChild(prevButton);
    tutorialNav.appendChild(nextButton);

    tutorialControls.appendChild(skipButton);
    tutorialControls.appendChild(tutorialNav);

    tutorialFooter.appendChild(tutorialProgress);
    tutorialFooter.appendChild(tutorialControls);

    tutorialContent.appendChild(tutorialHeader);
    tutorialContent.appendChild(tutorialBody);
    tutorialContent.appendChild(tutorialFooter);

    const spotlight = document.createElement('div');
    spotlight.className = 'tutorial-spotlight';

    this.overlay.appendChild(tutorialContent);
    this.overlay.appendChild(spotlight);

    document.body.appendChild(this.overlay);

    // Get button references
    this.skipButton = this.overlay.querySelector('.tutorial-skip');
    this.nextButton = this.overlay.querySelector('.tutorial-next');
    this.prevButton = this.overlay.querySelector('.tutorial-prev');
    const tutorialCloseButton = this.overlay.querySelector('.tutorial-close');

    // Add click handlers
    this.skipButton.addEventListener('click', this.skipTutorial);
    this.nextButton.addEventListener('click', this.nextStep);
    this.prevButton.addEventListener('click', this.prevStep);
    tutorialCloseButton.addEventListener('click', this.skipTutorial);
  }

  /**
   * Add necessary event listeners
   */
  addEventListeners() {
    document.addEventListener('keydown', this.handleKeyPress);
    this.overlay.addEventListener('click', this.handleClickOutside);

    // Override keyboard shortcuts that could interfere with tutorial
    this.enableSidebarProtection();

    // Add focus trap
    this.setupFocusTrap();
  }

  /**
   * Setup focus trap for tutorial modal
   */
  setupFocusTrap() {
    const focusableElements = this.overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    this.trapFocus = (e) => {
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
    };

    document.addEventListener('keydown', this.trapFocus);

    // Focus the first focusable element
    setTimeout(() => firstElement.focus(), 100);
  }

  /**
   * Remove event listeners
   */
  removeEventListeners() {
    document.removeEventListener('keydown', this.handleKeyPress);
    if (this.overlay) {
      this.overlay.removeEventListener('click', this.handleClickOutside);
    }

    // Restore normal keyboard behavior
    this.disableSidebarProtection();

    // Remove focus trap
    if (this.trapFocus) {
      document.removeEventListener('keydown', this.trapFocus);
      this.trapFocus = null;
    }
  }

  /**
   * Protect sidebar from being hidden during tutorial
   */
  enableSidebarProtection() {
    if (this.sidebarProtected) return;

    this.sidebarProtected = true;

    // Store original keydown handler and replace with tutorial-safe version
    this.originalKeyHandler = document.onkeydown;

    // Override the main app's keydown handler during tutorial
    const originalHandler = window.addEventListener;
    const tutorialThis = this;

    // Track if we've already added our handler
    if (!this.tutorialKeyHandlerAdded) {
      document.addEventListener('keydown', (e) => {
        if (!tutorialThis.isActive) return;

        // Block 'S' key from hiding sidebar during tutorial (except on canvas step)
        if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
          const currentStep = tutorialThis.steps[tutorialThis.currentStep];
          if (!currentStep || currentStep.target !== "#spiralCanvas") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Show a helpful message
            tutorialThis.showSidebarProtectionMessage();
            return false;
          }
        }
      }, { capture: true, passive: false });

      this.tutorialKeyHandlerAdded = true;
    }
  }

  /**
   * Restore normal sidebar behavior
   */
  disableSidebarProtection() {
    this.sidebarProtected = false;
    // Note: We don't remove the event listener as it checks isActive
  }

  /**
   * Show message when user tries to hide sidebar during tutorial
   */
  showSidebarProtectionMessage() {
    // Create a temporary toast message
    const toast = document.createElement('div');
    toast.className = 'tutorial-protection-toast';
    toast.textContent = 'Sidebar is protected during tutorial - use tutorial controls to navigate';
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 69, 0, 0.9);
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      z-index: 3000;
      font-family: monospace;
      font-size: 14px;
      border: 2px solid #ff4500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);

    // Remove after 2 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2000);
  }

  /**
   * Handle keyboard navigation
   */
  handleKeyPress(event) {
    if (!this.isActive) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.skipTutorial();
        break;
      case 'ArrowRight':
      case ' ':
        event.preventDefault();
        if (!this.nextButton.disabled) this.nextStep();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (!this.prevButton.disabled) this.prevStep();
        break;
    }
  }

  /**
   * Handle clicks outside tutorial content
   */
  handleClickOutside(event) {
    if (event.target === this.overlay) {
      // Allow clicking outside to advance on certain steps
      if (this.currentStep < this.steps.length - 1) {
        this.nextStep();
      }
    }
  }

  /**
   * Display a specific tutorial step
   */
  showStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) return;

    const step = this.steps[stepIndex];
    this.currentStep = stepIndex;

    // Clear any existing timeouts
    if (this.autoAdvanceTimeout) {
      clearTimeout(this.autoAdvanceTimeout);
      this.autoAdvanceTimeout = null;
    }

    // Ensure sidebar is visible for all steps except canvas step
    this.manageSidebarVisibility(step);

    // Update content
    this.overlay.querySelector('.tutorial-title').textContent = step.title;
    this.overlay.querySelector('.tutorial-description').textContent = step.content;

    // Update progress
    const progress = ((stepIndex + 1) / this.steps.length) * 100;
    this.overlay.querySelector('.tutorial-progress-fill').style.width = `${progress}%`;
    this.overlay.querySelector('.tutorial-step-counter').textContent = `${stepIndex + 1} of ${this.steps.length}`;

    // Update navigation buttons
    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.textContent = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next';

    // Position overlay and highlight target
    this.positionOverlay(step);
    this.highlightTarget(step.target);

    // Perform step actions
    if (step.actions?.length > 0) {
      this.performActions(step.actions, step.target);
    }

    // Auto-advance if duration is set (currently all are 0 - manual only)
    if (step.duration > 0) {
      this.autoAdvanceTimeout = setTimeout(() => {
        if (this.currentStep < this.steps.length - 1) {
          this.nextStep();
        }
      }, step.duration);
    }

    // Track step progress
    this.saveTutorialPreference(`step_${stepIndex}_viewed`, Date.now());
  }

  /**
   * Manage sidebar visibility based on tutorial step
   */
  manageSidebarVisibility(step) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (step.target === "#spiralCanvas") {
      // For canvas step, allow sidebar to be hidden for better canvas view
      // Don't force it visible, but don't protect it either
      return;
    } else {
      // For all other steps, ensure sidebar is visible
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');

        // Update toggle button state
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
          sidebarToggle.textContent = '✕';
          sidebarToggle.setAttribute('aria-expanded', 'true');
        }

        // Save state
        if (window.savePreference) {
          window.savePreference('sidebarCollapsed', false);
        }
      }
    }
  }

  /**
   * Position tutorial overlay based on target element and step configuration
   */
  positionOverlay(step) {
    const content = this.overlay.querySelector('.tutorial-content');

    if (!step.target || step.position === 'center') {
      // Center positioning
      content.style.position = 'fixed';
      content.style.top = '50%';
      content.style.left = '50%';
      content.style.transform = 'translate(-50%, -50%)';
      content.style.maxWidth = '500px';
      content.style.width = '90vw';
      return;
    }

    const targetElement = document.querySelector(step.target);
    if (!targetElement) {
      // Fallback to center if target not found
      content.style.position = 'fixed';
      content.style.top = '50%';
      content.style.left = '50%';
      content.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Reset positioning styles
    content.style.position = 'fixed';
    content.style.transform = 'none';
    content.style.maxWidth = '400px';
    content.style.width = 'auto';

    switch (step.position) {
      case 'right':
        if (targetRect.right + 420 < viewportWidth) {
          content.style.left = `${targetRect.right + 20}px`;
          content.style.top = `${Math.max(20, targetRect.top)}px`;
        } else {
          // Fallback to left if no room on right
          content.style.right = `${viewportWidth - targetRect.left + 20}px`;
          content.style.top = `${Math.max(20, targetRect.top)}px`;
        }
        break;

      case 'left':
        if (targetRect.left - 420 > 0) {
          content.style.right = `${viewportWidth - targetRect.left + 20}px`;
          content.style.top = `${Math.max(20, targetRect.top)}px`;
        } else {
          // Fallback to right if no room on left
          content.style.left = `${targetRect.right + 20}px`;
          content.style.top = `${Math.max(20, targetRect.top)}px`;
        }
        break;

      case 'top':
        content.style.left = `${Math.max(20, targetRect.left)}px`;
        content.style.bottom = `${viewportHeight - targetRect.top + 20}px`;
        break;

      case 'bottom':
        content.style.left = `${Math.max(20, targetRect.left)}px`;
        content.style.top = `${targetRect.bottom + 20}px`;
        break;

      default:
        // Center as fallback
        content.style.top = '50%';
        content.style.left = '50%';
        content.style.transform = 'translate(-50%, -50%)';
    }
  }

  /**
   * Highlight target element with spotlight effect
   */
  highlightTarget(selector) {
    // Remove previous highlight
    if (this.highlightElement) {
      this.highlightElement.classList.remove('tutorial-highlighted');
      this.highlightElement.style.animation = ''; // Clear any animation
    }

    const spotlight = this.overlay.querySelector('.tutorial-spotlight');

    if (!selector) {
      // No target to highlight
      spotlight.style.display = 'none';
      this.highlightElement = null;
      return;
    }

    const element = document.querySelector(selector);
    if (!element) {
      spotlight.style.display = 'none';
      this.highlightElement = null;
      return;
    }

    // Add highlight class
    element.classList.add('tutorial-highlighted');
    this.highlightElement = element;

    // Position spotlight
    const rect = element.getBoundingClientRect();
    const padding = 10;

    spotlight.style.display = 'block';
    spotlight.style.left = `${rect.left - padding}px`;
    spotlight.style.top = `${rect.top - padding}px`;
    spotlight.style.width = `${rect.width + padding * 2}px`;
    spotlight.style.height = `${rect.height + padding * 2}px`;
  }

  /**
   * Perform demonstration actions for tutorial steps
   */
  performActions(actions, target) {
    actions.forEach((action, index) => {
      setTimeout(() => {
        switch (action) {
          case 'highlight':
            this.pulseHighlight(target);
            break;

          case 'demonstrate':
            this.demonstrateControl(target);
            break;
        }
      }, index * 1000);
    });
  }

  /**
   * Create pulsing effect on highlighted element
   */
  pulseHighlight(selector) {
    const element = document.querySelector(selector);
    if (!element) return;

    element.style.animation = 'tutorial-pulse 2s ease-in-out 3';

    // Clear the animation after it completes (2s duration * 3 iterations = 6s)
    setTimeout(() => {
      if (element) {
        element.style.animation = '';
      }
    }, 6100); // Add small buffer to ensure animation is complete
  }

  /**
   * Demonstrate control functionality
   */
  demonstrateControl(selector) {
    switch (selector) {
      case '#spiralSlider':
        this.demonstrateSlider('#spiralSlider', '#spiralNumber');
        break;

      case '#rotationToggle':
        this.demonstrateToggle('#rotationToggle');
        break;
    }
  }

  /**
   * Demonstrate slider control
   */
  demonstrateSlider(sliderSelector, numberSelector) {
    const slider = document.querySelector(sliderSelector);
    const numberInput = document.querySelector(numberSelector);

    if (!slider) return;

    const originalValue = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const demoValue = Math.min(originalValue * 1.5, max);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue;
      if (numberInput) numberInput.value = demoValue;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 500);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue + 0.1;
      if (numberInput) numberInput.value = demoValue + 0.1;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 800);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue + 0.2;
      if (numberInput) numberInput.value = demoValue + 0.2;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 1100);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue + 0.3;
      if (numberInput) numberInput.value = demoValue + 0.3;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 1400);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue + 0.3;
      if (numberInput) numberInput.value = demoValue + 0.3;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 1700);

    // Animate to demo value
    setTimeout(() => {
      slider.value = demoValue + 0.3;
      if (numberInput) numberInput.value = demoValue + 0.3;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 2000);

    // Return to original value
    setTimeout(() => {
      slider.value = originalValue;
      if (numberInput) numberInput.value = originalValue;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, 2500);
  }

  /**
   * Demonstrate toggle control
   */
  demonstrateToggle(toggleSelector) {
    const toggle = document.querySelector(toggleSelector);
    if (!toggle) return;

    // Brief toggle demonstration
    setTimeout(() => {
      toggle.click();
    }, 500);

    setTimeout(() => {
      toggle.click();
    }, 2000);
  }

  /**
   * Advance to next step
   */
  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.completeTutorial();
    }
  }

  /**
   * Go back to previous step
   */
  prevStep() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  /**
   * Skip entire tutorial
   */
  skipTutorial() {
    // Save skip information with timestamp and step where it was skipped
    this.saveTutorialPreference('skipped', Date.now());
    this.saveTutorialPreference('skipped_step', this.currentStep);

    // Ensure manual trigger flag is cleared so tutorial won't auto-show again
    this.saveTutorialPreference('manualTrigger', false);

    console.log('Tutorial skipped at step', this.currentStep);
    this.end();
  }

  /**
   * Complete tutorial successfully
   */
  completeTutorial() {
    this.saveTutorialPreference('completed', Date.now());
    this.saveTutorialPreference('completed_step', this.steps.length);

    // Clear manual trigger flag when tutorial is completed
    this.saveTutorialPreference('manualTrigger', false);

    console.log('Tutorial completed successfully');
    this.end();
  }

  /**
   * End tutorial and cleanup
   */
  end() {
    this.isActive = false;

    // Clear timeouts
    if (this.autoAdvanceTimeout) {
      clearTimeout(this.autoAdvanceTimeout);
      this.autoAdvanceTimeout = null;
    }

    // Remove highlights
    if (this.highlightElement) {
      this.highlightElement.classList.remove('tutorial-highlighted');
      this.highlightElement.style.animation = ''; // Clear any animation
      this.highlightElement = null;
    }

    // Remove all tutorial highlights and clear animations
    document.querySelectorAll('.tutorial-highlighted').forEach(el => {
      el.classList.remove('tutorial-highlighted');
      el.style.animation = ''; // Clear any animation
    });

    // Additional cleanup: remove any lingering tutorial-pulse animations from tutorial target elements
    this.steps.forEach(step => {
      if (step.target) {
        const element = document.querySelector(step.target);
        if (element && element.style.animation && element.style.animation.includes('tutorial-pulse')) {
          element.style.animation = '';
        }
      }
    });

    // Remove overlay
    if (this.overlay) {
      this.overlay.classList.add('tutorial-fade-out');
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 300);
    }

    // Remove event listeners
    this.removeEventListeners();

    // Restore original state if needed
    if (this.originalAnimationState) {
      // Optionally restore original animation states
      // For now, let user keep any changes made during tutorial
      this.originalAnimationState = null;
    }

    // Clear manual trigger flag
    this.saveTutorialPreference('manualTrigger', false);

    // Focus back to main content
    const canvas = document.getElementById('spiralCanvas');
    if (canvas) {
      canvas.focus();
    }
  }

  /**
   * Check if tutorial was completed
   */
  async isCompleted() {
    return await this.getTutorialPreference('completed') !== null;
  }

  /**
   * Check if the tutorial has been skipped previously
   */
  async hasBeenSkipped() {
    const skipped = await this.getTutorialPreference('skipped');
    return !!skipped;
  }

  /**
   * Check if the tutorial has been completed previously
   */
  async hasBeenCompleted() {
    const completed = await this.getTutorialPreference('completed');
    return !!completed;
  }

  /**
   * Reset tutorial state (for testing or allowing users to reset)
   */
  async resetTutorialState() {
    this.saveTutorialPreference('skipped', null);
    this.saveTutorialPreference('completed', null);
    this.saveTutorialPreference('manualTrigger', null);
    this.saveTutorialPreference('started', null);
    this.saveTutorialPreference('skipped_step', null);
    this.saveTutorialPreference('completed_step', null);
    console.log('Tutorial state has been reset');
  }

  /**
   * Reset tutorial progress (for testing or user request)
   */
  reset() {
    const tutorialKeys = [
      'completed', 'started', 'skipped', 'completed_step', 'manualTrigger'
    ];

    tutorialKeys.forEach(key => {
      this.saveTutorialPreference(key, null);
    });

    // Also clear step tracking
    for (let i = 0; i < this.steps.length; i++) {
      this.saveTutorialPreference(`step_${i}_viewed`, null);
    }
  }

  /**
   * Force reset tutorial state (clears all tutorial data)
   */
  forceReset() {
    if (!window.db) return;

    try {
      const transaction = window.db.transaction(['preferences'], 'readwrite');
      const objectStore = transaction.objectStore('preferences');

      // Get all keys and delete tutorial-related ones
      const getAllRequest = objectStore.getAllKeys();
      getAllRequest.onsuccess = () => {
        const keys = getAllRequest.result;
        keys.forEach(key => {
          if (key.startsWith('tutorial_')) {
            objectStore.delete(key);
          }
        });
      };
    } catch (error) {
      console.warn('Failed to force reset tutorial:', error);
    }
  }

  /**
   * Get tutorial statistics for debugging
   */
  async getStats() {
    const stats = {
      completed: await this.getTutorialPreference('completed'),
      started: await this.getTutorialPreference('started'),
      skipped: await this.getTutorialPreference('skipped'),
      completedStep: await this.getTutorialPreference('completed_step'),
      stepViews: {}
    };

    // Get step view timestamps
    for (let i = 0; i < this.steps.length; i++) {
      const viewed = await this.getTutorialPreference(`step_${i}_viewed`);
      if (viewed) {
        stats.stepViews[i] = viewed;
      }
    }

    return stats;
  }

  /**
   * Manually trigger the tutorial (for H key or tutorial link clicks)
   */
  async triggerManually() {
    try {
      // Set the manual trigger flag first
      this.saveTutorialPreference('manualTrigger', true);

      // Small delay to ensure the preference is saved
      await new Promise(resolve => setTimeout(resolve, 50));

      // Start the tutorial
      await this.start(true);
    } catch (error) {
      console.error('Failed to manually trigger tutorial:', error);
    }
  }
}

// Export for use in main application
export default TutorialManager;
