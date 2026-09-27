// toast UI module.
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'danger' || type === 'error' ? 'alert' : 'status');
  const message = document.createElement('span');
  message.textContent = msg;
  const closeButton = document.createElement('button');
  closeButton.className = 'toast-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => toast.remove());
  toast.append(message, closeButton);
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.CricStorage.onToast = showToast;
