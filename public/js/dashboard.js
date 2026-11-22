(async () => {
  const today = App.todayStr();
  document.getElementById('today-label').textContent = App.formatDate(today);

  try {
    const [summary, queueData, recent] = await Promise.all([
      API.get(`/api/reports/summary?date=${today}`),
      API.get('/api/queue/today'),
      API.get(`/api/transactions?date=${today}&limit=6`),
    ]);

    document.getElementById('stat-omzet').textContent = App.rupiah(summary.omzet);
    document.getElementById('stat-transactions').textContent = App.number(summary.transactions);
    document.getElementById('stat-items').textContent = App.number(summary.items);
    document.getElementById('stat-queue').textContent = App.number(summary.queue_waiting);
    document.getElementById('stat-queue-sub').textContent =
      summary.queue_waiting > 0 ? 'sedang menunggu dipanggil' : 'tidak ada antrean';

    const queue = queueData.queue;
    const currentLabel = queue.current
      ? App.queueLabel(queue.prefix, queue.current.number)
      : '—';
    document.getElementById('queue-summary').innerHTML = `
      <div class="summary-row">
        <span class="muted">Nomor dipanggil</span>
        <span class="strong" style="font-size:22px">${currentLabel}</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Menunggu</span>
        <span class="strong">${App.number(queue.counts.waiting)} antrean</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Selesai hari ini</span>
        <span class="strong">${App.number(queue.counts.done)} antrean</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Total nomor</span>
        <span class="strong">${App.number(queue.counts.total)}</span>
      </div>
      <div class="link-row mt-3">
        <a class="btn btn-sm" href="/antrean">Panggil Berikutnya</a>
        <a class="btn btn-secondary btn-sm" href="/layar" target="_blank" rel="noopener">Layar</a>
      </div>
    `;

    const body = document.getElementById('recent-body');
    if (!recent.transactions.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty"><strong>Belum ada transaksi</strong>Mulai dengan membuat transaksi baru di kasir.</td></tr>`;
    } else {
      body.innerHTML = recent.transactions
        .map(
          (tx) => `
          <tr>
            <td class="mono">${App.escapeHtml(tx.code)}</td>
            <td>${App.formatTime(tx.created_at)}</td>
            <td>${App.number(tx.total_qty)} item</td>
            <td class="num strong">${App.rupiah(tx.total)}</td>
            <td>${
              tx.voided
                ? '<span class="badge badge-red">Dibatalkan</span>'
                : '<span class="badge badge-green">Lunas</span>'
            }</td>
          </tr>`
        )
        .join('');
    }
  } catch (error) {
    App.toast(error.message, 'error');
  }
})();
