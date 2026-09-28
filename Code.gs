/**
 * TRACKING PRODUKSI — PT MURINDA SENTRA BAJA  |  Backend API (Code.gs)
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me  |  Who has access: Anyone
 * Salin URL (…/exec) lalu tempel ke API_URL di index.html.
 * Setiap mengubah kode ini: Deploy > Manage deployments > Edit > New version.
 */
const SPREADSHEET_ID = '12wD3JxDh6E0hXOqgR0tujE2a6NVjGaTQ4rxOeki0-oo';
const SHEET_TRACKING = 'Tracking_Produksi';
const SHEET_LOGIN    = 'Login';

// true  = unit Counterweight harus menyelesaikan tahap Builtup (P–U) dulu sebelum Assembly (V).
// false = unit Counterweight langsung mulai dari Assembly.
const CW_WAIT_BUILTUP = true;

const COL = { NO_SO:1, TGL_SO:2, CUSTOMER:3, KODE_PRODUK:4, SERIAL_NUMBER:5, KODE_SERIAL:6, QTY:7,
  SATUAN:8, BERAT:9, TGL_KIRIM:10, SISA_HARI:11, STATUS_SO:12, NO_PO:13, KATEGORI:14, CATATAN:15 };
const NUM_COLS = 29;

// grp: B = Builtup (P–U), C = Counterweight (V–AB), D = Delivery (AC)
const STAGES = [
  { key:'WEB',             label:'WEB',              col:16, grp:'B' },
  { key:'FLANGE1',         label:'Flange 1',         col:17, grp:'B' },
  { key:'FLANGE2',         label:'Flange 2',         col:18, grp:'B' },
  { key:'ASSY_BUILTUP',    label:'Assembly Builtup', col:19, grp:'B' },
  { key:'WELDING_BUILTUP', label:'Welding Builtup',  col:20, grp:'B' },
  { key:'FINISH_BUILTUP',  label:'Finish Builtup',   col:21, grp:'B' },
  { key:'ASSEMBLY',        label:'Assembly',         col:22, grp:'C' },
  { key:'WELDING',         label:'Welding',          col:23, grp:'C' },
  { key:'LEAKTEST',        label:'Leaktest',         col:24, grp:'C' },
  { key:'FILLING',         label:'Filling Concrete', col:25, grp:'C' },
  { key:'COVERING',        label:'Covering',         col:26, grp:'C' },
  { key:'ALIGNMENT',       label:'Alignment',        col:27, grp:'C' },
  { key:'PAINTING',        label:'Painting',         col:28, grp:'C' },
  { key:'DELIVERY',        label:'Delivery',         col:29, grp:'D' }
];

const ROLE_STAGE_MAP = {
  'developer':'ALL', 'pic komponen':'ALL', 'pic web':'WEB', 'pic flange 1':'FLANGE1',
  'pic flae 2':'FLANGE2', 'pic flange 2':'FLANGE2', 'pic assy builtup':'ASSY_BUILTUP',
  'pic welding buitup':'WELDING_BUILTUP', 'pic welding builtup':'WELDING_BUILTUP',
  'pic finish builtup':'FINISH_BUILTUP', 'pic assy cw':'ASSEMBLY', 'pic welding cw':'WELDING',
  'pic leaktest':'LEAKTEST', 'pic filling':'FILLING', 'pic covering':'COVERING',
  'pic alignment':'ALIGNMENT', 'pic painting':'PAINTING', 'pic delivery':'DELIVERY'
};

/* ---------------------------- API ---------------------------- */
function doGet() { return json_({ success: true, app: 'Tracking Produksi MSB API' }); }

function doPost(e) {
  try {
    const b = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (b.action === 'data')   return json_(getTrackingData_());
    if (b.action === 'login')  return json_(handleLogin_(b.username, b.password));
    if (b.action === 'update') return json_(handleUpdateStage_(b.row, b.stageKey, b.kodeSerial, b.username, b.undo));
    return json_({ success: false, message: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ success: false, message: 'Server error: ' + err });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* --------------------------- HELPERS -------------------------- */
function getSS_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function fmtDate_(v) {
  if (!v) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
}

function kategoriOf_(v) {
  return String(v || '').toLowerCase().indexOf('builtup') >= 0 ? 'Builtup' : 'Counterweight';
}

// Urutan tahap yang berlaku per kategori
function flowKeys_(kategori) {
  const isB = kategori === 'Builtup';
  return STAGES.filter(s => isB ? s.grp !== 'C' : (s.grp !== 'B' || CW_WAIT_BUILTUP)).map(s => s.key);
}

function getFlows_() { return { Builtup: flowKeys_('Builtup'), Counterweight: flowKeys_('Counterweight') }; }

function findAccount_(username) {
  const sh = getSS_().getSheetByName(SHEET_LOGIN);
  const n = sh.getLastRow();
  if (n < 2) return null;
  const u0 = String(username || '').trim().toLowerCase();
  for (const r of sh.getRange(2, 1, n - 1, 5).getValues()) {
    if (String(r[0] || '').trim().toLowerCase() === u0 && u0) {
      return { username: String(r[0]).trim(), password: String(r[1] || '').trim(), nama: r[2] || String(r[0]).trim(),
               role: String(r[3] || '').trim(), status: String(r[4] || '').trim() };
    }
  }
  return null;
}

function getTrackingData_() {
  const sh = getSS_().getSheetByName(SHEET_TRACKING);
  const n = sh.getLastRow();
  const base = { success: true, stages: STAGES, flows: getFlows_(), generatedAt: new Date().toISOString() };
  if (n < 2) return Object.assign(base, { rows: [] });

  const rows = [];
  sh.getRange(2, 1, n - 1, NUM_COLS).getValues().forEach((r, i) => {
    if (!r[COL.NO_SO - 1] && !r[COL.KODE_SERIAL - 1]) return;
    const stages = {};
    STAGES.forEach(st => { const v = r[st.col - 1]; stages[st.key] = v ? new Date(v).toISOString() : null; });
    rows.push({
      row: i + 2, noSO: r[COL.NO_SO - 1], tglSO: fmtDate_(r[COL.TGL_SO - 1]),
      customer: r[COL.CUSTOMER - 1] || '(Tanpa Customer)', kodeProduk: r[COL.KODE_PRODUK - 1],
      serialNumber: r[COL.SERIAL_NUMBER - 1], kodeSerial: r[COL.KODE_SERIAL - 1], qty: r[COL.QTY - 1],
      satuan: r[COL.SATUAN - 1], berat: r[COL.BERAT - 1], tglKirim: fmtDate_(r[COL.TGL_KIRIM - 1]),
      statusSO: r[COL.STATUS_SO - 1], noPO: r[COL.NO_PO - 1], kategori: kategoriOf_(r[COL.KATEGORI - 1]),
      catatan: r[COL.CATATAN - 1], stages: stages
    });
  });
  return Object.assign(base, { rows: rows });
}

function handleLogin_(username, password) {
  password = String(password || '').trim();
  if (!String(username || '').trim() || !password) return { success: false, message: 'Username & password wajib diisi' };
  const a = findAccount_(username);
  if (!a || a.password !== password) return { success: false, message: 'Username atau password salah' };
  if (a.status.toLowerCase() !== 'aktif') return { success: false, message: 'Akun tidak aktif. Hubungi admin.' };
  const stageKey = ROLE_STAGE_MAP[a.role.toLowerCase()];
  if (!stageKey) return { success: false, message: 'Role "' + a.role + '" belum dipetakan ke tahap produksi. Hubungi admin.' };
  const st = STAGES.find(s => s.key === stageKey);
  return { success: true, username: a.username, nama: a.nama, role: a.role, stageKey: stageKey,
           stageLabel: st ? st.label : 'Semua Tahap' };
}

function handleUpdateStage_(row, stageKey, kodeSerialCheck, username, undo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    row = parseInt(row, 10);
    stageKey = String(stageKey || '');
    const a = findAccount_(username);
    if (!a) return { success: false, message: 'Akun tidak ditemukan' };
    if (a.status.toLowerCase() !== 'aktif') return { success: false, message: 'Akun tidak aktif' };
    const allowed = ROLE_STAGE_MAP[a.role.toLowerCase()];
    if (!allowed) return { success: false, message: 'Role tidak dikenali' };
    if (allowed !== 'ALL' && allowed !== stageKey) return { success: false, message: 'Anda tidak memiliki akses untuk mengisi tahap ini' };
    const stage = STAGES.find(s => s.key === stageKey);
    if (!stage) return { success: false, message: 'Tahap tidak dikenali' };
    if (!row || row < 2) return { success: false, message: 'Baris tidak valid' };

    const sh = getSS_().getSheetByName(SHEET_TRACKING);
    const r = sh.getRange(row, 1, 1, NUM_COLS).getValues()[0];
    if (kodeSerialCheck && String(r[COL.KODE_SERIAL - 1]) !== String(kodeSerialCheck)) {
      return { success: false, message: 'Data baris ini sudah berubah, silakan muat ulang' };
    }

    const kategori = kategoriOf_(r[COL.KATEGORI - 1]);
    const flow = flowKeys_(kategori);
    const idx = flow.indexOf(stageKey);
    if (idx < 0) return { success: false, message: 'Tahap ini tidak berlaku untuk kategori ' + kategori };
    const val = k => r[STAGES.find(s => s.key === k).col - 1];
    const lbl = k => STAGES.find(s => s.key === k).label;

    if (undo) {
      const later = flow.slice(idx + 1).find(k => val(k));
      if (later) return { success: false, message: 'Batalkan dulu tahap "' + lbl(later) + '"' };
      sh.getRange(row, stage.col).setValue('');
      return { success: true, cleared: true, stageKey: stageKey, row: row };
    }
    if (idx > 0 && !val(flow[idx - 1])) {
      return { success: false, message: 'Tahap "' + lbl(flow[idx - 1]) + '" belum selesai' };
    }
    const now = new Date();
    sh.getRange(row, stage.col).setValue(now);
    return { success: true, timestamp: now.toISOString(), stageKey: stageKey, row: row };
  } finally {
    lock.releaseLock();
  }
}
