(() => {
  let products = [];
  const el = {
    body: document.getElementById('product-body'),
    count: document.getElementById('product-count'),
    search: document.getElementById('search'),
    dialog: document.getElementById('product-dialog'),
    form: document.getElementById('product-form'),
    title: document.getElementById('form-title'),
    id: document.getElementById('product-id'),
    name: document.getElementById('name'),
    category: document.getElementById('category'),
    price: document.getElementById('price'),
    stock: document.getElementById('stock'),
    active: document.getElementById('is-active'),
    save: document.getElementById('save-product'),
  };

  function filtered() {
    const query = el.search.value.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
    );
  }

  function render() {
    const list = filtered();
    el.count.textContent = `${products.length} produk`;
    if (!list.length) {
      el.body.innerHTML = `<tr><td colspan="6" class="empty"><strong>Tidak ada produk</strong>Tambahkan produk baru untuk mulai berjualan.</td></tr>`;
      return;
    }

    el.body.innerHTML = list
      .map((product) => {
        const stockLabel =
          product.stock === null
            ? '<span class="muted">Tanpa batas</span>'
            : product.stock === 0
              ? '<span class="badge badge-red">Habis</span>'
              : String(product.stock);
        return `
          <tr>
            <td class="strong">${App.escapeHtml(product.name)}</td>
            <td><span class="badge">${App.escapeHtml(product.category)}</span></td>
            <td class="num">${App.rupiah(product.price)}</td>
            <td class="num">${stockLabel}</td>
            <td>${
              product.is_active
                ? '<span class="badge badge-green">Aktif</span>'
                : '<span class="badge badge-red">Nonaktif</span>'
            }</td>
            <td class="text-right">
              <button class="btn btn-secondary btn-sm" type="button" data-action="edit" data-id="${product.id}">Edit</button>
              <button class="btn btn-secondary btn-sm" type="button" data-action="toggle" data-id="${product.id}">${
                product.is_active ? 'Nonaktifkan' : 'Aktifkan'
              }</button>
              <button class="btn btn-ghost btn-sm" type="button" data-action="delete" data-id="${product.id}" style="color:var(--red)">Hapus</button>
            </td>
          </tr>`;
      })
      .join('');
  }

  async function load() {
    try {
      const data = await API.get('/api/products');
      products = data.products;
      render();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  function openForm(product = null) {
    el.form.reset();
    el.id.value = product?.id ?? '';
    el.title.textContent = product ? 'Edit Produk' : 'Tambah Produk';
    el.save.textContent = product ? 'Simpan Perubahan' : 'Simpan';
    el.name.value = product?.name ?? '';
    el.category.value = product?.category ?? '';
    el.price.value = product?.price ?? '';
    el.stock.value = product?.stock ?? '';
    el.active.checked = product ? Boolean(product.is_active) : true;
    App.openDialog(el.dialog);
    el.name.focus();
  }

  async function submit(event) {
    event.preventDefault();
    const payload = {
      name: el.name.value.trim(),
      category: el.category.value.trim() || 'Lainnya',
      price: Number(el.price.value),
      stock: el.stock.value === '' ? null : Number(el.stock.value),
      is_active: el.active.checked,
    };

    if (!payload.name) {
      App.toast('Nama produk wajib diisi', 'error');
      el.name.focus();
      return;
    }
    if (!Number.isInteger(payload.price) || payload.price < 0) {
      App.toast('Harga tidak valid', 'error');
      el.price.focus();
      return;
    }

    el.save.disabled = true;
    try {
      const id = el.id.value;
      if (id) {
        await API.put(`/api/products/${id}`, payload);
        App.toast('Produk diperbarui', 'success');
      } else {
        await API.post('/api/products', payload);
        App.toast('Produk ditambahkan', 'success');
      }
      App.closeDialog(el.dialog);
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      el.save.disabled = false;
    }
  }

  async function handleAction(action, id) {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    if (action === 'edit') {
      openForm(product);
      return;
    }

    if (action === 'toggle') {
      try {
        await API.put(`/api/products/${id}`, {
          name: product.name,
          category: product.category,
          price: product.price,
          stock: product.stock,
          is_active: !product.is_active,
        });
        await load();
      } catch (error) {
        App.toast(error.message, 'error');
      }
      return;
    }

    if (action === 'delete') {
      const ok = await App.confirmAction({
        title: 'Hapus produk?',
        message: `"${product.name}" akan dihapus. Riwayat transaksi lama tetap aman.`,
        confirmText: 'Hapus',
      });
      if (!ok) return;
      try {
        await API.remove(`/api/products/${id}`);
        App.toast('Produk dihapus', 'success');
        await load();
      } catch (error) {
        App.toast(error.message, 'error');
      }
    }
  }

  document.getElementById('add-product').addEventListener('click', () => openForm());
  el.body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button.dataset.action, Number(button.dataset.id));
  });
  el.form.addEventListener('submit', submit);
  el.search.addEventListener('input', App.debounce(render, 150));

  load();
})();
