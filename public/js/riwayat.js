(() => {
  const el = {
    date: document.getElementById('date'),
    dateLabel: document.getElementById('date-label'),
    body: document.getElementById('history-body'),
    count: document.getElementById('stat-count'),
    omzet: document.getElementById('stat-omzet'),
    items: document.getElementById('stat-items'),
    void: document.getElementById('stat-void'),
    dialog: document.getElementById('detail-dialog'),
    detail: document.getElementById('detail-body'),
    voidButton: document.getElementById('void-transaction'),
  };

  let current = null;

  const methodLabels = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

  function statVoid(report) {
    return `${App.number(report.voided_transactions)} nota`;
  }

  function renderDetail(transaction) {
    el.detail.innerHTML = `
      <div class="summary-row">
        <span class="muted">Kode</span>
        <span class="mono strong">${App.escapeHtml(transaction.code)}</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Waktu</span>
        <span>${App.formatDate(transaction.date)} · ${App.formatTime(transaction.created_at)}</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Metode</span>
        <span>${methodLabels[transaction.payment_method] || transaction.payment_method}</span>
      </div>
      <div class="summary-row mt-2">
        <span class="muted">Status</span>
        <span>${
          transaction.voided
            ? '<span class="badge badge-red">Dibatalkan</span>'
            : '<span class="badge badge-green">Lunas</span>'
        }</span>
      </div>
      <div class="divider"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Item</th><th class="num">Harga</th><th class="num">Qty</th><th class="num">Subtotal</th></tr>
          </thead>
          <tbody>
            ${transaction.items
              .map(
                (item) => `
              <tr>
                <td>${App.escapeHtml(item.name_snapshot)}</td>
                <td class="num">${App.rupiah(item.price_snapshot)}</td>
                <td class="num">${item.qty}</td>
                <td class="num">${App.rupiah(item.subtotal)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="divider"></div>
      <div class="summary-row"><span class="muted">Subtotal</span><span>${App.rupiah(
        transaction.subtotal
      )}</span></div>
      <div class="summary-row mt-2"><span class="muted">Diskon</span><span>-${App.rupiah(
        transaction.discount
      )}</span></div>
      <div class="summary-row total mt-2"><span>Total</span><span class="amount">${App.rupiah(
        transaction.total
      )}</span></div>
      <div class="summary-row mt-2"><span class="muted">Dibayar</span><span>${App.rupiah(
        transaction.paid
      )}</span></div>
      <div class="summary-row mt-2"><span class="muted">Kembalian</span><span>${App.rupiah(
        transaction.change
      )}</span></div>
    `;
    el.voidButton.style.display = transaction.voided ? 'none' : '';
  }

  async function load() {
    const date = el.date.value || App.todayStr();
    el.date.value = date;
    el.dateLabel.textContent = App.formatDate(date);

    try {
      const [data, reportData] = await Promise.all([
        API.get(`/api/transactions?date=${date}`),
        API.get(`/api/reports/daily?date=${date}`),
      ]);

      const report = reportData.report;
      el.count.textContent = App.number(report.total_transactions);
      el.omzet.textContent = App.rupiah(report.total_omzet);
      el.items.textContent = App.number(report.total_items);
      el.void.textContent = statVoid(report);

      if (!data.transactions.length) {
        el.body.innerHTML = `<tr><td colspan="7" class="empty"><strong>Belum ada transaksi</strong>Tidak ada nota pada tanggal ini.</td></tr>`;
        return;
      }

      el.body.innerHTML = data.transactions
        .map(
          (tx) => `
          <tr>
            <td class="mono">${App.escapeHtml(tx.code)}</td>
            <td>${App.formatTime(tx.created_at)}</td>
            <td>${App.number(tx.total_qty)} item <span class="muted small">· ${App.number(
              tx.item_count
            )} jenis</span></td>
            <td>${methodLabels[tx.payment_method] || App.escapeHtml(tx.payment_method)}</td>
            <td class="num strong">${App.rupiah(tx.total)}</td>
            <td>${
              tx.voided
                ? '<span class="badge badge-red">Dibatalkan</span>'
                : '<span class="badge badge-green">Lunas</span>'
            }</td>
            <td class="text-right">
              <button class="btn btn-secondary btn-sm" type="button" data-id="${tx.id}">Detail</button>
            </td>
          </tr>`
        )
        .join('');
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  async function openDetail(id) {
    try {
      const data = await API.get(`/api/transactions/${id}`);
      current = data.transaction;
      renderDetail(current);
      App.openDialog(el.dialog);
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  el.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-id]');
    if (button) openDetail(Number(button.dataset.id));
  });

  el.date.addEventListener('change', load);

  el.voidButton.addEventListener('click', async () => {
    if (!current || current.voided) return;
    const ok = await App.confirmAction({
      title: 'Batalkan transaksi?',
      message: `Nota ${current.code} akan ditandai dibatalkan dan stok produk dikembalikan.`,
      confirmText: 'Batalkan Transaksi',
    });
    if (!ok) return;

    try {
      const data = await API.post(`/api/transactions/${current.id}/void`);
      current = data.transaction;
      renderDetail(current);
      App.toast('Transaksi dibatalkan', 'success');
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

  el.date.value = App.todayStr();
  load();
})();
