import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

/* === URL PROTECTION HTML === */
const PROTECT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>403 - Access Protected</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#04050a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.glow{position:fixed;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(245,158,11,0.07),transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}}
.wrap{text-align:center;position:relative;z-index:1;padding:24px}
.shield{width:100px;height:120px;margin:0 auto 28px;animation:float 3s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
h1{font-size:24px;font-weight:800;letter-spacing:8px;text-transform:uppercase;margin-bottom:10px}
.sub{color:#475569;font-size:13px;max-width:340px;margin:0 auto;line-height:1.7}
.tag{display:inline-block;margin-top:24px;padding:7px 18px;border-radius:100px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.12);color:#f59e0b;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.line{width:40px;height:2px;background:rgba(245,158,11,0.3);margin:16px auto 0;border-radius:2px}
</style></head><body>
<div class="glow"></div>
<div class="wrap">
<svg class="shield" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(245,158,11,0.04)"/><path d="M9 12l2 2 4-4" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="8.01" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2"/></svg>
<h1>Protected</h1>
<p class="sub">This API endpoint is secured and cannot be accessed directly through a web browser. All requests are authenticated and monitored.</p>
<div class="line"></div>
<span class="tag">Nexus Security Layer</span>
</div></body></html>`;

/* === DATE FORMATTER === */
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

    /* === BROWSER PROTECTION === */
    const accept = req.headers['accept'] || '';
    if (req.method === 'GET' && accept.includes('text/html') && !req.headers['x-session']) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(403).send(PROTECT_HTML);
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
