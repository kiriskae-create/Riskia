import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

const sql = neon(process.env.POSTGRES_URL);

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, key, device, id, deleteKey, auth } = req.query;
    const host = req.headers.host;

    // ================================================================
    // HANDLER LINK 2: LOGIN & VALIDASI (Output: Lua Script via login.php)
    // ================================================================
    if (type === 'login') {
        res.setHeader('Content-Type', 'text/plain');

        // Jika dipanggil oleh pengecekan silent (Persistent Login otomatis dari Lua)
        if (key) {
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${key}`;
            if (checkKey.length === 0) {
                return res.status(200).send('return false, "❌ Lisensi Tidak Valid!"');
            }

            const license = checkKey[0];
            if (new Date() > new Date(license.expiry)) {
                return res.status(200).send('return false, "❌ Lisensi Kedaluwarsa!"');
            }

            const clientHwid = device || 'NX-UNKNOWN';
            let registeredDevices = license.registered_devices || [];

            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    return res.status(200).send('return false, "❌ Limit HWID Terlampaui!"');
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${key}`;
            }

            // Jika validasi sukses, kembalikan status true dan ID script target untuk dipanggil di LINK 3
            return res.status(200).send('return true, "' + license.script_id + '"');
        }

        // Jika dipanggil pertama kali tanpa parameter key (Menghasilkan UI Form Login Game Guardian)
        const loginUiLua = `
local savedKey = gg.settingLoad("nx_stored_key") or ""
local hwid = "NX-" .. tostring(gg.getTargetPackage())

-- 1. PERSISTENT LOGIN CHECK
if savedKey ~= "" then
    gg.toast("🔄 Auto-login: Memeriksa lisensi tersimpan...")
    local checkReq = gg.makeRequest("https://${host}/login.php?key="..savedKey.."&device="..hwid)
    if checkReq and checkReq.code == 200 then
        local checkFunc = load(checkReq.content)
        if checkFunc then
            local isSuccess, scriptTargetOrMsg = checkFunc()
            if isSuccess then
                gg.toast("✨ Sesi Valid! Memuat Menu Utama...")
                local menuReq = gg.makeRequest("https://${host}/menu.php?id="..scriptTargetOrMsg.."&auth="..savedKey)
                if menuReq and menuReq.code == 200 then
                    load(menuReq.content)()
                    return
                else
                    gg.alert("❌ Gagal memuat Menu Utama dari server!")
                end
            else
                gg.toast(scriptTargetOrMsg)
                gg.settingSave("nx_stored_key", "") -- Hapus key jika sudah tidak valid/expired
            end
        end
    end
end

-- 2. TAMPILAN INTERFACE LOGIN JIKA KEY BELUM TERSEDIA / DIHAPUS
::login_screen::
local input = gg.prompt({"🔑 ENTER PREMIUM LICENSE KEY:"}, {""}, {"text"})
if not input then os.exit() end

local userKey = input[1]
if userKey == "" then 
    gg.alert("❌ Key tidak boleh kosong!") 
    goto login_screen 
end

gg.toast("⏳ Memvalidasi Lisensi ke Database...")
local r = gg.makeRequest("https://${host}/login.php?key="..userKey.."&device="..hwid)

if r and r.code == 200 then
    local f = load(r.content)
    if f then
        local success, msg = f()
        if success then
            gg.settingSave("nx_stored_key", userKey) -- Simpan Key ke memori lokal GG
            gg.toast("✨ LOGIN BERHASIL!")
            
            -- Ambil Menu Utama dari LINK 3
            local menuReq = gg.makeRequest("https://${host}/menu.php?id="..msg.."&auth="..userKey)
            if menuReq and menuReq.code == 200 then
                load(menuReq.content)()
            else
                gg.alert("❌ Gagal mengambil Menu Utama!")
            end
        else
            gg.alert(msg)
            goto login_screen
        end
    else
        gg.alert("❌ Respons enkripsi server rusak.")
    end
else
    gg.alert("❌ Gagal terhubung ke Auth Server!")
end`;
        return res.status(200).send(loginUiLua);
    }

    // ================================================================
    // HANDLER LINK 3: SCRIPT MENU UTAMA (Output: Lua Script via menu.php)
    // ================================================================
    if (type === 'menu') {
        res.setHeader('Content-Type', 'text/plain');

        if (!id || !auth) {
            return res.status(200).send('gg.alert("❌ Akses ilegal tanpa token ditolak!"); os.exit()');
        }

        // Validasi berlapis: Pastikan token auth dari parameter benar-benar terdaftar untuk script ini
        const verifyKey = await sql`SELECT * FROM keys WHERE key = ${auth} AND script_id = ${id}`;
        if (verifyKey.length === 0) {
            return res.status(200).send('gg.alert("❌ Verifikasi Integritas Menu Gagal!"); os.exit()');
        }

        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- [NEXUS] Isi Menu Utama Belum Dikonfigurasi.');
    }

    // ================================================================
    // SISTEM MANAGEMENT PANEL DASHBOARD WEB ADMIN
    // ================================================================
    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { authenticatedUser = acc.email; break; }
        }
    }

    if (req.method === 'POST') {
        const { action, email, password, name, content, scriptId, expiry, maxDevices, customName, existingScriptId } = req.body;
        if (action === 'register') {
            const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await sql`INSERT INTO accounts (email, password, code) VALUES (${email}, ${hashPass(password)}, ${secretCode}) ON CONFLICT (email) DO NOTHING`;
            return res.status(200).json({ success: true, code: secretCode });
        }
        if (action === 'login') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length > 0 && acc[0].password === hashPass(password)) return res.status(200).json({ session: makeSession(email, acc[0].password) });
            return res.status(401).json({ error: 'Auth failed' });
        }
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        
        if (name && content) {
            if (existingScriptId && existingScriptId !== "") {
                await sql`UPDATE scripts SET name = ${name}, content = ${content} WHERE id = ${existingScriptId}`;
            } else {
                await sql`INSERT INTO scripts (id, name, content) VALUES (${'sc_' + Math.random().toString(36).substring(2, 9)}, ${name}, ${content})`;
            }
            return res.status(200).json({ success: true });
        }
        if (action === 'createKey') {
            const finalKey = customName || 'NX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0]?.name || 'Unknown'}, ${new Date(expiry)}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
        }
    }

    if (req.method === 'GET') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        return res.status(200).json(id === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
