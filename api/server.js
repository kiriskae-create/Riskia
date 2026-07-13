import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        const code = [
            'gg.setVisible(false)',
            'gg.toast("[X] Connecting...")',
            'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
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

    if (req.method === 'GET' && type === 'menu' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : 'gg.alert("[X] Menu script not found!")');
    }

    if (req.method === 'GET' && type === 'login') {
        const targetScriptId = id || '';

        if (validate) {
            const clientHwid = device || 'NX-UNKNOWN';
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                const c = [
                    'gg.alert("[X] License Key tidak valid untuk Script ini!")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }
            
            const license = checkKey[0];
            const expDate = new Date(license.expiry);
            const isPermanent = expDate.getFullYear() >= 2125;

            if (new Date() > expDate) {
                const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                const c = [
                    'gg.alert("[X] License EXPIRED!\\nExpired on: ' + fd + '")',
                    'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                    'if r and r.code == 200 then load(r.content)() end'
                ].join('\n');
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send(c);
            }

            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    const c = [
                        'gg.alert("[X] Max Device Limit Reached!")',
                        'local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")',
                        'if r and r.code == 200 then load(r.content)() end'
                    ].join('\n');
                    res.setHeader('Content-Type', 'text/plain');
                    return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }

            const expFull = isPermanent ? 'PERMANENT' : expDate.toLocaleString('sv-SE').replace('T', ' ');
            const createdAt = new Date().toLocaleString('sv-SE').replace('T', ' ');
            const maxDev = license.max_devices >= 9999 ? 'tak terbatas' : license.max_devices;
            
            const infoText = 'PENGGUNA: VERSI SCRIPT\\nVERSI: ISAC SCRIPT\\nPERANGKAT: ' + maxDev + '\\nTERDAFTAR: ' + createdAt + '\\nBERLAKU HINGGA: ' + expFull + '\\nPENJUAL: NEXUS SCRIPT';
            
            const c = [
                'gg.toast("ACCESS GRANTED")',
                'gg.alert("' + infoText + '")',
                'local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '")',
                'local fn = load(r.content)',
                'if fn then fn() else gg.alert("[X] Failed to load menu!") end'
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain');
            return res.status(200).send(c);
        }

        const loginLua = 'gg.setVisible(false)\nlocal BASE = "https://' + host + '"\nlocal SCRIPT_ID = "' + targetScriptId + '"\n\nlocal function getHwid()\n    local raw = "NX-" .. tostring(gg.getTargetPackage())\n    local enc = ""\n    for i = 1, #raw do enc = enc .. string.format("%02X", string.byte(raw, i)) end\n    return enc\nend\n\nlocal function doValidate(k)\n    gg.toast("Verifying...")\n    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)\n    if r and r.code == 200 then\n        local fn = load(r.content)\n        if fn then fn() end\n        return true\n    end\n    return false\nend\n\nwhile true do\n    gg.setVisible(false)\n    local input = gg.prompt({"Masukkan License Key:", "LOGIN [Centang untuk Masuk]", "EXIT [Centang untuk Keluar]"}, {"", false, false}, {"text", "checkbox", "checkbox"})\n    if input then\n        if input[3] == true then\n            os.exit()\n        elseif input[2] == true then\n            local targetKey = (input[1]):match("^%s*(.-)%s*$")\n            if targetKey ~= "" then\n                if doValidate(targetKey) then break end\n            else\n                gg.toast("Key tidak boleh kosong!")\n            end\n        else\n            gg.toast("Centang kotak LOGIN untuk melanjutkan")\n        end\n    else\n        gg.toast("Tap icon GG untuk membuka kembali")\n        while true do\n            if gg.isVisible() then break end\n            gg.sleep(200)\n        end\n    end\nend';
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(loginLua);
    }

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

    if (req.method === 'POST') {
        const { name, content, scriptId, expiry, maxDevices, customName, existingScriptId, action } = req.body;
        
        if (action === 'createKey') {
            if (!scriptId) return res.status(400).json({ error: 'Target Script Module belum dipilih!' });
            
            let finalKey = '';
            const expCheckDate = new Date(expiry);
            const isPermanent = expCheckDate.getFullYear() >= 2125;

            if (isPermanent) {
                finalKey = customName ? ('NX-PERM-' + customName.replace(/\s+/g, '-').toUpperCase()) : ('NX-PERM-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            } else {
                finalKey = customName ? customName.replace(/\s+/g, '-').toUpperCase() : ('NX-' + Math.random().toString(36).substring(2, 8).toUpperCase());
            }
            
            const target = await sql`SELECT name FROM scripts WHERE id = ${scriptId}`;
            if (target.length === 0) return res.status(400).json({ error: 'Script tidak ditemukan!' });

            await sql`INSERT INTO keys (key, script_id, target_script_name, expiry, max_devices) VALUES (${finalKey}, ${scriptId}, ${target[0].name}, ${expiry}, ${parseInt(maxDevices) || 1})`;
            return res.status(200).json({ key: finalKey });
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

    if (req.method === 'GET') {
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys ORDER BY expiry DESC` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}
