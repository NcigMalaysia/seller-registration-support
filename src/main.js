import { createClient } from '@supabase/supabase-js';
import './style.css';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const app = document.querySelector('#app');
const db = URL && KEY ? createClient(URL, KEY) : null;
const labels = { open: 'Open', in_progress: 'In Progress', solved: 'Solved' };
const state = { user: null, profile: null, cases: [], selected: null, filter: 'all', query: '', page: 0, hasMore: false };
const PAGE_SIZE = 100;

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

function loginScreen(message = '') {
  state.selected = null;
  app.innerHTML = `<main class="login-page"><section class="login-card"><div class="brand"><span class="brand-mark">S</span><span>Seller Support</span></div><h1>Log masuk</h1><p>Semak dan laporkan isu pendaftaran customer.</p><form id="login-form"><label class="field"><span>Username</span><input class="input" name="username" autocomplete="username" pattern="[a-zA-Z0-9_]{3,32}" required placeholder="Contoh: seller01"></label><label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="Masukkan password"></label><div id="notice" class="notice error" hidden></div><button class="btn btn-primary" type="submit">Log masuk</button></form></section></main>`;
  if (message) setNotice(message, true);
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username')).trim().toLowerCase();
    button.disabled = true;
    setNotice('');
    const { error } = await db.auth.signInWithPassword({ email: `${username}@seller.example.com`, password: String(data.get('password')) });
    button.disabled = false;
    if (error) { setNotice('Username atau password tidak sah.', true); return; }
    await loadAccount();
  });
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
  const { data: profile, error: profileError } = await db.from('profiles').select('id,username,display_name,role').eq('id', user.id).single();
  if (profileError || !profile) {
    await db.auth.signOut();
    loginScreen('Akaun ini belum diberikan akses. Sila hubungi admin.');
    return;
  }
  state.user = user;
  state.profile = profile;
  state.cases = [];
  state.page = 0;
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
  main.innerHTML = `<button class="btn btn-small back" id="back">← Kembali</button><div class="page-head"><div><p class="eyebrow">Seller · Laporan baharu</p><h1>Hantar isu pendaftaran</h1><p class="muted">Isi maklumat customer dan terangkan apa yang berlaku.</p></div></div><form class="card detail-box" id="case-form"><div class="detail-grid"><label class="field"><span>Nama customer *</span><input class="input" name="customer_name" maxlength="120" minlength="2" required></label><label class="field"><span>No. telefon customer *</span><input class="input" name="customer_phone" type="tel" maxlength="25" minlength="7" required></label><label class="field"><span>No. telefon seller *</span><input class="input" name="seller_phone" type="tel" maxlength="25" minlength="7" required></label><label class="field"><span>Unique code *</span><input class="input" name="unique_code" maxlength="80" required></label><label class="field detail-wide"><span>Komen / apa isu yang berlaku? *</span><textarea class="textarea" name="issue" minlength="5" maxlength="3000" required placeholder="Contoh: Customer sudah register tetapi unique code tidak keluar."></textarea></label></div><div id="notice" class="notice error" hidden></div><div class="form-actions"><button class="btn" type="button" id="cancel">Batal</button><button class="btn btn-primary" type="submit">Hantar isu</button></div></form>`;
  frame(main);
  main.querySelector('#back').addEventListener('click', () => dashboard());
  main.querySelector('#cancel').addEventListener('click', () => dashboard());
  main.querySelector('#case-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('[type=submit]');
    const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));
    if (Object.values(data).some(value => !value)) { setNotice('Semua ruangan wajib diisi.', true); return; }
    button.disabled = true;
    const { data: created, error } = await db.from('cases').insert({ ...data, seller_id: state.user.id }).select('id').single();
    button.disabled = false;
    if (error) { setNotice(`Tidak berjaya dihantar: ${errorText(error)}`, true); return; }
    state.query = ''; state.filter = 'all';
    await fetchCases(false);
    setNotice(`Isu berjaya dihantar. Case ID: ${caseId(created.id)}`);
  });
}

function detailScreen(item) {
  state.selected = item.id;
  const admin = state.profile.role === 'admin';
  const main = el('div');
  main.innerHTML = `<button class="btn btn-small back" id="back">← Kembali ke senarai</button><div class="page-head"><div><p class="eyebrow">Butiran kes</p><h1 id="detail-id"></h1><p class="muted" id="detail-date"></p></div><div id="detail-status"></div></div><section class="card detail-box"><h2>Laporan seller</h2><div class="detail-grid" id="details"></div><div class="admin-form" id="admin-section" hidden><h2>Tindakan admin</h2><form id="admin-form"><label class="field"><span>Status</span><select class="select" name="status"><option value="open">Open</option><option value="in_progress">In Progress</option><option value="solved">Solved</option></select></label><label class="field"><span>Admin remark</span><textarea class="textarea" name="admin_remark" maxlength="3000" placeholder="Kemas kini atau keputusan untuk seller"></textarea></label><div id="notice" class="notice error" hidden></div><div class="form-actions"><button class="btn btn-primary" type="submit">Simpan kemas kini</button><button class="btn" type="button" id="solve">Solve</button></div></form></div></section><p class="footer-note" id="updated"></p>`;
  frame(main);
  main.querySelector('#back').addEventListener('click', () => dashboard());
  main.querySelector('#detail-id').textContent = caseId(item.id);
  main.querySelector('#detail-date').textContent = `Dihantar pada ${date(item.created_at)}`;
  main.querySelector('#detail-status').append(el('span', labels[item.status], `badge badge-${item.status}`));
  const details = main.querySelector('#details');
  const fields = [['Nama customer', item.customer_name], ['No. telefon customer', item.customer_phone], ['No. telefon seller', item.seller_phone], ['Unique code', item.unique_code], ['Seller', admin ? state.sellers?.[item.seller_id]?.display_name || 'Seller' : state.profile.display_name], ['Status', labels[item.status]], ['Komen / isu', item.issue, true], ['Admin remark', item.admin_remark || 'Belum ada remark.', true]];
  fields.forEach(([label, value, wide]) => { const box = el('div'); if (wide) box.className = 'detail-wide'; box.append(el('label', label), el('p', value)); details.append(box); });
  main.querySelector('#updated').textContent = `Kemaskini terakhir: ${date(item.updated_at)}`;
  if (!admin) return;
  main.querySelector('#admin-section').hidden = false;
  const form = main.querySelector('#admin-form');
  form.elements.status.value = item.status;
  form.elements.admin_remark.value = item.admin_remark;
  form.addEventListener('submit', e => { e.preventDefault(); saveCase(item, form.elements.status.value, form.elements.admin_remark.value.trim()); });
  main.querySelector('#solve').addEventListener('click', () => saveCase(item, 'solved', form.elements.admin_remark.value.trim()));
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
