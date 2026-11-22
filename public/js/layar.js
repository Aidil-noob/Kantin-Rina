(() => {
  const el = {
    storeName: document.getElementById('store-name'),
    queueName: document.getElementById('queue-name'),
    clock: document.getElementById('clock'),
    number: document.getElementById('screen-number'),
    hint: document.getElementById('screen-hint'),
    waiting: document.getElementById('screen-waiting'),
    counts: document.getElementById('screen-counts'),
    soundToggle: document.getElementById('sound-toggle'),
    fullscreen: document.getElementById('fullscreen'),
  };

  const digitWords = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];

  let soundEnabled = localStorage.getItem('layar_sound') !== 'off';
  let lastCallToken = null;
  let currentQueue = null;

  function updateClock() {
    el.clock.textContent = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  function updateSoundButton() {
    el.soundToggle.textContent = soundEnabled ? 'Suara: Aktif' : 'Suara: Mati';
    el.soundToggle.classList.toggle('off', !soundEnabled);
  }

  function speakNumber(queue, prefix) {
    if (!soundEnabled || !('speechSynthesis' in window)) return;

    const digits = String(queue.number).padStart(3, '0').split('').map((d) => digitWords[Number(d)]);
    const text = `Nomor antrean ${prefix} ${digits.join(' ')}, silakan menuju kasir.`;

    window.speechSynthesis.cancel();
    const speakOnce = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };
    speakOnce();
    setTimeout(() => {
      if (currentQueue?.current?.id === queue.id) speakOnce();
    }, 2600);
  }

  function render(queue) {
    currentQueue = queue;
    const label = queue.current ? App.queueLabel(queue.prefix, queue.current.number) : '—';

    el.number.textContent = label;
    el.number.classList.toggle('idle', !queue.current);
    el.hint.textContent = queue.current
      ? `Dipanggil pukul ${App.formatTime(queue.current.called_at)} · silakan menuju kasir`
      : 'Silakan menunggu panggilan';

    el.waiting.innerHTML = queue.waiting.length
      ? queue.waiting
          .map(
            (row) =>
              `<span class="screen-chip">${App.queueLabel(queue.prefix, row.number)}</span>`
          )
          .join('')
      : '<p class="screen-empty">Belum ada antrean menunggu.</p>';

    el.counts.textContent = `${queue.counts.waiting} menunggu · ${queue.counts.done} selesai`;

    if (queue.current) {
      const token = `${queue.current.id}:${queue.current.called_at}`;
      if (token !== lastCallToken) {
        lastCallToken = token;
        speakNumber(queue.current, queue.prefix);
      }
    }
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const data = await API.get('/api/queue/today');
      render(data.queue);
    } catch (error) {
      el.hint.textContent = 'Tidak dapat memuat antrean. Periksa koneksi server.';
    }
  }

  async function loadConfig() {
    const config = await App.getConfig();
    el.storeName.textContent = config.store_name;
    el.queueName.textContent = `Antrean ${config.queue_name}`;
    document.title = `Layar Antrean · ${config.queue_name}`;
  }

  el.soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('layar_sound', soundEnabled ? 'on' : 'off');
    updateSoundButton();
    if (soundEnabled && currentQueue?.current) {
      speakNumber(currentQueue.current, currentQueue.prefix);
    } else if (!soundEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  el.fullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        el.fullscreen.textContent = 'Keluar Layar Penuh';
      } else {
        await document.exitFullscreen();
        el.fullscreen.textContent = 'Layar Penuh';
      }
    } catch (error) {
      App.toast('Layar penuh tidak didukung browser ini', 'error');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    el.fullscreen.textContent = document.fullscreenElement ? 'Keluar Layar Penuh' : 'Layar Penuh';
  });

  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (error) {
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refresh();
      requestWakeLock();
    }
  });

  updateClock();
  setInterval(updateClock, 1000);
  updateSoundButton();
  loadConfig();
  refresh();
  setInterval(refresh, 3000);
  requestWakeLock();
})();
