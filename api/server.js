import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

/* TOKEN RAHASIA — Hanya ada di kode Lua yang GG jalankan */
const NX_TOKEN = 'nx_v3_' + Math.random().toString(36).substring(2, 10);

const PROTECT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>403 - Protected</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#02030a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(245,158,11,0.008) 2px,rgba(245,158,11,0.008) 4px);pointer-events:none}
.scan{position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent);z-index:2;animation:sy 4s linear infinite;box-shadow:0 0 30px rgba(245,158,11,0.15)}
@keyframes sy{0%{top:-3px}100%{top:100%}}
.g1{position:fixed;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(245,158,11,0.06),transparent 65%);top:40%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:gp 5s ease-in-out infinite}
.g2{position:fixed;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(239,68,68,0.04),transparent 65%);top:60%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:gp 5s ease-in-out infinite 2.5s}
@keyframes gp{0%,100%{opacity:.4;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.3)}}
.w{text-align:center;position:relative;z-index:10;padding:24px;max-width:400px}
.sw{position:relative;width:130px;height:160px;margin:0 auto 28px;animation:sf 4s ease-in-out infinite}
@keyframes sf{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.sr{position:absolute;border:1px solid rgba(245,158,11,0.08);border-radius:50%;animation:rp 3s ease-in-out infinite}
.sr:nth-child(1){inset:-18px}.sr:nth-child(2){inset:-36px;animation-delay:1s;border-color:rgba(245,158,11,0.04)}.sr:nth-child(3){inset:-54px;animation-delay:2s;border-color:rgba(245,158,11,0.02)}
@keyframes rp{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.8;transform:scale(1.03)}}
.ss{position:relative;z-index:2;width:100%;height:100%;filter:drop-shadow(0 0 20px rgba(245,158,11,0.15))}
.li{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;z-index:3}
.li svg{width:100%;height:100%}
h1{font-size:26px;font-weight:900;letter-spacing:8px;text-transform:uppercase;margin-bottom:8px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.sub{color:#475569;font-size:12px;max-width:340px;margin:0 auto;line-height:1.8}
.dv{width:50px;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent);margin:18px auto}
.wb{margin-top:18px;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.08);text-align:left}
.wb p{font-size:10px;color:#64748b;line-height:1.6}
.wb span{color:#ef4444;font-weight:700}
.tgs{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:18px}
.tg{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:100px;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
.ta{background:rgba(245,158,11,0.06);color:#f59e0b;border:1px solid rgba(245,158,11,0.1)}
.tr{background:rgba(239,68,68,0.06);color:#ef4444;border:1px solid rgba(239,68,68,0.1)}
.tg2{background:rgba(16,185,129,0.06);color:#10b981;border:1px solid rgba(16,185,129,0.1)}
.tg svg{width:9px;height:9px}
.ft{margin-top:28px;font-size:9px;color:#1e293b;letter-spacing:3px;text-transform:uppercase;font-weight:600}
</style></head><body>
<div class="scan"></div><div class="g1"></div><div class="g2"></div>
<div class="w">
<div class="sw"><div class="sr"></div><div class="sr"></div><div class="sr"></div>
<svg class="ss" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(245,158,11,0.03)"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
<div class="li"><svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div></div>
<h1>Protected</h1>
<p class="sub">This API endpoint is secured. Direct browser access is blocked.</p>
<div class="dv"></div>
<div class="wb"><p><span>WARNING:</span> Unauthorized access attempts are logged.</p></div>
<div class="tgs">
<span class="tg ta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Active</span>
<span class="tg tr"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>403</span>
<span class="tg tg2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>Secured</span>
</div>
<p class="ft">Nexus Security v3</p>
</div></body></html>`;

function fmtID(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/* Helper: buat URL dengan token */
function nxUrl(host, params) {
    return 'https://' + host + '/api/server?' + params + '&_t=' + NX_TOKEN;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate, _t } = req.query;
    const host = req.headers.host;

    /* ================================================================
       PROTEKSI: Cek token rahasia di URL
       - Semua URL yang GG eksekusi punya &_t=TOKEN_RAHASIA
       - Browser tidak punya token ini (tidak ada di address bar)
       - Admin panel punya X-Session = skip
       - type=loader tidak di-protect (hanya redirect, bukan data)
       ================================================================ */
    if (req.method === 'GET' && _t !== NX_TOKEN && !req.headers['x-session'] && type !== 'loader') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(403).send(PROTECT_HTML);
    }

    /* === LOADER (tidak di-protect) === */
    if (req.method === 'GET' && type === 'loader') {
        const sid = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'gg.toast("[X] Connecting...")',
            'local r = gg.makeRequest("' + nxUrl(host, 'type=login&id=' + sid) + '")',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("[X] Script Empty!") end',
            'else',
            '    gg.alert("[X] Connection Failed!")',
            'end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    /* === MENU === */
    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu not found!")');
    }

    /* === LOGIN === */
    if (req.method === 'GET' && type === 'login') {
        const sid = id || '';

        if (validate) {
            const hwid = device || 'NX-UNKNOWN';
            const ck = await sql`SELECT * FROM keys WHERE key = ${validate}`;

            if (ck.length === 0 || (sid !== '' && ck[0].script_id !== sid)) {
                const c = [
                    'gg.alert("[X] License Key tidak valid untuk Script ini!")',
                    'local r = gg.makeRequest("' + nxUrl(host, 'type=login&id=' + sid) + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }

            const lic = ck[0];
            const expDate = new Date(lic.expiry);
            const isPerm = expDate.getFullYear() >= 2125;

            if (new Date() > expDate) {
                const c = [
                    'gg.alert("[X] License EXPIRED!\\nExpired on: ' + fmtID(expDate) + '")',
                    'local r = gg.makeRequest("' + nxUrl(host, 'type=login&id=' + sid) + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }

            let devs = lic.registered_devices || [];
            if (device && !devs.includes(hwid)) {
                if (devs.length >= lic.max_devices) {
                    const c = [
                        'gg.alert("[X] Max Device Limit Reached!")',
                        'local r = gg.makeRequest("' + nxUrl(host, 'type=login&id=' + sid) + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                devs.push(hwid);
                await sql`UPDATE keys SET registered_devices = ${devs} WHERE key = ${validate}`;
            }

            const regDate = lic.created_at ? new Date(lic.created_at) : new Date();
            const devInfo = isPerm ? 'Tak Terbatas' : (lic.max_devices + ' Perangkat');
            const expDisp = isPerm ? 'PERMANENT' : fmtID(expDate);
            const info = 'PENGGUNA: ' + lic.key + '\\nVERSI: ' + lic.target_script_name + '\\nPERANGKAT: ' + devInfo + '\\nTERDAFTAR: ' + fmtID(regDate) + '\\nBERLAKU HINGGA: ' + expDisp + '\\nPENJUAL: NEXUS SCRIPT';

            const c = [
                'gg.alert("' + info + '")',
                'local r = gg.makeRequest("' + nxUrl(host, 'type=menu&id=' + lic.script_id) + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        /* === LOGIN PROMPT === */
        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local TK = "${NX_TOKEN}"
local SID = "${sid}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("Verifying...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SID .. "&_t=" .. TK)
    if r and r.code == 200 then
        local fn = load(r.content)
        if fn then fn() end
        return true
    end
    return false
end

while true do
    gg.setVisible(false)
    gg.toast("NEXUS X")
    gg.sleep(300)
    local input = gg.prompt(
        {"KEY", "SAIR \\u2716"},
        {"", false},
        {"text", "checkbox"}
    )
    if input == nil then
        gg.toast("Tap GG icon to login")
        while true do
            if gg.isVisible() then break end
            gg.sleep(200)
        end
    elseif input[2] == true then
        gg.setVisible(true)
        return
    else
        local targetKey = (input[1]):match("^%s*(.-)%s*$")
        if targetKey ~= "" then
            if doValidate(targetKey) then break end
        else
            gg.toast("Key cannot be empty!")
        end
    end
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    /* === ADMIN AUTH === */
    const sessionToken = req.headers['x-session'];
    if (!sessionToken || sessionToken !== 'NEXUS_RISKI_SECURE_TOKEN') {
        if (req.method === 'POST') {
            const { action, username, password } = req.body;
            if (action === 'login' && username === 'riski' && password === '2409') {
                return res.status(200).json({ session: 'NEXUS_RISKI_SECURE_TOKEN' });
            }
        }
        return res.status(401).json({ error: 'Access Denied.' });
    }

    /* === POST === */
    if (req.method === 'POST') {
        const { name, content, scriptId, expiry, maxDevices, customName, existingScriptId, action, editKey, newMaxDevices } = req.body;

        if (action === 'editDeviceLimit') {
            if (!editKey || !newMaxDevices) return res.status(400).json({ error: 'Missing parameters!' });
            const v = parseInt(newMaxDevices);
            if (isNaN(v) || v < 1) return res.status(400).json({ error: 'Invalid limit!' });
            await sql`UPDATE keys SET max_devices = ${v} WHERE key = ${editKey}`;
            return res.status(200).json({ success: true });
        }

        if (action === 'createKey') {
            if (!scriptId) return res.status(400).json({ error: 'Target Script belum dipilih!' });
            let fk = '';
            const expCD = new Date(expiry);
            const isPerm = expCD.getFullYear() >= 2125;
            if (isPerm) {
                fk = customName ? ('NX-PERM-' + customName.replace(/\s+/g, '-').toUpperCase()) : ('NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            } else {
                fk = customName ? customName.replace(/\s+/g, '-').toUpperCase() : ('NX-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            }
            const tgt = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            if (tgt.length === 0) return res.status(400).json({ error: 'Script tidak ditemukan!' });
            try {
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, created_at) VALUES (${fk}, ${scriptId}, ${tgt[0].name}, ${expiry}, ${parseInt(maxDevices) || 1}, NOW())`;
            } catch(e) {
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${fk}, ${scriptId}, ${tgt[0].name}, ${expiry}, ${parseInt(maxDevices) || 1})`;
            }
            return res.status(200).json({ key: fk });
        }

        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }
    }

    /* === GET === */
    if (req.method === 'GET') {
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys ORDER BY expiry DESC` : await sql`SELECT * FROM scripts`);
    }

    /* === DELETE === */
    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
