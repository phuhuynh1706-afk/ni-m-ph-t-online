// Máy chủ Niệm Phật Online: trang game + WebSocket + tài khoản (đăng ký/đăng nhập) + lưu dữ liệu bền.
// Người chơi tự đăng ký tên + mật khẩu. Chủ chùa dùng ADMIN_KEY (không cần đăng ký).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, ADMIN = process.env.ADMIN_KEY || '';
const FILE = path.join(process.env.DATA_DIR || __dirname, 'data.json');
let store = {}; try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
if (!store.db) store = { db: store };
store.users = store.users || {}; store.sessions = store.sessions || {}; store.saves = store.saves || {};
const DB = store.db;
Object.keys(store.sessions).forEach(t => { if (store.sessions[t].exp < Date.now()) delete store.sessions[t]; });
let dirty = false, pdirty = false; const pres = {}, clients = new Set(); let seq = 0;
const save = () => { dirty = true; };
setInterval(() => { if (dirty) { dirty = false; const tmp = FILE + '.tmp'; fs.writeFile(tmp, JSON.stringify(store), e => { if (!e) fs.rename(tmp, FILE, () => {}); }); } }, 3000);

const srv = http.createServer((q, r) => {
  if (q.url === '/healthz') { r.writeHead(200); return r.end('ok'); }
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, b) => {
    r.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(e ? 'error' : b);
  });
});
const wss = new WebSocketServer({ server: srv, maxPayload: 24000 });
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const bc = (o, except) => { const s = JSON.stringify(o); clients.forEach(c => { if (c !== except && c.readyState === 1 && c.peer) c.send(s); }); };
const clean = v => { try { const s = JSON.stringify(v); return s.length < 2000 ? JSON.parse(s) : null; } catch (e) { return null; } };
const hashPw = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384 }, (e, k) => e ? rej(e) : res(k)));
const RESERVED = ['admin', 'root', 'quanly', 'administrator', 'system'];
const tries = {}; setInterval(() => { for (const k in tries) delete tries[k]; }, 60000);

function docsOf(coll, o) {
  let a = Object.entries(DB[coll] || {}).map(([id, data]) => ({ id, data }));
  if (o && o.f) { const d = o.dir === 'desc' ? -1 : 1; a.sort((x, y) => ((x.data[o.f] > y.data[o.f]) - (x.data[o.f] < y.data[o.f])) * d); }
  return a.slice(0, Math.min((o && o.n) || 200, 200));
}
const snapOf = s => s.path ? docsOf(s.coll).filter(d => d.id === s.id) : docsOf(s.coll, s.o);
function notify(coll) { clients.forEach(c => { for (const [sid, s] of Object.entries(c.subs || {})) if (s.coll === coll) send(c, { t: 'snap', sid, docs: snapOf(s) }); }); }
const banned = ws => !ws.owner && DB.bans && DB.bans[ws.uid];
const can = (ws, c, id) => ws.owner || (!banned(ws) && ((c === 'players' && id === ws.uid) || c === 'wishes'));

function enter(ws, uid, owner, token) {
  ws.uid = uid; ws.owner = owner; ws.peer = uid + '-' + (++seq); pres[ws.peer] = {}; pdirty = true;
  send(ws, { t: 'welcome', peer: ws.peer, owner, uid, token: token || null, save: store.saves[uid] || null });
}
function deleteAccount(uid) {
  for (const u of Object.keys(store.users)) if (store.users[u].uid === uid) delete store.users[u];
  for (const t of Object.keys(store.sessions)) if (store.sessions[t].uid === uid) delete store.sessions[t];
  delete store.saves[uid];
  clients.forEach(c => { if (c.uid === uid && !c.owner) c.close(); });
}

wss.on('connection', (ws, req) => {
  const ip = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')).split(',')[0].trim();
  ws.subs = {}; ws.tok = 60; clients.add(ws);
  const refill = setInterval(() => { ws.tok = 60; }, 1000);
  ws.on('message', async raw => {
    if (--ws.tok < 0) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const err = msg => send(ws, { t: 'auth_err', err: msg });
    if (!ws.peer) {
      if (m.t === 'hello') {
        if (ADMIN && m.key === ADMIN) enter(ws, 'admin', true); else err('Sai khóa quản trị');
      } else if (m.t === 'resume') {
        const s = store.sessions[m.token]; if (s && s.exp > Date.now()) enter(ws, s.uid, false, m.token); else err('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
      } else if (m.t === 'reg' || m.t === 'login') {
        if ((tries[ip] = (tries[ip] || 0) + 1) > 15) return err('Thử quá nhiều lần, hãy đợi 1 phút');
        const u = String(m.user || '').trim().toLowerCase(), p = String(m.pass || '');
        if (!/^[a-z0-9_]{3,20}$/.test(u)) return err('Tên đăng nhập 3-20 ký tự: chữ thường không dấu, số, gạch dưới');
        if (p.length < 6 || p.length > 64) return err('Mật khẩu cần từ 6 đến 64 ký tự');
        let uid;
        if (m.t === 'reg') {
          if (RESERVED.includes(u) || store.users[u]) return err('Tên đăng nhập đã có người dùng');
          if (Object.keys(store.users).length >= 20000) return err('Máy chủ đã đủ số tài khoản');
          const salt = crypto.randomBytes(16).toString('hex'), hash = (await hashPw(p, salt)).toString('hex');
          if (store.users[u]) return err('Tên đăng nhập đã có người dùng');
          uid = 'p' + crypto.randomBytes(6).toString('hex'); store.users[u] = { uid, salt, hash, created: Date.now() };
        } else {
          const a = store.users[u]; if (!a) return err('Sai tên đăng nhập hoặc mật khẩu');
          const h = await hashPw(p, a.salt);
          if (!crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'))) return err('Sai tên đăng nhập hoặc mật khẩu');
          uid = a.uid; a.last = Date.now();
        }
        if (DB.bans && DB.bans[uid]) return err('Tài khoản đã bị quản trị viên khóa');
        const token = crypto.randomBytes(24).toString('hex'); store.sessions[token] = { uid, exp: Date.now() + 30 * 864e5 };
        save(); enter(ws, uid, false, token);
      }
      return;
    }
    const ack = (ok, extra) => send(ws, Object.assign({ t: 'res', id: m.id, ok }, extra));
    const [c, id] = String(m.path || '').split('/');
    switch (m.t) {
      case 'logout': if (m.token) { delete store.sessions[m.token]; save(); } break;
      case 'save': if (!banned(ws) && typeof m.data === 'string' && m.data.length < 15000) { store.saves[ws.uid] = m.data; save(); } break;
      case 'pres': {
        if (banned(ws) || !m.p || typeof m.p !== 'object') break;
        const cur = pres[ws.peer];
        Object.keys(m.p).slice(0, 14).forEach(k => { const v = m.p[k]; if (typeof v === 'number' || (typeof v === 'string' && v.length < 60)) cur[k] = v; });
        pdirty = true; break;
      }
      case 'emit': if (!banned(ws) && typeof m.topic === 'string' && m.topic.length < 20) bc({ t: 'ev', topic: m.topic, peer: ws.peer, data: clean(m.data) }, ws); break;
      case 'get': send(ws, { t: 'res', id: m.id, ok: true, data: ((DB[c] || {})[id]) || null }); break;
      case 'q': send(ws, { t: 'res', id: m.id, ok: true, docs: docsOf(String(m.coll), m.o) }); break;
      case 'sub': ws.subs[m.sid] = m.path ? { coll: c, id, path: 1 } : { coll: String(m.coll), o: m.o }; send(ws, { t: 'snap', sid: m.sid, docs: snapOf(ws.subs[m.sid]) }); break;
      case 'set': case 'upd': case 'del': {
        if (!c || !id || !can(ws, c, id)) return ack(false);
        DB[c] = DB[c] || {};
        if (m.t === 'del') { delete DB[c][id]; if (c === 'players' && ws.owner) deleteAccount(id); }
        else {
          let d = clean(m.data); if (!d) return ack(false);
          if (c === 'wishes' && !ws.owner) d = { lit: Number(d.lit) || 0 };
          DB[c][id] = m.t === 'upd' ? Object.assign({}, DB[c][id], d) : d;
        }
        save(); notify(c); ack(true); break;
      }
      case 'add': {
        const coll = String(m.coll), d = clean(m.data);
        if (!d || banned(ws) || !(ws.owner || coll === 'wishes')) return ack(false);
        DB[coll] = DB[coll] || {}; const nid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        DB[coll][nid] = d;
        const ks = Object.keys(DB[coll]); if (ks.length > 200) ks.sort((a, b) => (DB[coll][a].t || 0) - (DB[coll][b].t || 0)).slice(0, ks.length - 200).forEach(k => delete DB[coll][k]);
        save(); notify(coll); ack(true, { docId: nid }); break;
      }
    }
  });
  ws.on('close', () => { clearInterval(refill); clients.delete(ws); if (ws.peer) { delete pres[ws.peer]; pdirty = true; } });
});
setInterval(() => {
  if (!pdirty) return; pdirty = false;
  bc({ t: 'peers', list: Object.entries(pres).map(([peer, presence]) => ({ peer, presence })) });
}, 100);
srv.listen(PORT, () => console.log('Niệm Phật Online chạy ở cổng ' + PORT));
