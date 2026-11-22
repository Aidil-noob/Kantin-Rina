(() => {
  const state = {
    products: [],
    cart: new Map(),
    category: 'Semua',
    method: 'tunai',
    config: null,
  };

  const el = {
    search: document.getElementById('search'),
    categories: document.getElementById('categories'),
    grid: document.getElementById('product-grid'),
    cartItems: document.getElementById('cart-items'),
    subtotal: document.getElementById('subtotal'),
    discount: document.getElementById('discount'),
    total: document.getElementById('total'),
    paid: document.getElementById('paid'),
    change: document.getElementById('change'),
    changeBox: document.getElementById('change-box'),
    paidField: document.getElementById('paid-field'),
    checkout: document.getElementById('checkout'),
    clear: document.getElementById('clear-cart'),
    dialog: document.getElementById('receipt-dialog'),
    receipt: document.getElementById('receipt'),
  };

  function cartSubtotal() {
    let sum = 0;
    for (const entry of state.cart.values()) {
      sum += entry.product.price * entry.qty;
    }
    return sum;
  }

  function totals() {
    const subtotal = cartSubtotal();
    const discount = Math.max(0, Math.min(Number(el.discount.value) || 0, subtotal));
    const total = subtotal - discount;
    const paid = state.method === 'tunai' ? Number(el.paid.value) || 0 : total;
    return { subtotal, discount, total, paid, change: paid - total };
  }

  function renderCategories() {
    const categories = ['Semua', ...new Set(state.products.map((p) => p.category))];
    el.categories.innerHTML = categories
      .map(
        (category) =>
          `<button type="button" class="chip ${
            state.category === category ? 'active' : ''
          }" data-category="${App.escapeHtml(category)}">${App.escapeHtml(category)}</button>`
      )
      .join('');
  }

  function visibleProducts() {
    const query = el.search.value.trim().toLowerCase();
    return state.products.filter((product) => {
      const matchCategory = state.category === 'Semua' || product.category === state.category;
      const matchQuery =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);
      return matchCategory && matchQuery;
    });
  }

  function renderProducts() {
    const products = visibleProducts();
    if (!products.length) {
      el.grid.innerHTML = `<p class="muted">Tidak ada produk yang cocok.</p>`;
      return;
    }

    el.grid.innerHTML = products
      .map((product) => {
        const inCart = state.cart.get(product.id);
        const remaining = product.stock === null ? null : product.stock - (inCart?.qty ?? 0);
        const soldOut = remaining !== null && remaining <= 0;
        return `
          <button type="button" class="product-card" data-product="${product.id}" ${
            soldOut ? 'disabled' : ''
          }>
            <span class="pc-cat">${App.escapeHtml(product.category)}</span>
            <span class="pc-name">${App.escapeHtml(product.name)}</span>
            <span class="pc-price">${App.rupiah(product.price)}</span>
            <span class="pc-stock">${
              remaining === null ? 'Stok tersedia' : soldOut ? 'Stok habis' : `Sisa ${remaining}`
            }</span>
          </button>`;
      })
      .join('');
  }

  function renderCart() {
    if (!state.cart.size) {
      el.cartItems.innerHTML =
        '<div class="cart-empty">Keranjang masih kosong.<br>Pilih produk di samping.</div>';
    } else {
      el.cartItems.innerHTML = [...state.cart.values()]
        .map(
          ({ product, qty }) => `
          <div class="cart-item">
            <div>
              <div class="ci-name">${App.escapeHtml(product.name)}</div>
              <div class="ci-price">${App.rupiah(product.price)} × ${qty}</div>
            </div>
            <div class="ci-total">${App.rupiah(product.price * qty)}</div>
            <div class="qty-control">
              <button type="button" data-dec="${product.id}" aria-label="Kurangi">&minus;</button>
              <span class="qty">${qty}</span>
              <button type="button" data-inc="${product.id}" aria-label="Tambah">+</button>
            </div>
          </div>`
        )
        .join('');
    }
    renderTotals();
  }

  function renderTotals() {
    const { subtotal, discount, total, paid, change } = totals();
    el.subtotal.textContent = App.rupiah(subtotal);
    el.total.textContent = App.rupiah(total);

    if (state.method !== 'tunai') {
      el.paidField.style.display = 'none';
      el.changeBox.style.display = 'none';
    } else {
      el.paidField.style.display = '';
      el.changeBox.style.display = '';
      el.change.textContent = paid ? App.rupiah(Math.max(0, change)) : App.rupiah(0);
      el.changeBox.classList.toggle('negative', paid > 0 && change < 0);
      el.changeBox.firstElementChild.textContent =
        paid > 0 && change < 0 ? 'Uang kurang' : 'Kembalian';
    }
    el.checkout.disabled = state.cart.size === 0;
  }

  function addToCart(productId) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;
    const entry = state.cart.get(productId);
    const nextQty = (entry?.qty ?? 0) + 1;
    if (product.stock !== null && nextQty > product.stock) {
      App.toast(`Stok ${product.name} tidak mencukupi`, 'error');
      return;
    }
    state.cart.set(productId, { product, qty: nextQty });
    renderCart();
    renderProducts();
  }

  function changeQty(productId, delta) {
    const entry = state.cart.get(productId);
    if (!entry) return;
    const nextQty = entry.qty + delta;
    if (nextQty <= 0) {
      state.cart.delete(productId);
    } else {
      if (entry.product.stock !== null && nextQty > entry.product.stock) {
        App.toast(`Stok ${entry.product.name} tidak mencukupi`, 'error');
        return;
      }
      entry.qty = nextQty;
    }
    renderCart();
    renderProducts();
  }

  function renderReceipt(transaction) {
    const methodLabel = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' }[transaction.payment_method];
    const items = transaction.items
      .map(
        (item) => `
        <tr>
          <td colspan="2">${App.escapeHtml(item.name_snapshot)}</td>
        </tr>
        <tr>
          <td>${item.qty} x ${App.rupiah(item.price_snapshot)}</td>
          <td style="text-align:right">${App.rupiah(item.subtotal)}</td>
        </tr>`
      )
      .join('');

    el.receipt.innerHTML = `
      <div class="r-center">
        <div class="r-title">${App.escapeHtml(state.config.store_name)}</div>
        <div>${App.escapeHtml(state.config.queue_name)} &middot; Indonesia</div>
      </div>
      <div class="r-sep"></div>
      <div class="r-row"><span>${App.escapeHtml(transaction.code)}</span><span>${App.formatTime(
        transaction.created_at
      )}</span></div>
      <div class="r-row"><span>${App.formatDate(transaction.date)}</span></div>
      <div class="r-sep"></div>
      <table>${items}</table>
      <div class="r-sep"></div>
      <div class="r-row"><span>Subtotal</span><span>${App.rupiah(transaction.subtotal)}</span></div>
      ${
        transaction.discount
          ? `<div class="r-row"><span>Diskon</span><span>-${App.rupiah(transaction.discount)}</span></div>`
          : ''
      }
      <div class="r-row r-total"><span>Total</span><span>${App.rupiah(transaction.total)}</span></div>
      <div class="r-row"><span>${methodLabel}</span><span>${App.rupiah(transaction.paid)}</span></div>
      <div class="r-row"><span>Kembalian</span><span>${App.rupiah(transaction.change)}</span></div>
      <div class="r-sep"></div>
      <div class="r-center">${App.escapeHtml(state.config.receipt_footer)}</div>
    `;
  }

  async function loadProducts() {
    try {
      const data = await API.get('/api/products?active=1');
      state.products = data.products;
      renderCategories();
      renderProducts();
      renderCart();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  async function checkout() {
    if (!state.cart.size) return;
    const { discount, total, paid } = totals();

    if (state.method === 'tunai' && paid < total) {
      App.toast('Uang diterima kurang dari total', 'error');
      el.paid.focus();
      return;
    }

    el.checkout.disabled = true;
    el.checkout.textContent = 'Memproses…';
    try {
      const payload = {
        items: [...state.cart.values()].map(({ product, qty }) => ({
          product_id: product.id,
          qty,
        })),
        discount,
        paid: state.method === 'tunai' ? paid : total,
        payment_method: state.method,
      };
      const data = await API.post('/api/transactions', payload);
      renderReceipt(data.transaction);

      state.cart.clear();
      el.discount.value = '0';
      el.paid.value = '0';
      await loadProducts();
      App.openDialog(el.dialog);
      App.toast('Pembayaran berhasil disimpan', 'success');
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      el.checkout.textContent = 'Proses Pembayaran';
      renderTotals();
    }
  }

  el.grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-product]');
    if (button) addToCart(Number(button.dataset.product));
  });

  el.cartItems.addEventListener('click', (event) => {
    const inc = event.target.closest('[data-inc]');
    const dec = event.target.closest('[data-dec]');
    if (inc) changeQty(Number(inc.dataset.inc), 1);
    if (dec) changeQty(Number(dec.dataset.dec), -1);
  });

  el.categories.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    renderCategories();
    renderProducts();
  });

  el.search.addEventListener('input', () => renderProducts());
  el.discount.addEventListener('input', renderTotals);
  el.paid.addEventListener('input', renderTotals);

  document.querySelectorAll('[data-cash]').forEach((button) => {
    button.addEventListener('click', () => {
      const { total } = totals();
      el.paid.value =
        button.dataset.cash === 'exact'
          ? String(total)
          : String(Number(button.dataset.cash));
      renderTotals();
    });
  });

  document.getElementById('payment-method').addEventListener('click', (event) => {
    const button = event.target.closest('[data-method]');
    if (!button) return;
    state.method = button.dataset.method;
    document
      .querySelectorAll('#payment-method button')
      .forEach((b) => b.classList.toggle('active', b === button));
    renderTotals();
  });

  el.clear.addEventListener('click', async () => {
    if (!state.cart.size) return;
    if (await App.confirmAction({ title: 'Kosongkan keranjang?', confirmText: 'Ya, kosongkan' })) {
      state.cart.clear();
      renderCart();
      renderProducts();
    }
  });

  el.checkout.addEventListener('click', checkout);

  document.getElementById('print-receipt').addEventListener('click', () => window.print());

  document.getElementById('new-transaction').addEventListener('click', () => {
    App.closeDialog(el.dialog);
    el.search.value = '';
    state.category = 'Semua';
    renderCategories();
    renderProducts();
    renderTotals();
    el.search.focus();
  });

  el.dialog.addEventListener('close', () => {
    el.search.focus();
  });

  (async () => {
    state.config = await App.getConfig();
    await loadProducts();
    el.search.focus();
  })();
})();
