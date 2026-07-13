import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

function makeSession(user) { 
    return createHash('md5').update(user + '2409_nexus_secret_salt_2026').digest('hex'); 
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    // ═══════════════════════════════════════
    //  LINK 1 — LOADER UTAMA (STREAM SKRIP LUA MENTAH)
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        
        // Cari konten skrip dari database
        const sc = await sql`SELECT content FROM scripts WHERE id = ${targetScriptId}`;
        res.setHeader('Content-Type', 'text/plain');
        
        if (sc.length > 0) {
            return res.status(200).send(sc[0].content);
        } else {
            return res.status(200).send('gg.alert("[X] NEXUS X: Script Utama Kosong atau Tidak Ditemukan!")');
        }
    }

    // ═══════════════════════════════════════
    //  LINK 2 — GERBANG LOGIN & VALIDASI KETAT
    // ═══════════════════════════════════════
    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';

        if (validate) {
            // Jika validasi menggunakan key khusus bypass permanen 'PERMANENT-BYPASS'
            if (validate === 'PERMANENT-BYPASS') {
                const c = [
                    'local f = io.open("/sdcard/.nexus_auth", "w")',
                    'if f then f:write("PERMANENT-BYPASS"); f:close() end',
                    'gg.toast("⚡ NEXUS X CLOUD — PERMANENT ACCESS GRANTED ⚡")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=loader&id=' + targetScriptId + '")',
                    'local fn = load(r.content)',
                    'if fn then fn() else gg.alert("[X] Gagal memuat script utama!") end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }

            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                const c = [
                    'os.remove("/sdcard/.nexus_auth")',
                    'gg.alert("[X] License Key tidak valid untuk Script ini!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            
            const license = checkKey[0];

            // Proteksi Masa Berlaku (Kecuali jika disetel tanpa batas/permanen via data)
            if (license.expiry && license.expiry !== 'PERMANENT') {
                const expDate = new Date(license.expiry);
                if (new Date() > expDate) {
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] EXPIRED! Silakan hubungi admin Riski untuk perpanjangan.")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
            }

            // Batasan HWID Perangkat
            const clientHwid = device || 'NX-UNKNOWN';
            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    const c = [
                        'os.remove("/sdcard/.nexus_auth")',
                        'gg.alert("[X] Batas maksimal perangkat tercapai!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }

            // Sukses Validasi -> Eksekusi Loader utama
            const c = [
                'local f = io.open("/sdcard/.nexus_auth", "w")',
                'if f then f:write("' + validate + '"); f:close() end',
                'gg.toast("✓ Akses Diterima!")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=loader&id=' + license.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Gagal mengeksekusi script utama!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        // --- LOGIN UI PROMPT INTERFACE ---
        const loginLua = `gg.setVisible(false)
local BASE = "https://${host}"
local KEY_FILE = "/sdcard/.nexus_auth"
local SCRIPT_ID = "${targetScriptId}"

local function getHwid()
    local raw = "NX-" .. tostring(gg.getTargetPackage())
    local enc = ""
    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end
    return enc
end

local function doValidate(k)
    gg.toast("Sedang memvalidasi lisensi...")
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
    if doValidate(savedKey) then return end
end

local input = gg.prompt({"[NEXUS X CLOUD]\\nMasukkan License Key Anda:"}, {""}, {"text"})
if input and input[1] then
    local inputKey = (input[1]):match("^%s*(.-)%s*$")
    if inputKey ~= "" then
        if not doValidate(inputKey) then gg.alert("[X] Koneksi gagal atau Key salah!") end
    else
        gg.alert("[X] Key tidak boleh kosong!")
    end
end`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

    // --- STRUKTUR AUTH KHUSUS ADMIN RISKI ---
    const sessionToken = req.headers['x-session'];
    let isAdmin = (sessionToken === makeSession('riski'));

    if (req.method === 'POST') {
        const { action, username, password, name, content, scriptId, expiryDays, maxDevices, customName, existingScriptId } = req.body;
        
        // Login Admin Route Interception
        if (action === 'login') {
            if (username === 'riski' && password === '2409') {
                return res.status(200).json({ session: makeSession('riski') });
            }
            return res.status(401).json({ error: 'Akses Ditolak. Khusus Admin Riski!' });
        }

        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

        // Save / Update Script LUA
        if (name && content) {
            if (existingScriptId) {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }

        // Generate Key Berdasarkan Durasi Pilihan
        if (action === 'createKey') {
            const finalKey = customName || 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            
            let expiryDateString = 'PERMANENT';
            if (expiryDays !== 'PERMANENT') {
                let d = new Date();
                d.setDate(d.getDate() + parseInt(expiryDays));
                expiryDateString = d.toISOString();
            }

            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${expiryDateString}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
