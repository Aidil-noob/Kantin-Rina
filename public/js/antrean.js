(() => {
  const el = {
    date: document.getElementById('queue-date'),
    current: document.getElementById('current-number'),
    hint: document.getElementById('current-hint'),
    waiting: document.getElementById('waiting-list'),
    waitingCount: document.getElementById('waiting-count'),
    metaWaiting: document.getElementById('meta-waiting'),
    metaDone: document.getElementById('meta-done'),
    metaSkipped: document.getElementById('meta-skipped'),
    metaTotal: document.getElementById('meta-total'),
    take: document.getElementById('take'),
    callNext: document.getElementById('call-next'),
    recall: document.getElementById('recall'),
    done: document.getElementById('done'),
    skip: document.getElementById('skip'),
    reset: document.getElementById('reset'),
  };

  let state = null;
  let busy = false;

  function render(queue) {
    state = queue;
    el.date.textContent = `Antrean ${App.formatDate(queue.date)} · prefix ${queue.prefix}`;

    if (queue.current) {
      el.current.textContent = App.queueLabel(queue.prefix, queue.current.number);
      el.current.classList.remove('idle');
      el.hint.textContent = `Dipanggil pukul ${App.formatTime(queue.current.called_at)}`;
    } else {
      el.current.textContent = '—';
      el.current.classList.add('idle');
      el.hint.textContent = 'Belum ada nomor yang dipanggil.';
    }

    el.metaWaiting.textContent = App.number(queue.counts.waiting);
    el.metaDone.textContent = App.number(queue.counts.done);
    el.metaSkipped.textContent = App.number(queue.counts.skipped);
    el.metaTotal.textContent = App.number(queue.counts.total);
    el.waitingCount.textContent = `${App.number(queue.counts.waiting)} antrean`;

    if (!queue.waiting.length) {
      el.waiting.innerHTML = '<p class="muted">Belum ada antrean menunggu.</p>';
    } else {
      el.waiting.innerHTML = queue.waiting
        .map(
          (row) => `
          <div class="waiting-row">
            <span class="wnum">${App.queueLabel(queue.prefix, row.number)}</span>
            <span class="wtime">Diambil ${App.formatTime(row.created_at)}</span>
            <button class="btn btn-secondary btn-sm" type="button" data-call="${row.id}">Panggil</button>
            <button class="btn btn-ghost btn-sm" type="button" data-skip="${row.id}">Lewati</button>
          </div>`
        )
        .join('');
    }

    el.recall.disabled = !queue.current;
    el.done.disabled = !queue.current;
    el.skip.disabled = !queue.current;
    el.callNext.disabled = queue.counts.waiting === 0;
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const data = await API.get('/api/queue/today');
      render(data.queue);
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    try {
      const result = await fn();
      if (result.queue) render(result.queue);
      if (result.toast) App.toast(result.toast, result.toastType ?? 'success');
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      busy = false;
    }
  }

  el.take.addEventListener('click', () =>
    run(async () => {
      const data = await API.post('/api/queue/take');
      return {
        queue: data.queue,
        toast: `Nomor ${App.queueLabel(data.queue.prefix, data.created.number)} dibuat`,
      };
    })
  );

  el.callNext.addEventListener('click', () =>
    run(async () => {
      const data = await API.post('/api/queue/call-next');
      if (!data.called) {
        return { queue: data.queue, toast: 'Tidak ada antrean yang menunggu', toastType: '' };
      }
      return {
        queue: data.queue,
        toast: `Memanggil ${App.queueLabel(data.queue.prefix, data.called.number)}`,
      };
    })
  );

  el.recall.addEventListener('click', () => {
    if (!state?.current) return;
    const id = state.current.id;
    const label = App.queueLabel(state.prefix, state.current.number);
    run(async () => {
      const data = await API.post(`/api/queue/${id}/call`);
      return { queue: data.queue, toast: `Memanggil ulang ${label}` };
    });
  });

  el.done.addEventListener('click', () => {
    if (!state?.current) return;
    const id = state.current.id;
    const label = App.queueLabel(state.prefix, state.current.number);
    run(async () => {
      const data = await API.post(`/api/queue/${id}/done`);
      return { queue: data.queue, toast: `Antrean ${label} selesai` };
    });
  });

  el.skip.addEventListener('click', async () => {
    if (!state?.current) return;
    const id = state.current.id;
    const label = App.queueLabel(state.prefix, state.current.number);
    const ok = await App.confirmAction({
      title: 'Lewati antrean?',
      message: `Antrean ${label} akan ditandai dilewati.`,
      confirmText: 'Lewati',
      danger: false,
    });
    if (!ok) return;
    run(async () => {
      const data = await API.post(`/api/queue/${id}/skip`);
      return { queue: data.queue, toast: `Antrean ${label} dilewati` };
    });
  });

  el.waiting.addEventListener('click', async (event) => {
    const callButton = event.target.closest('[data-call]');
    const skipButton = event.target.closest('[data-skip]');

    if (callButton) {
      run(async () => {
        const data = await API.post(`/api/queue/${callButton.dataset.call}/call`);
        return {
          queue: data.queue,
          toast: `Memanggil ${App.queueLabel(data.queue.prefix, data.called.number)}`,
        };
      });
    }

    if (skipButton) {
      const ok = await App.confirmAction({
        title: 'Lewati antrean?',
        message: 'Nomor ini akan ditandai dilewati.',
        confirmText: 'Lewati',
        danger: false,
      });
      if (!ok) return;
      run(async () => {
        const data = await API.post(`/api/queue/${skipButton.dataset.skip}/skip`);
        return { queue: data.queue, toast: 'Antrean dilewati' };
      });
    }
  });

  el.reset.addEventListener('click', async () => {
    const ok = await App.confirmAction({
      title: 'Reset antrean hari ini?',
      message: 'Semua nomor antrean hari ini akan dihapus dan penomoran kembali dari awal.',
      confirmText: 'Reset',
    });
    if (!ok) return;
    run(async () => {
      const data = await API.post('/api/queue/reset');
      return { queue: data.queue, toast: 'Antrean direset' };
    });
  });

  refresh();
  setInterval(refresh, 4000);
})();
