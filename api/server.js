import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

// Self-heal: pastikan kolom expiry support TEXT untuk PERMANENT
let dbHealed = false;
async function healDB() {
    if (dbHealed) return;
    try {
        await sql`ALTER TABLE keys ALTER COLUMN expiry TYPE TEXT`;
    } catch (e) {
        // Kolom sudah TEXT atau tabel belum ada, abaikan
    }
    try {
        await sql`ALTER TABLE keys ALTER COLUMN registered_devices TYPE jsonb USING registered_devices::jsonb`;
    } catch (e) {
        // Sudah jsonb atau belum ada, abaikan
    }
    dbHealed = true;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    // ========== PUBLIC ENDPOINTS ==========

    if (req.method === 'GET' && type === 'loader') {
        const sid = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'gg.toast("[X] NEXUS X - Connecting...")',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
            'if r and r.code == 200 then',
            '    local fn = load(r.content)',
            '    if fn then fn() else gg.alert("[X] Script Empty!") end',
            'else',
            '    gg.alert("[X] NEXUS X\\n\\nConnection Failed!")',
            'end'
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(code);
    }

    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu not found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const sid = id || '';

        if (validate) {
            const hwid = device || 'NX-UNKNOWN';

            // ===== PERMANENT KEY PATH =====
            if (validate.startsWith('NX-PERM-')) {
                const rows = await sql`SELECT * FROM keys WHERE key = ${validate}`;

                if (rows.length === 0) {
                    return res.status(200).setHeader('Content-Type','text/plain').send([
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nPermanent Key tidak ditemukan!\\n\\nHubungi admin.")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n'));
                }

                const lic = rows[0];

                if (sid !== '' && lic.script_id !== sid) {
                    return res.status(200).setHeader('Content-Type','text/plain').send([
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nKey ini tidak untuk script ini!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n'));
                }

                let devs = lic.registered_devices || [];
                if (device && !devs.includes(hwid)) {
                    if (devs.length >= lic.max_devices) {
                        return res.status(200).setHeader('Content-Type','text/plain').send([
                            'os.remove("/sdcard/.nexus_auth")',
                            'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit!\\nHubungi admin reset.")',
                            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                            'if r and r.code == 200 then load(r.content)() end'
                        ].join('\n'));
                    }
                    devs.push(hwid);
                    await sql`UPDATE keys SET registered_devices = ${devs} WHERE key = ${validate}`;
                }

                return res.status(200).setHeader('Content-Type','text/plain').send([
                    'local f = io.open("/sdcard/.nexus_auth", "w")',
                    'if f then f:write("' + validate + '"); f:close() end',
                    'gg.toast("NEXUS X UNLIMITED ACCESS")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nStatus: UNLIMITED")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + lic.script_id + '")',
                    'local fn = load(r.content)',
                    'if fn then fn() else gg.alert("[X] Failed load menu!") end'
                ].join('\n'));
            }

            // ===== REGULAR KEY PATH =====
            const rows = await sql`SELECT * FROM keys WHERE key = ${validate}`;

            if (rows.length === 0 || (sid !== '' && rows[0].script_id !== sid)) {
                return res.status(200).setHeader('Content-Type','text/plain').send([
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] NEXUS X CLOUD\\n\\nKey tidak valid untuk script ini!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n'));
            }

            const lic = rows[0];

            if (lic.expiry !== 'PERMANENT') {
                const expDate = new Date(lic.expiry);
                if (new Date() > expDate) {
                    const fd = expDate.toLocaleDateString('id-ID', { year:'numeric', month:'long', day:'numeric' });
                    return res.status(200).setHeader('Content-Type','text/plain').send([
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nLicense EXPIRED!\\nExpired: ' + fd + '")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n'));
                }
            }

            let devs = lic.registered_devices || [];
            if (device && !devs.includes(hwid)) {
                if (devs.length >= lic.max_devices) {
                    return res.status(200).setHeader('Content-Type','text/plain').send([
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + sid + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n'));
                }
                devs.push(hwid);
                await sql`UPDATE keys SET registered_devices = ${devs} WHERE key = ${validate}`;
            }

            const expTxt = lic.expiry === 'PERMANENT' ? 'UNLIMITED' : new Date(lic.expiry).toLocaleDateString('id-ID');
            return res.status(200).setHeader('Content-Type','text/plain').send([
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + validate + '"); f:close() end',
                'gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nExp: ' + expTxt + '")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + lic.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed load menu!") end'
            ].join('\n'));
        }

        // ===== LUA LOGIN PROMPT =====
        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local KEY_FILE = "/sdcard/.nexus_auth"
local SCRIPT_ID = "${sid}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("[X] Verifying license...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)
    if r and r.code == 200 then
        local fn = load(r.content)
        if fn then fn() end
        return true
    end
    return false
end

local savedKey = nil
local f = io.open(KEY_FILE, "r")
if f then savedKey = f:read("*a"):match("^%s*(.-)%s*$"); f:close() end

if savedKey and savedKey ~= "" then
    gg.toast("[X] Restoring session...")
    if doValidate(savedKey) then return end
end

while true do
    gg.setVisible(false)
    local input = gg.prompt(
        {"[NEXUS X CLOUD]\\nEnter License Key:"},
        {""},
        {"text"}
    )
    if input then
        local targetKey = (input[1]):match("^%s*(.-)%s*$")
        if targetKey ~= "" then
            if doValidate(targetKey) then break end
        else
            gg.alert("[X] Key tidak boleh kosong!")
        end
    else
        gg.toast("Tap GG icon to login.")
        while true do
            if gg.isVisible() then break end
            gg.sleep(200)
        end
    end
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    // ========== AUTH GATE ==========
    const sessionToken = req.headers['x-session'];
    if (!sessionToken || sessionToken !== 'NEXUS_RISKI_SECURE_TOKEN') {
        if (req.method === 'POST') {
            const { action, username, password } = req.body || {};
            if (action === 'login' && username === 'riski' && password === '2409') {
                return res.status(200).json({ session: 'NEXUS_RISKI_SECURE_TOKEN' });
            }
        }
        return res.status(401).json({ error: 'Access Denied.' });
    }

    // ========== PROTECTED ENDPOINTS ==========

    if (req.method === 'POST') {
        const body = req.body || {};
        const { name, content, scriptId, expiry, maxDevices, customName, existingScriptId, action } = body;

        if (action === 'createKey') {
            await healDB();

            // ===== PERMANENT KEY =====
            if (expiry === 'PERMANENT') {
                if (!customName || customName.trim() === '') {
                    return res.status(400).json({ error: 'PERMANENT key WAJIB isi Custom License Name!' });
                }
                const cleanName = customName.trim().replace(/\s+/g, '-').toUpperCase();
                if (!/^[A-Z0-9\-_]+$/.test(cleanName)) {
                    return res.status(400).json({ error: 'Nama key hanya boleh: A-Z, 0-9, -, _' });
                }
                const finalKey = 'NX-PERM-' + cleanName;

                const dup = await sql`SELECT key FROM keys WHERE key = ${finalKey}`;
                if (dup.length > 0) {
                    return res.status(409).json({ error: 'Key "' + finalKey + '" sudah ada!' });
                }

                const tgt = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
                const tgtName = tgt.length > 0 ? tgt[0].name : 'Unknown';

                try {
                    await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${tgtName}, ${'PERMANENT'}, ${parseInt(maxDevices) || 1}, ${[]})`;
                } catch (insertErr) {
                    // Self-heal: coba alter kolom expiry ke TEXT
                    try {
                        await sql`ALTER TABLE keys ALTER COLUMN expiry TYPE TEXT USING expiry::TEXT`;
                        await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${tgtName}, ${'PERMANENT'}, ${parseInt(maxDevices) || 1}, ${[]})`;
                    } catch (retryErr) {
                        return res.status(500).json({ error: 'DB Error: ' + (retryErr.message || 'Unknown') });
                    }
                }

                return res.status(200).json({ key: finalKey, status: 'UNLIMITED' });
            }

            // ===== CUSTOM DATE KEY =====
            if (!expiry) {
                return res.status(400).json({ error: 'Pilih tanggal expiry!' });
            }

            const expDate = new Date(expiry);
            if (isNaN(expDate.getTime())) {
                return res.status(400).json({ error: 'Format tanggal tidak valid!' });
            }
            if (expDate <= new Date()) {
                return res.status(400).json({ error: 'Tanggal harus lebih dari sekarang!' });
            }

            let finalKey = '';
            if (customName && customName.trim() !== '') {
                finalKey = customName.trim().replace(/\s+/g, '-').toUpperCase();
            } else {
                finalKey = 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            }

            const dup = await sql`SELECT key FROM keys WHERE key = ${finalKey}`;
            if (dup.length > 0) {
                finalKey = 'NX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            }

            const tgt = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            const tgtName = tgt.length > 0 ? tgt[0].name : 'Unknown';

            try {
                await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${tgtName}, ${expiry}, ${parseInt(maxDevices) || 1}, ${[]})`;
            } catch (insertErr) {
                try {
                    await sql`ALTER TABLE keys ALTER COLUMN expiry TYPE TEXT USING expiry::TEXT`;
                    await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices, registered_devices) VALUES (${finalKey}, ${scriptId}, ${tgtName}, ${expiry}, ${parseInt(maxDevices) || 1}, ${[]})`;
                } catch (retryErr) {
                    return res.status(500).json({ error: 'DB Error: ' + (retryErr.message || 'Unknown') });
                }
            }

            return res.status(200).json({ key: finalKey, status: 'TIME_LIMITED' });
        }

        // ===== SCRIPT CREATE/UPDATE =====
        if (name && content) {
            if (existingScriptId && existingScriptId !== '') {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                const newId = 'sc_' + Math.random().toString(36).substring(2, 9);
                await sql`INSERT INTO scripts (id, name, content) VALUES (${newId}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid request body.' });
    }

    if (req.method === 'GET') {
        if (type === 'keys') {
            return res.status(200).json(await sql`SELECT * FROM keys ORDER BY created_at DESC`);
        }
        return res.status(200).json(await sql`SELECT * FROM scripts ORDER BY created_at DESC`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
}
