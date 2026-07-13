import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

/* === URL PROTECTION HTML === */
const PROTECT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>403 - Endpoint Protected</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#02030a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(245,158,11,0.008) 2px,rgba(245,158,11,0.008) 4px);pointer-events:none;z-index:1}
.scan{position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent);z-index:2;animation:scanY 4s linear infinite;box-shadow:0 0 30px rgba(245,158,11,0.15),0 0 60px rgba(245,158,11,0.05)}
@keyframes scanY{0%{top:-3px}100%{top:100%}}
.glow1{position:fixed;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(245,158,11,0.06),transparent 65%);top:40%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:gp 5s ease-in-out infinite}
.glow2{position:fixed;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(239,68,68,0.04),transparent 65%);top:60%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:gp 5s ease-in-out infinite 2.5s}
@keyframes gp{0%,100%{opacity:.4;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.3)}}
.wrap{text-align:center;position:relative;z-index:10;padding:24px;max-width:420px}
.shield-wrap{position:relative;width:140px;height:170px;margin:0 auto 32px;animation:shFloat 4s ease-in-out infinite}
@keyframes shFloat{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-6px) rotate(0.5deg)}75%{transform:translateY(4px) rotate(-0.5deg)}}
.shield-ring{position:absolute;inset:-20px;border:1px solid rgba(245,158,11,0.08);border-radius:50%;animation:ringPulse 3s ease-in-out infinite}
.shield-ring:nth-child(2){inset:-40px;animation-delay:1s;border-color:rgba(245,158,11,0.04)}
.shield-ring:nth-child(3){inset:-60px;animation-delay:2s;border-color:rgba(245,158,11,0.02)}
@keyframes ringPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.8;transform:scale(1.03)}}
.shield-svg{position:relative;z-index:2;width:100%;height:100%;filter:drop-shadow(0 0 20px rgba(245,158,11,0.15))}
.lock-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;z-index:3}
.lock-icon svg{width:100%;height:100%}
h1{font-size:28px;font-weight:900;letter-spacing:10px;text-transform:uppercase;margin-bottom:8px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.sub{color:#475569;font-size:13px;max-width:360px;margin:0 auto;line-height:1.8;font-weight:400}
.divider{width:50px;height:1px;background:linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent);margin:20px auto}
.tags{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:20px}
.tag{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:100px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
.tag-amber{background:rgba(245,158,11,0.06);color:#f59e0b;border:1px solid rgba(245,158,11,0.1)}
.tag-red{background:rgba(239,68,68,0.06);color:#ef4444;border:1px solid rgba(239,68,68,0.1)}
.tag-green{background:rgba(16,185,129,0.06);color:#10b981;border:1px solid rgba(16,185,129,0.1)}
.tag svg{width:10px;height:10px}
.footer-text{margin-top:32px;font-size:10px;color:#1e293b;letter-spacing:3px;text-transform:uppercase;font-weight:600}
.warn-box{margin-top:20px;padding:12px 16px;border-radius:12px;background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.08);text-align:left}
.warn-box p{font-size:11px;color:#64748b;line-height:1.6}
.warn-box span{color:#ef4444;font-weight:700}
</style></head><body>
<div class="scan"></div>
<div class="glow1"></div>
<div class="glow2"></div>
<div class="wrap">
<div class="shield-wrap">
<div class="shield-ring"></div>
<div class="shield-ring"></div>
<div class="shield-ring"></div>
<svg class="shield-svg" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(245,158,11,0.03)"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
<div class="lock-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
</div>
<h1>Protected</h1>
<p class="sub">This API endpoint is secured with multi-layer protection. Direct browser access is blocked and monitored.</p>
<div class="divider"></div>
<div class="warn-box">
<p><span>WARNING:</span> Unauthorized access attempts are logged. This endpoint only accepts authenticated requests from authorized clients.</p>
</div>
<div class="tags">
<span class="tag tag-amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Shield Active</span>
<span class="tag tag-red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>403 Blocked</span>
<span class="tag tag-green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>Endpoint Secured</span>
</div>
<p class="footer-text">Nexus Security Layer v3.0</p>
</div></body></html>`;

function fmtID(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    /* ============================================
       BROWSER PROTECTION - MULTI-SIGNAL DETECTION
       ============================================
       Deteksi hanya browser navigasi, TIDAK gg.makeRequest
       Signal yang HANYA browser kirim:
       - Sec-Fetch-Dest (document/empty/etc) — GG tidak kirim ini
       - Sec-Fetch-Mode (navigate/cors) — GG tidak kirim ini  
       - Accept-Language (en-US,en;q=0.9) — GG tidak kirim ini
       - Upgrade-Insecure-Requests: 1 — GG tidak kirim ini
       ============================================ */
    if (req.method === 'GET' && !req.headers['x-session']) {
        const secFetchDest = req.headers['sec-fetch-dest'] || '';
        const secFetchMode = req.headers['sec-fetch-mode'] || '';
        const acceptLang = req.headers['accept-language'] || '';
        const upgradeInsecure = req.headers['upgrade-insecure-requests'] || '';

        /* Minimal 1 signal browser terdeteksi = browser asli */
        const isBrowser = (
            secFetchDest !== '' ||
            secFetchMode !== '' ||
            acceptLang !== '' ||
            upgradeInsecure !== ''
        );

        if (isBrowser) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            return res.status(403).send(PROTECT_HTML);
        }
    }

    /* === LOADER === */
    if (req.method === 'GET' && type === 'loader') {
        const sid = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'gg.toast("[X] Connecting...")',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
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
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
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
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
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
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
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
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + lic.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        /* === LOGIN LUA WITH SAIR + NEXUS X === */
        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local SCRIPT_ID = "${sid}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("Verifying...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)
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
            if (isNaN(v) || v < 1) return res.status(400).json({ error: 'Invalid device limit!' });
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
