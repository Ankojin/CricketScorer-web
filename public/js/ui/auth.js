// auth UI module.
let authModalKeydownBound = false;

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'test.com',
  'invalid',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com'
]);

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function isValidEmailSyntax(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}

function looksLikeDummyEmail(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return true;

  const local = (parts[0] || '').trim().toLowerCase();
  const domain = (parts[1] || '').trim().toLowerCase();

  if (!local || !domain) return true;
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return true;

  const obviousLocals = new Set(['test', 'dummy', 'fake', 'sample', 'unknown', 'na', 'none', 'admin']);
  return obviousLocals.has(local);
}

function getAuthModalFocusableElements() {
  const authModal = document.getElementById('authModal');
  if (!authModal) return [];

  const selector = [
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return [...authModal.querySelectorAll(selector)].filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });
}

function trapAuthModalTabKey(event) {
  if (event.key !== 'Tab') return;

  const authModal = document.getElementById('authModal');
  if (!authModal || !authModal.classList.contains('active')) return;

  const focusables = getAuthModalFocusableElements();
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (!authModal.contains(active) || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (!authModal.contains(active) || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusAuthModalPrimaryControl() {
  const focusables = getAuthModalFocusableElements();
  if (focusables.length > 0) focusables[0].focus();
}

function continueAsGuest() {
  const currentUser = window.CricStorage.getCurrentUser();
  const token = localStorage.getItem('cric_auth_token');
  const hasRegisteredSession = currentUser || (token && !token.startsWith('token_local'));

  if (hasRegisteredSession) {
    activeMatch = null;
    window.CricStorage.logout();
  }

  localStorage.setItem('cric_user_mode', 'GUEST');
  updateAuthUI();
  showToast('Entered Guest Mode (Temporary Local Scoring)', 'info');
  showLandingScreen();
}

function openAuthModal(defaultTab = 'LOGIN') {
  const user = window.CricStorage.getCurrentUser();
  if (user) {
    if (confirm(`Logged in as ${user.email}. Do you want to sign out?`)) {
      activeMatch = null;
      window.CricStorage.logout();
      localStorage.removeItem('cric_user_mode');
      updateAuthUI();
      showToast('Signed out successfully', 'info');
      showLandingScreen();
    }
  } else {
    switchAuthTab(defaultTab);
    document.getElementById('authModal').classList.add('active');
    if (!authModalKeydownBound) {
      document.addEventListener('keydown', trapAuthModalTabKey);
      authModalKeydownBound = true;
    }
    window.setTimeout(focusAuthModalPrimaryControl, 0);
  }
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function switchAuthTab(tab) {
  authTab = tab;
  document.getElementById('authTabLogin').style.background = tab === 'LOGIN' ? 'var(--primary-color)' : 'transparent';
  document.getElementById('authTabRegister').style.background = tab === 'REGISTER' ? 'var(--primary-color)' : 'transparent';
  document.getElementById('authTabLogin').style.color = 'var(--color-text-on-dark)';
  document.getElementById('authTabRegister').style.color = 'var(--color-text-on-dark)';
  document.getElementById('authNameGroup').style.display = tab === 'REGISTER' ? 'block' : 'none';
}

async function handleAuthSubmit() {
  const email = normalizeEmail(document.getElementById('authEmail').value);
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value?.trim();

  if (!email || !password) {
    showToast('Please enter email and password', 'warning');
    return;
  }

  if (!isValidEmailSyntax(email)) {
    showToast('Please enter a valid email address', 'warning');
    return;
  }

  if (authTab === 'REGISTER') {
    if (!isStrongPassword(password)) {
      showToast('Password must be at least 8 characters and include letters and numbers', 'warning');
      return;
    }
    if (looksLikeDummyEmail(email)) {
      showToast('Please use a real email address you can access', 'warning');
      return;
    }
  }

  try {
    if (authTab === 'REGISTER') {
      const user = await window.CricStorage.register(email, password, name);
      localStorage.setItem('cric_user_mode', 'REGISTERED');
      showToast(`Welcome, ${user.name}! Registered & synced`, 'success');
    } else {
      const user = await window.CricStorage.login(email, password);
      localStorage.setItem('cric_user_mode', 'REGISTERED');
      showToast(`Welcome back, ${user.name}!`, 'success');
    }
    closeAuthModal();
    updateAuthUI();
    showLandingScreen();
  } catch (err) {
    showToast(`Auth error: ${err.message}`, 'danger');
  }
}

function updateAuthUI() {
  const user = window.CricStorage.getCurrentUser();
  updateScoringModeAccess(Boolean(user) || localStorage.getItem('cric_user_mode') === 'REGISTERED');
  const btn = document.getElementById('authBtn');
  const syncBadge = document.getElementById('syncBadge');

  const currentEmail = (window.CricStorage.getAuthEmail() || user?.email || '').trim().toLowerCase();
  const isAdmin = currentEmail === 'ankoji@gmail.com';
  const featureAdminBtn = document.getElementById('featureAdminBtn');
  if (featureAdminBtn) {
    featureAdminBtn.hidden = !isAdmin;
  }

  if (user) {
    if (btn) {
      btn.innerText = isAdmin ? `🛡️ ${user.name || 'Admin'}` : `👤 ${user.name || user.email.split('@')[0]}`;
      btn.style.background = 'var(--color-primary-soft)';
    }
    if (syncBadge) {
      syncBadge.className = 'status-badge online';
      syncBadge.innerText = isAdmin ? '🛡️ Admin Online' : `🟢 Sync: ${user.name || 'User'}`;
    }
  } else {
    const isGuest = localStorage.getItem('cric_user_mode') === 'GUEST';
    if (btn) {
      btn.innerText = '🔑 Sign In';
      btn.style.background = 'var(--color-primary)';
    }
    if (syncBadge) {
      if (isGuest) {
        syncBadge.className = 'status-badge guest';
        syncBadge.innerText = '🟡 Guest Mode';
      } else {
        syncBadge.className = 'status-badge';
        syncBadge.innerText = '⚪ Sync Inactive';
      }
    }
  }
}
