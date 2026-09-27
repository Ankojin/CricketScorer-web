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
  'matchResultModal'
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
  });
}
