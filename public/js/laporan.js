(() => {
  const el = {
    date: document.getElementById('date'),
    reportDate: document.getElementById('report-date'),
    omzet: document.getElementById('stat-omzet'),
    transactions: document.getElementById('stat-transactions'),
    items: document.getElementById('stat-items'),
    average: document.getElementById('stat-average'),
    discount: document.getElementById('stat-discount'),
    topProducts: document.getElementById('top-products'),
    paymentMethods: document.getElementById('payment-methods'),
    voidNote: document.getElementById('void-note'),
    export: document.getElementById('export'),
  };

  const methodLabels = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

  async function load() {
    const date = el.date.value || App.todayStr();
    el.date.value = date;
    el.reportDate.textContent = App.formatDate(date);

    try {
      const data = await API.get(`/api/reports/daily?date=${date}`);
      const report = data.report;

      el.omzet.textContent = App.rupiah(report.total_omzet);
      el.transactions.textContent = App.number(report.total_transactions);
      el.items.textContent = App.number(report.total_items);
      el.average.textContent = App.rupiah(report.average_transaction);
      el.discount.textContent = `diskon ${App.rupiah(report.total_discount)}`;
      el.voidNote.textContent =
        report.voided_transactions > 0
          ? `${report.voided_transactions} nota dibatalkan`
          : 'Tidak ada pembatalan';

      el.topProducts.innerHTML = report.top_products.length
        ? report.top_products
            .map(
              (product) => `
            <tr>
              <td>${App.escapeHtml(product.name)}</td>
              <td class="num">${App.number(product.qty)}</td>
              <td class="num">${App.rupiah(product.total)}</td>
            </tr>`
            )
            .join('')
        : '<tr><td colspan="3" class="empty">Belum ada penjualan.</td></tr>';

      el.paymentMethods.innerHTML = report.by_payment.length
        ? report.by_payment
            .map(
              (payment) => `
            <tr>
              <td>${methodLabels[payment.method] || App.escapeHtml(payment.method)}</td>
              <td class="num">${App.number(payment.count)}</td>
              <td class="num strong">${App.rupiah(payment.total)}</td>
            </tr>`
            )
            .join('')
        : '<tr><td colspan="3" class="empty">Belum ada pembayaran.</td></tr>';
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  el.date.addEventListener('change', load);
  el.export.addEventListener('click', () => {
    const date = el.date.value || App.todayStr();
    window.location.href = `/api/reports/export.csv?date=${date}`;
  });

  el.date.value = App.todayStr();
  load();
})();
