import { createClient } from '@supabase/supabase-js';
import './style.css';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector('#app');
const db = URL && KEY ? createClient(URL, KEY) : null;
const labels = { open: 'Open', in_progress: 'In Progress', solved: 'Solved' };
const state = { user: null, profile: null, cases: [], selected: null, filter: 'all', query: '', page: 0, hasMore: false };
const PAGE_SIZE = 100;
const IMAGE_BUCKET = 'case-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const setNotice = (message, error = false) => {
  const box = document.querySelector('#notice');
  if (!box) return;
  box.textContent = message;
  box.className = `notice${error ? ' error' : ''}`;
  box.hidden = !message;
};
const caseId = id => `REG-${String(id).padStart(6, '0')}`;
const date = value => new Intl.DateTimeFormat('ms-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(value));
const errorText = error => error?.message || 'Ada masalah. Sila cuba semula.';

async function validateImage(file) {
  if (!file) return '';
  if (!IMAGE_TYPES[file.type] || file.size > MAX_IMAGE_BYTES || !file.size) return 'Pilih gambar JPG, PNG atau WebP yang tidak melebihi 5 MB.';
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' && jpg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) return 'Format gambar tidak sepadan dengan fail. Pilih JPG, PNG atau WebP.';
  return '';
}

async function attachImage(caseItem, file) {
  const path = `${state.user.id}/${caseItem.id}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const { error: uploadError } = await db.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return uploadError;
  const { error } = await db.from('case_images').insert({ case_id: caseItem.id, storage_path: path });
  if (error) { await db.storage.from(IMAGE_BUCKET).remove([path]); return error; }
  return null;
}

function loginScreen(message = '') {
  state.selected = null;
  app.innerHTML = `<main class="login-page"><section class="login-card"><div class="brand"><span class="brand-mark">S</span><span>Seller Support</span></div><h1>Log masuk</h1><p>Semak dan laporkan isu pendaftaran customer.</p><form id="login-form"><label class="field"><span>Username atau email</span><input class="input" name="username" autocomplete="username" required placeholder="seller01 atau email anda"></label><label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="Masukkan password"></label><div id="notice" class="notice error" hidden></div><button class="btn btn-primary" type="submit">Log masuk</button></form><p class="auth-switch">Seller baharu? <button class="text-button" id="show-register" type="button">Daftar akaun</button></p></section></main>`;
  if (message) setNotice(message, true);
  document.querySelector('#show-register').addEventListener('click', () => registrationScreen());
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username')).trim().toLowerCase();
    const email = username.includes('@') ? username : /^[a-z0-9_]{3,32}$/.test(username) ? `${username}@seller.example.com` : '';
    if (!email) { setNotice('Masukkan username atau email yang sah.', true); return; }
    button.disabled = true;
    setNotice('');
    const { error } = await db.auth.signInWithPassword({ email, password: String(data.get('password')) });
    button.disabled = false;
    if (error) { setNotice('Email/username atau password tidak sah.', true); return; }
    await loadAccount();
  });
}

function registrationScreen(message = '') {
  app.innerHTML = `<main class="login-page"><section class="login-card"><div class="brand"><span class="brand-mark">S</span><span>Seller Support</span></div><h1>Daftar sebagai seller</h1><p>Gunakan email sendiri. Admin perlu meluluskan akaun sebelum anda boleh hantar isu.</p><form id="register-form"><label class="field"><span>Nama seller</span><input class="input" name="display_name" maxlength="120" minlength="2" autocomplete="name" required></label><label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label><label class="field"><span>Password baharu</span><input class="input" name="password" type="password" minlength="8" autocomplete="new-password" required></label><label class="field"><span>Ulang password</span><input class="input" name="confirm_password" type="password" minlength="8" autocomplete="new-password" required></label><div id="notice" class="notice" hidden></div><button class="btn btn-primary" type="submit">Daftar akaun</button></form><p class="auth-switch">Sudah ada akaun? <button class="text-button" id="show-login" type="button">Log masuk</button></p></section></main>`;
  if (message) setNotice(message);
  document.querySelector('#show-login').addEventListener('click', () => loginScreen());
  document.querySelector('#register-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const display_name = String(values.get('display_name')).trim();
    const email = String(values.get('email')).trim().toLowerCase();
    const password = String(values.get('password'));
    if (display_name.length < 2 || password !== String(values.get('confirm_password'))) {
      setNotice('Semak nama dan pastikan kedua-dua password sama.', true); return;
    }
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    setNotice('');
    const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name }, emailRedirectTo: location.origin + location.pathname } });
    button.disabled = false;
    if (error) {
      setNotice(error.code === 'email_address_not_authorized'
        ? 'Pendaftaran email belum tersedia. Hubungi admin untuk mengaktifkan penghantaran email.'
        : `Pendaftaran gagal: ${errorText(error)}`, true);
      return;
    }
    if (data.session) { await loadAccount(); return; }
    form.reset();
    setNotice('Pendaftaran diterima. Semak email untuk pengesahan, kemudian log masuk. Akaun boleh digunakan selepas admin meluluskan.');
  });
}

function pendingScreen() {
  const main = el('div');
  main.innerHTML = `<div class="page-head"><div><p class="eyebrow">Seller · Menunggu kelulusan</p><h1>Akaun belum diluluskan</h1><p class="muted">Admin akan semak pendaftaran anda. Klik Semak semula selepas diluluskan.</p></div><button class="btn" id="check-approval">Semak semula</button></div><section class="card detail-box"><p>Anda belum boleh menghantar atau melihat kes selagi akaun ini menunggu kelulusan.</p></section>`;
  frame(main);
  main.querySelector('#check-approval').addEventListener('click', loadAccount);
}

function frame(content) {
  app.innerHTML = `<header class="topbar"><div class="shell"><div class="brand"><span class="brand-mark">S</span><span>Seller Support</span></div><div class="top-right"><span class="user-label" id="user-label"></span><button class="btn btn-small btn-quiet" id="signout">Log keluar</button></div></div></header><main class="shell main" id="content"></main>`;
  document.querySelector('#user-label').textContent = `${state.profile.display_name} · ${state.profile.role === 'admin' ? 'Admin' : 'Seller'}`;
  document.querySelector('#content').append(content);
  document.querySelector('#signout').addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.profile = null; loginScreen(); });
}

async function loadAccount() {
  app.innerHTML = '<div class="loading">Memuatkan akaun…</div>';
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) { loginScreen(); return; }
  const { data: profile, error: profileError } = await db.from('profiles').select('id,username,display_name,role,approved_at').eq('id', user.id).single();
  if (profileError || !profile) {
    await db.auth.signOut();
    loginScreen('Akaun ini belum diberikan akses. Sila hubungi admin.');
    return;
  }
  state.user = user;
  state.profile = profile;
  state.cases = [];
  state.page = 0;
  if (profile.role === 'seller' && !profile.approved_at) { pendingScreen(); return; }
  await fetchCases(false);
}

async function fetchCases(append = false) {
  if (!append) { state.page = 0; state.cases = []; }
  let query = db.from('cases').select('id,seller_id,customer_name,customer_phone,seller_phone,unique_code,issue,status,admin_remark,created_at,updated_at,solved_at').order('created_at', { ascending: false }).order('id', { ascending: false }).range(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE - 1);
  if (state.profile.role === 'seller') query = query.eq('seller_id', state.user.id);
  const { data, error } = await query;
  if (error) { dashboard(`Tidak dapat memuatkan kes: ${errorText(error)}`); return; }
  state.cases = append ? [...state.cases, ...data] : data;
  state.hasMore = data.length === PAGE_SIZE;
  state.page++;
  if (state.profile.role === 'admin') {
    const ids = [...new Set(data.map(item => item.seller_id))];
    if (ids.length) {
      const { data: profiles } = await db.from('profiles').select('id,display_name,username').in('id', ids);
      state.sellers = { ...(state.sellers || {}), ...Object.fromEntries((profiles || []).map(item => [item.id, item])) };
    }
  }
  dashboard();
}

function dashboard(message = '') {
  state.selected = null;
  const main = el('div');
  main.innerHTML = `<div class="page-head"><div><p class="eyebrow" id="role-title"></p><h1 id="page-title"></h1><p class="muted" id="page-subtitle"></p></div><div id="head-actions"></div></div><section class="stats"><div class="card stat"><strong id="count-all"></strong><span>Kes dipaparkan</span></div><div class="card stat"><strong id="count-active"></strong><span>Belum selesai</span></div><div class="card stat"><strong id="count-solved"></strong><span>Solved</span></div></section><section class="card"><div class="toolbar"><h2>Senarai kes</h2><div class="toolbar-controls"><input class="input" id="search" type="search" placeholder="Cari kes / customer…" aria-label="Cari kes"><select class="select" id="filter" aria-label="Tapis status"><option value="all">Semua status</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="solved">Solved</option></select><button class="btn btn-small" id="refresh">Refresh</button></div></div><div class="table-wrap"><table><thead><tr id="head-row"></tr></thead><tbody id="case-rows"></tbody></table></div><div id="load-row" class="load-row" hidden><button class="btn btn-small" id="load-more">Muat lagi</button></div></section><p class="footer-note">Masa dipaparkan mengikut waktu Malaysia. Gunakan Refresh untuk melihat perubahan terkini.</p><div id="notice" class="notice error" hidden></div>`;
  frame(main);
  const admin = state.profile.role === 'admin';
  if (admin) {
    const approvals = el('section', null, 'card approvals');
    approvals.id = 'pending-sellers';
    approvals.innerHTML = `<div class="approval-head"><h2>Pendaftaran seller menunggu kelulusan <span class="pending-count">…</span></h2><button class="btn btn-small" id="refresh-pending">Refresh</button></div><div class="pending-list"></div>`;
    main.querySelector('.stats').before(approvals);
    approvals.querySelector('#refresh-pending').addEventListener('click', loadPendingSellers);
  }
  main.querySelector('#role-title').textContent = admin ? 'Admin dashboard' : 'Seller dashboard';
  main.querySelector('#page-title').textContent = admin ? 'Semua isu seller' : 'Kes pendaftaran saya';
  main.querySelector('#page-subtitle').textContent = admin ? 'Semak laporan dan berikan keputusan kepada seller.' : 'Laporkan isu dan semak kemas kini daripada admin.';
  if (!admin) {
    const btn = el('button', '+ Hantar isu', 'btn btn-primary');
    btn.addEventListener('click', submitScreen);
    main.querySelector('#head-actions').append(btn);
  }
  const headings = admin ? ['Case ID', 'Customer', 'Seller', 'Tarikh', 'Status', ''] : ['Case ID', 'Customer', 'Tarikh', 'Status', ''];
  headings.forEach(value => main.querySelector('#head-row').append(el('th', value)));
  main.querySelector('#search').value = state.query;
  main.querySelector('#filter').value = state.filter;
  main.querySelector('#search').addEventListener('input', e => { state.query = e.target.value; renderRows(); });
  main.querySelector('#filter').addEventListener('change', e => { state.filter = e.target.value; renderRows(); });
  main.querySelector('#refresh').addEventListener('click', () => fetchCases(false));
  main.querySelector('#load-more').addEventListener('click', () => fetchCases(true));
  if (message) setNotice(message, true);
  renderRows();
  if (admin) loadPendingSellers();
}

async function loadPendingSellers() {
  const { data, error } = await db.from('profiles').select('id,display_name,email,created_at').eq('role', 'seller').is('approved_at', null).order('created_at', { ascending: true });
  const section = document.querySelector('#pending-sellers');
  if (!section) return;
  if (error) { section.querySelector('.pending-list').textContent = `Tidak dapat memuatkan pendaftaran: ${errorText(error)}`; return; }
  section.querySelector('.pending-count').textContent = String(data.length);
  const list = section.querySelector('.pending-list');
  list.replaceChildren();
  if (!data.length) { list.append(el('p', 'Tiada pendaftaran menunggu kelulusan.', 'muted')); return; }
  for (const seller of data) {
    const row = el('div', null, 'approval-row');
    const info = el('div');
    info.append(el('strong', seller.display_name), el('span', seller.email || 'Email tidak tersedia', 'small-muted'));
    const approve = el('button', 'Luluskan', 'btn btn-small btn-primary');
    approve.addEventListener('click', async () => {
      approve.disabled = true;
      const { error: approveError } = await db.from('profiles').update({ approved_at: new Date().toISOString() }).eq('id', seller.id);
      if (approveError) { approve.disabled = false; setNotice(`Kelulusan gagal: ${errorText(approveError)}`, true); return; }
      await loadPendingSellers();
    });
    row.append(info, approve);
    list.append(row);
  }
}

function renderRows() {
  const rows = document.querySelector('#case-rows');
  const admin = state.profile.role === 'admin';
  const search = state.query.trim().toLowerCase();
  const filtered = state.cases.filter(item => (state.filter === 'all' || item.status === state.filter) && (!search || [caseId(item.id), item.customer_name, item.customer_phone, item.unique_code, state.sellers?.[item.seller_id]?.display_name].some(value => String(value || '').toLowerCase().includes(search))));
  rows.replaceChildren();
  if (!filtered.length) {
    const row = el('tr'); const cell = el('td', state.cases.length ? 'Tiada kes yang sepadan.' : 'Belum ada kes.');
    cell.colSpan = admin ? 6 : 5; cell.className = 'empty'; row.append(cell); rows.append(row);
  }
  for (const item of filtered) {
    const row = el('tr');
    row.append(el('td', caseId(item.id), 'case-id'));
    const customer = el('td', item.customer_name); customer.append(el('span', item.customer_phone, 'small-muted')); row.append(customer);
    if (admin) row.append(el('td', state.sellers?.[item.seller_id]?.display_name || 'Seller'));
    row.append(el('td', date(item.created_at)));
    const status = el('td'); status.append(el('span', labels[item.status], `badge badge-${item.status}`)); row.append(status);
    const action = el('td'); const button = el('button', 'Lihat', 'btn btn-small');
    button.addEventListener('click', () => detailScreen(item)); action.append(button); row.append(action); rows.append(row);
  }
  document.querySelector('#count-all').textContent = state.cases.length + (state.hasMore ? '+' : '');
  document.querySelector('#count-active').textContent = state.cases.filter(c => c.status !== 'solved').length + (state.hasMore ? '+' : '');
  document.querySelector('#count-solved').textContent = state.cases.filter(c => c.status === 'solved').length + (state.hasMore ? '+' : '');
  document.querySelector('#load-row').hidden = !state.hasMore;
}

function submitScreen() {
  const main = el('div');
  main.innerHTML = `<button class="btn btn-small back" id="back">← Kembali</button><div class="page-head"><div><p class="eyebrow">Seller · Laporan baharu</p><h1>Hantar isu pendaftaran</h1><p class="muted">Isi maklumat customer dan terangkan apa yang berlaku.</p></div></div><form class="card detail-box" id="case-form"><div class="detail-grid"><label class="field"><span>Nama customer *</span><input class="input" name="customer_name" maxlength="120" minlength="2" required></label><label class="field"><span>No. telefon customer *</span><input class="input" name="customer_phone" type="tel" maxlength="25" minlength="7" required></label><label class="field"><span>No. telefon seller *</span><input class="input" name="seller_phone" type="tel" maxlength="25" minlength="7" required></label><label class="field"><span>Unique code *</span><input class="input" name="unique_code" maxlength="80" required></label><label class="field detail-wide"><span>Komen / apa isu yang berlaku? *</span><textarea class="textarea" name="issue" minlength="5" maxlength="3000" required placeholder="Contoh: Customer sudah register tetapi unique code tidak keluar."></textarea></label><label class="field detail-wide"><span>Gambar (pilihan)</span><input class="input" name="image" type="file" accept="image/jpeg,image/png,image/webp"><small>Satu gambar JPG, PNG atau WebP, maksimum 5 MB.</small></label></div><div id="notice" class="notice error" hidden></div><div class="form-actions"><button class="btn" type="button" id="cancel">Batal</button><button class="btn btn-primary" type="submit">Hantar isu</button></div></form>`;
  frame(main);
  main.querySelector('#back').addEventListener('click', () => dashboard());
  main.querySelector('#cancel').addEventListener('click', () => dashboard());
  main.querySelector('#case-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('[type=submit]');
    const image = form.elements.image.files[0];
    const imageError = await validateImage(image);
    if (imageError) { setNotice(imageError, true); return; }
    const data = Object.fromEntries([...new FormData(form)].filter(([key]) => key !== 'image').map(([key, value]) => [key, String(value).trim()]));
    if (Object.values(data).some(value => !value)) { setNotice('Semua ruangan wajib diisi.', true); return; }
    button.disabled = true;
    const { data: created, error } = await db.from('cases').insert({ ...data, seller_id: state.user.id }).select('id').single();
    if (error) { button.disabled = false; setNotice(`Tidak berjaya dihantar: ${errorText(error)}`, true); return; }
    const uploadError = image ? await attachImage(created, image) : null;
    button.disabled = false;
    state.query = ''; state.filter = 'all';
    await fetchCases(false);
    setNotice(uploadError
      ? `Isu ${caseId(created.id)} disimpan, tetapi gambar gagal dimuat naik: ${errorText(uploadError)}. Buka kes ini untuk cuba lagi.`
      : `Isu berjaya dihantar. Case ID: ${caseId(created.id)}`, Boolean(uploadError));
  });
}

function detailScreen(item) {
  state.selected = item.id;
  const admin = state.profile.role === 'admin';
  const main = el('div');
  main.innerHTML = `<button class="btn btn-small back" id="back">← Kembali ke senarai</button><div class="page-head"><div><p class="eyebrow">Butiran kes</p><h1 id="detail-id"></h1><p class="muted" id="detail-date"></p></div><div id="detail-status"></div></div><section class="card detail-box"><h2>Laporan seller</h2><div class="detail-grid" id="details"></div><div class="image-section" id="case-image"><h2>Gambar lampiran</h2><p class="muted">Memuatkan gambar…</p></div><div class="admin-form" id="admin-section" hidden><h2>Tindakan admin</h2><form id="admin-form"><label class="field"><span>Status</span><select class="select" name="status"><option value="open">Open</option><option value="in_progress">In Progress</option><option value="solved">Solved</option></select></label><label class="field"><span>Admin remark</span><textarea class="textarea" name="admin_remark" maxlength="3000" placeholder="Kemas kini atau keputusan untuk seller"></textarea></label><div class="form-actions"><button class="btn btn-primary" type="submit">Simpan kemas kini</button><button class="btn" type="button" id="solve">Solve</button></div></form></div><div id="notice" class="notice error" hidden></div><div class="delete-actions"><button class="btn btn-danger" type="button" id="delete-case">Padam kes</button></div></section><p class="footer-note" id="updated"></p>`;
  frame(main);
  main.querySelector('#back').addEventListener('click', () => dashboard());
  main.querySelector('#detail-id').textContent = caseId(item.id);
  main.querySelector('#detail-date').textContent = `Dihantar pada ${date(item.created_at)}`;
  main.querySelector('#detail-status').append(el('span', labels[item.status], `badge badge-${item.status}`));
  const details = main.querySelector('#details');
  const fields = [['Nama customer', item.customer_name], ['No. telefon customer', item.customer_phone], ['No. telefon seller', item.seller_phone], ['Unique code', item.unique_code], ['Seller', admin ? state.sellers?.[item.seller_id]?.display_name || 'Seller' : state.profile.display_name], ['Status', labels[item.status]], ['Komen / isu', item.issue, true], ['Admin remark', item.admin_remark || 'Belum ada remark.', true]];
  fields.forEach(([label, value, wide]) => { const box = el('div'); if (wide) box.className = 'detail-wide'; box.append(el('label', label), el('p', value)); details.append(box); });
  loadCaseImage(item);
  main.querySelector('#delete-case').addEventListener('click', () => deleteCase(item));
  main.querySelector('#updated').textContent = `Kemaskini terakhir: ${date(item.updated_at)}`;
  if (!admin) return;
  main.querySelector('#admin-section').hidden = false;
  const form = main.querySelector('#admin-form');
  form.elements.status.value = item.status;
  form.elements.admin_remark.value = item.admin_remark;
  form.addEventListener('submit', e => { e.preventDefault(); saveCase(item, form.elements.status.value, form.elements.admin_remark.value.trim()); });
  main.querySelector('#solve').addEventListener('click', () => saveCase(item, 'solved', form.elements.admin_remark.value.trim()));
}

async function loadCaseImage(item) {
  const { data, error } = await db.from('case_images').select('storage_path').eq('case_id', item.id).maybeSingle();
  if (state.selected !== item.id) return;
  const section = document.querySelector('#case-image');
  if (!section) return;
  section.replaceChildren(el('h2', 'Gambar lampiran'));
  if (error) { section.append(el('p', `Gambar tidak dapat dimuatkan: ${errorText(error)}`, 'muted')); return; }
  if (data) {
    const { data: signed, error: signError } = await db.storage.from(IMAGE_BUCKET).createSignedUrl(data.storage_path, 300);
    if (state.selected !== item.id) return;
    if (signError) { section.append(el('p', `Gambar tidak dapat dibuka: ${errorText(signError)}`, 'muted')); return; }
    const link = el('a'); link.href = signed.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const image = el('img'); image.src = signed.signedUrl; image.alt = `Gambar untuk kes ${caseId(item.id)}`; image.className = 'case-image';
    link.append(image); section.append(link, el('p', 'Klik gambar untuk lihat saiz penuh.', 'small-muted'));
    return;
  }
  if (state.profile.role === 'admin') { section.append(el('p', 'Tiada gambar dilampirkan.', 'muted')); return; }
  const form = el('form'); form.className = 'attach-form';
  form.innerHTML = `<label class="field"><span>Tambah gambar (pilihan)</span><input class="input" type="file" name="image" accept="image/jpeg,image/png,image/webp" required><small>JPG, PNG atau WebP, maksimum 5 MB.</small></label><button class="btn btn-small" type="submit">Muat naik gambar</button>`;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const file = form.elements.image.files[0];
    const validation = await validateImage(file);
    if (validation) { setNotice(validation, true); return; }
    const button = form.querySelector('button'); button.disabled = true; setNotice('');
    const uploadError = await attachImage(item, file);
    button.disabled = false;
    if (uploadError) { setNotice(`Gambar gagal dimuat naik: ${errorText(uploadError)}`, true); return; }
    await loadCaseImage(item);
    setNotice('Gambar berjaya dimuat naik.');
  });
  section.append(el('p', 'Belum ada gambar untuk kes ini.', 'muted'), form);
}

async function deleteCase(item) {
  if (!window.confirm(`Padam ${caseId(item.id)}? Semua maklumat kes dan gambar lampiran akan dipadam. Tindakan ini tidak boleh dibatalkan.`)) return;
  const button = document.querySelector('#delete-case'); button.disabled = true; setNotice('');
  const { data: image, error: imageError } = await db.from('case_images').select('storage_path').eq('case_id', item.id).maybeSingle();
  if (imageError) { button.disabled = false; setNotice(`Tidak dapat semak gambar: ${errorText(imageError)}`, true); return; }
  const { data, error } = await db.from('cases').delete().eq('id', item.id).select('id').maybeSingle();
  if (error || !data) { button.disabled = false; setNotice(`Kes tidak dapat dipadam: ${errorText(error)}`, true); return; }
  const { error: storageError } = image ? await db.storage.from(IMAGE_BUCKET).remove([image.storage_path]) : { error: null };
  await fetchCases(false);
  setNotice(storageError
    ? `Kes ${caseId(item.id)} dipadam, tetapi pembersihan gambar gagal. Maklumkan admin: ${errorText(storageError)}`
    : `Kes ${caseId(item.id)} dan gambarnya telah dipadam.`, Boolean(storageError));
}

async function saveCase(item, status, remark) {
  const form = document.querySelector('#admin-form');
  form.querySelectorAll('button').forEach(button => { button.disabled = true; });
  setNotice('');
  const { data, error } = await db.from('cases').update({ status, admin_remark: remark }).eq('id', item.id).select().single();
  form.querySelectorAll('button').forEach(button => { button.disabled = false; });
  if (error) { setNotice(`Tidak berjaya disimpan: ${errorText(error)}`, true); return; }
  state.cases = state.cases.map(c => c.id === item.id ? data : c);
  detailScreen(data);
  setNotice(status === 'solved' ? 'Kes ditandakan Solved.' : 'Kemas kini berjaya disimpan.');
}

async function boot() {
  if (!db) { app.innerHTML = '<div class="loading">Konfigurasi belum lengkap. Tetapkan VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY seperti README.</div>'; return; }
  await loadAccount();
}
boot();
