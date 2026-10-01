// Primary action modal and accessibility helpers.
const PRIMARY_ACTION_MODAL_IDS = [
  'tossModal',
  'matchSettingsModal',
  'selectionModal',
  'extraRunsModal',
  'otherRunsModal',
  'firstInningsModal',
  'droppedCatchFielderModal',
  'droppedCatchRunsModal',
  'wicketModal',
  'fielderModal',
  'runOutModal',
  'overEndModal',
  'editBallModal',
  'matchResultModal',
  'shareModal',
  'playerCareerModal'
];

function closePrimaryActionModalsExcept(exceptId = null) {
  PRIMARY_ACTION_MODAL_IDS.forEach(id => {
    if (id === exceptId) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function openPrimaryActionModal(modalId) {
  closePrimaryActionModalsExcept(modalId);
  const el = document.getElementById(modalId);
  if (el) {
    el.removeAttribute('hidden');
    el.classList.add('active');
    focusFirstDialogControl(el);
  }
}

function getDialogFocusableElements(overlay) {
  if (!overlay) return [];
  const selector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return [...overlay.querySelectorAll(selector)].filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });
}

function getActiveDialogOverlay() {
  const overlays = [...document.querySelectorAll('.modal-overlay.active')];
  return overlays.find(overlay => {
    const cs = window.getComputedStyle(overlay);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }) || null;
}

function focusFirstDialogControl(overlay) {
  const focusables = getDialogFocusableElements(overlay);
  if (focusables.length > 0) {
    focusables[0].focus();
    return;
  }

  const panel = overlay?.querySelector('.modal');
  if (panel) {
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    panel.focus();
  }
}

function handleDialogTabTrap(event) {
  if (event.key !== 'Tab') return;

  const activeOverlay = getActiveDialogOverlay();
  if (!activeOverlay) return;

  const focusables = getDialogFocusableElements(activeOverlay);
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (!activeOverlay.contains(active) || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (!activeOverlay.contains(active) || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function initializeDialogAccessibility() {
  document.querySelectorAll('.modal-overlay').forEach((overlay, index) => {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const heading = overlay.querySelector('.modal h1, .modal h2, .modal h3');
    if (heading) {
      if (!heading.id) heading.id = `${overlay.id || 'dialog'}Title${index}`;
      overlay.setAttribute('aria-labelledby', heading.id);
      const closeButton = [...overlay.querySelectorAll('button')].find(button => /^(×|✕|x)$/i.test(button.textContent.trim()));
      if (closeButton && !closeButton.hasAttribute('aria-label')) {
        closeButton.setAttribute('aria-label', `Close ${heading.textContent.trim() || 'dialog'}`);
      }
    }

    const observer = new MutationObserver(() => {
      if (overlay.classList.contains('active')) {
        focusFirstDialogControl(overlay);
      }
    });

    observer.observe(overlay, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  document.addEventListener('keydown', handleDialogTabTrap);
}
