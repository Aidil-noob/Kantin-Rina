window.App = (() => {
  const rupiahFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat('id-ID');

  function rupiah(value) {
    return rupiahFormatter.format(Number(value) || 0);
  }

  function number(value) {
    return numberFormatter.format(Number(value) || 0);
  }

  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function formatTime(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function formatDate(isoOrDate) {
    const date =
      isoOrDate instanceof Date
        ? isoOrDate
        : new Date(`${isoOrDate}T00:00:00+07:00`);
    if (Number.isNaN(date.getTime())) return String(isoOrDate || '-');
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function queueLabel(prefix, number) {
    return `${prefix || 'A'}-${String(number).padStart(3, '0')}`;
  }

  function toast(message, type = '') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const item = document.createElement('div');
    item.className = `toast ${type}`.trim();
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity .2s ease';
      setTimeout(() => item.remove(), 220);
    }, 2600);
  }

  function confirmAction({
    title = 'Konfirmasi',
    message = 'Lanjutkan tindakan ini?',
    confirmText = 'Ya, lanjutkan',
    cancelText = 'Batal',
    danger = true,
  } = {}) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.innerHTML = `
        <div class="dialog-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-btn" type="button" data-close aria-label="Tutup">&times;</button>
        </div>
        <div class="dialog-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="dialog-foot">
          <button class="btn btn-secondary" type="button" data-close>${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      `;
      document.body.appendChild(dialog);
      const finish = (value) => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(false);
      });
      dialog.querySelectorAll('[data-close]').forEach((button) => {
        button.addEventListener('click', () => finish(false));
      });
      dialog.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
      dialog.showModal();
    });
  }

  function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  let configPromise;
  function getConfig() {
    if (!configPromise) {
      configPromise = API.get('/api/config')
        .then((data) => data.config)
        .catch(() => ({ store_name: 'Warung Bu Rina', queue_name: 'Kantin', queue_prefix: 'A' }));
    }
    return configPromise;
  }

  function openDialog(dialog) {
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  document.querySelectorAll('dialog [data-close]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.closest('dialog')));
  });

  const currentPage = document.body.dataset.page;
  if (currentPage) {
    const activeLink = document.querySelector(`.mainnav a[data-nav="${currentPage}"]`);
    if (activeLink) activeLink.setAttribute('aria-current', 'page');
  }

  const nav = document.querySelector('.mainnav');
  if (nav && !document.getElementById('logout-button')) {
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.id = 'logout-button';
    logout.className = 'nav-logout';
    logout.textContent = 'Keluar';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        await API.post('/api/auth/logout');
      } catch (error) {
        // Cookie tetap dibersihkan dari sisi server bila memungkinkan.
      }
      window.location.assign('/login');
    });
    nav.appendChild(logout);
  }

  return {
    rupiah,
    number,
    todayStr,
    formatTime,
    formatDate,
    escapeHtml,
    queueLabel,
    toast,
    confirmAction,
    debounce,
    getConfig,
    openDialog,
    closeDialog,
  };
})();
