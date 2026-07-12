import os
os.makedirs('api', exist_ok=True)

srv = r'''import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';

const sql = neon(process.env.POSTGRES_URL);

function hashPass(pw) { return createHash('sha256').update(pw + '_nx_postgres_salt').digest('hex'); }
function makeSession(email, hash) { return createHash('md5').update(email + hash + 'session_token').digest('hex'); }

let _mailer = null;
function getMailer() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return null;
    if (_mailer) return _mailer;
    _mailer = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
        connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 15000
    });
    return _mailer;
}

async function sendCodeEmail(toEmail, code) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) return 'no_config';
    try {
        const mailer = getMailer();
        await mailer.verify();
        await mailer.sendMail({
            from: process.env.GMAIL_USER, to: toEmail,
            subject: '[NEXUS X] Your Security Key',
            text: 'Your NEXUS X Security Key: ' + code,
            html: '<div style="background:#0a0b10;color:#e2e8f0;padding:32px;border-radius:16px;font-family:sans-serif;max-width:420px;margin:0 auto"><div style="text-align:center;margin-bottom:24px"><div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.25);margin-bottom:12px"><span style="font-size:20px;font-weight:900;color:#f59e0b">N</span></div><h1 style="margin:0;font-size:18px;font-weight:800;color:#fbbf24">NEXUS X CLOUD</h1><p style="margin:4px 0 0;font-size:10px;color:#64748b;letter-spacing:2px">SECURITY KEY</p></div><div style="background:rgba(5,6,10,.8);border:1px solid rgba(245,158,11,.12);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px"><p style="margin:0 0 8px;font-size:11px;color:#94a3b8">Your verification code:</p><p style="margin:0;font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:6px;font-family:monospace">' + code + '</p></div><p style="margin:0;font-size:10px;color:#475569;text-align:center">Enter this code to complete your admin registration.</p></div>'
        });
        console.log('[MAIL] SENT OK to:', toEmail);
        return 'sent';
    } catch (err) {
        console.error('[MAIL] FAILED:', err.message);
        _mailer = null;
        return 'error';
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, type, key, device, deleteKey, validate } = req.query;
    const host = req.headers.host;

    if (req.method === 'GET' && type === 'loader') {
        const targetScriptId = id || 'default';
        const code = ['gg.setVisible(false)','gg.toast("[X] NEXUS X - Connecting...")','local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")','if r and r.code == 200 then','    local fn = load(r.content)','    if fn then fn() else gg.alert("[X] Script Empty!") end','else','    gg.alert("[X] NEXUS X\\n\\nConnection Failed!")','end'].join('\n');
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
            const checkKey = await sql`SELECT * FROM keys WHERE key = ${validate}`;
            if (checkKey.length === 0 || (targetScriptId !== '' && checkKey[0].script_id !== targetScriptId)) {
                const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] NEXUS X CLOUD\\n\\nLicense Key tidak valid untuk Script ini!")','local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")','if r and r.code == 200 then load(r.content)() end'].join('\n');
                res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(c);
            }
            const license = checkKey[0]; const expDate = new Date(license.expiry);
            if (new Date() > expDate) {
                const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
                const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] NEXUS X CLOUD\\n\\nLicense EXPIRED!\\nExpired on: ' + fd + '\\n\\nContact admin for renewal.")','local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")','if r and r.code == 200 then load(r.content)() end'].join('\n');
                res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(c);
            }
            const clientHwid = device || 'NX-UNKNOWN';
            let registeredDevices = license.registered_devices || [];
            if (device && !registeredDevices.includes(clientHwid)) {
                if (registeredDevices.length >= license.max_devices) {
                    const c = ['os.remove("/sdcard/.nexus_auth")','gg.alert("[X] NEXUS X CLOUD\\n\\nMax Device Limit Reached!\\n\\nContact admin to reset devices.")','local r = gg.makeRequest("https://' + host + '/api/server?type=login&id=' + targetScriptId + '")','if r and r.code == 200 then load(r.content)() end'].join('\n');
                    res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(c);
                }
                registeredDevices.push(clientHwid);
                await sql`UPDATE keys SET registered_devices = ${registeredDevices} WHERE key = ${validate}`;
            }
            const fd = expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
            const c = ['local f = io.open("/sdcard/.nexus_auth", "w")','if f then f:write("' + validate + '"); f:close() end','gg.alert("[X] NEXUS X CLOUD\\n\\nACCESS GRANTED\\n\\nExp: ' + fd + '")','local r = gg.makeRequest("https://' + host + '/api/server?type=menu&id=' + license.script_id + '")','local fn = load(r.content)','if fn then fn() else gg.alert("[X] Failed to load menu!") end'].join('\n');
            res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(c);
        }
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
    gg.toast("[X] Verifying license...")
    local r = gg.makeRequest(BASE .. "/api/server?type=login&validate=" .. k .. "&device=" .. getHwid() .. "&id=" .. SCRIPT_ID)
    if r and r.code == 200 then
        local fn = load(r.content)
        if fn then fn() end
        return true
    end
    return false
end
local function showLogin()
    local input = gg.prompt(
        {"[NEXUS X CLOUD]\\nMasukkan License Key Anda:"},
        {""},
        {"text"}
    )
    if input and input[1] then
        return (input[1]):match("^%s*(.-)%s*$")
    end
    return nil
end
local savedKey = nil
local f = io.open(KEY_FILE, "r")
if f then savedKey = f:read("*a"):match("^%s*(.-)%s*$"); f:close() end
if savedKey and savedKey ~= "" then
    gg.toast("[X] Restoring session...")
    if doValidate(savedKey) then return end
end
local inputKey = showLogin()
if not inputKey or inputKey == "" then
    if inputKey == "" then gg.alert("[X] Key tidak boleh kosong!") end
    return
end
if not doValidate(inputKey) then
    gg.alert("[X] Hubungan terputus atau Key salah!")
end`;
        res.setHeader('Content-Type', 'text/plain'); return res.status(200).send(loginLua);
    }

    if (req.method === 'GET' && type === 'raw' && id) {
        const sc = await sql`SELECT content FROM scripts WHERE id = ${id}`;
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(sc.length > 0 ? sc[0].content : '-- [NEXUS X] Script not found.');
    }

    const sessionToken = req.headers['x-session'];
    let authenticatedUser = null;
    if (sessionToken) {
        const accounts = await sql`SELECT * FROM accounts`;
        for (const acc of accounts) {
            if (makeSession(acc.email, acc.password) === sessionToken) { authenticatedUser = acc.email; break; }
        }
    }

    if (req.method === 'POST') {
        const { action, email, password, name, content, scriptId, expiry, maxDevices, customName, existingScriptId, code } = req.body;
        if (action === 'register') {
            const existing = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (existing.length > 0) return res.status(200).json({ success: true, emailSent: true });
            const secretCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await sql`INSERT INTO accounts (email, password, code) VALUES (${email}, ${hashPass(password)}, ${secretCode})`;
            const emailStatus = await sendCodeEmail(email, secretCode);
            console.log('[REG] email=' + email + ' mail=' + emailStatus);
            return res.status(200).json({ success: true, emailSent: true, emailStatus: emailStatus });
        }
        if (action === 'verifyCode') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length > 0 && acc[0].code === code) {
                return res.status(200).json({ valid: true });
            }
            return res.status(401).json({ valid: false });
        }
        if (action === 'resendCode') {
            const acc = await sql`SELECT * FROM accounts WHERE email = ${email}`;
            if (acc.length === 0) return res.status(404).json({ error: 'Not found' });
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await sql`UPDATE accounts SET code = ${newCode} WHERE email = ${email}`;
            const emailStatus = await sendCodeEmail(email, newCode);
            return res.status(200).json({ success: true, emailSent: true, emailStatus: emailStatus });
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
        return res.status(200).json(type === 'keys' ? await sql`SELECT * FROM keys` : await sql`SELECT * FROM scripts`);
    }

    if (req.method === 'DELETE') {
        if (!authenticatedUser) return res.status(401).json({ error: 'Access Denied' });
        if (deleteKey) await sql`DELETE FROM keys WHERE key = ${deleteKey}`;
        if (id) await sql`DELETE FROM scripts WHERE id = ${id}`;
        return res.status(200).json({ success: true });
    }
}'''.lstrip('\n')

with open('api/server.js', 'w') as f:
    f.write(srv)
print('server.js OK')

htm = '''<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>NEXUS X CLOUD</title>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#05060a;color:#e2e8f0;overflow-x:hidden;margin:0}
.mono{font-family:'JetBrains Mono',monospace}
.glass{background:rgba(15,17,25,.7);backdrop-filter:blur(25px);-webkit-backdrop-filter:blur(25px);border:1px solid rgba(245,158,11,.08)}
.glass-gold{background:linear-gradient(135deg,rgba(245,158,11,.05),rgba(217,119,6,.02));border:1px solid rgba(245,158,11,.15)}
.glass-edit{background:rgba(30,41,59,.7)!important;border:1px solid rgba(59,130,246,.3)!important}
.gold-text{background:linear-gradient(135deg,#fbbf24,#f59e0b,#d97706);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.btn-gold{background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:700;transition:all .2s;cursor:pointer}
.btn-gold:hover{box-shadow:0 4px 20px rgba(245,158,11,.3)}
.btn-blue{background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-weight:700;transition:all .2s;cursor:pointer}
.input-dark{background:rgba(5,6,10,.8);border:1px solid rgba(245,158,11,.1);color:#e2e8f0}
.input-dark:focus{outline:none;border-color:rgba(245,158,11,.4)}
.tag{display:inline-flex;align-items:center;padding:2px 7px;border-radius:5px;font-size:8px;font-weight:700;letter-spacing:.5px}
.flow-v{width:2px;height:16px;background:rgba(245,158,11,.15);margin:4px auto}
.tc{will-change:transform;transition:transform .3s cubic-bezier(.25,.46,.45,.94)}
.tc.pressing{transition:transform .08s ease-out}
.sg{position:relative;overflow:hidden}
.sg::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;border-radius:50%;opacity:.1;filter:blur(40px);pointer-events:none}
.sg.ga::before{background:radial-gradient(circle,#f59e0b,transparent 70%)}
.sg.gg::before{background:radial-gradient(circle,#10b981,transparent 70%)}
.sg.gr::before{background:radial-gradient(circle,#ef4444,transparent 70%)}
.blur-r{position:relative}
.blur-r::after{content:'';position:absolute;top:0;right:0;bottom:0;width:50%;background:linear-gradient(90deg,transparent,rgba(5,6,10,.6));backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);pointer-events:none;border-radius:0 1rem 1rem 0}
@keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.au{animation:fu .35s ease-out both}
.d1{animation-delay:.04s}.d2{animation-delay:.08s}.d3{animation-delay:.12s}
.exp-panel{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.25,.46,.45,.94),opacity .3s,margin .3s;opacity:0;margin-top:0}
.exp-panel.open{max-height:600px;opacity:1;margin-top:12px}
.nav-icon{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
.menu-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:12px;font-size:12px;color:#64748b;transition:all .15s;cursor:pointer;border:1px solid transparent;background:transparent}
.menu-btn:hover{background:rgba(255,255,255,.03);color:#94a3b8}
.menu-btn.active{background:rgba(245,158,11,.08);color:#fbbf24;font-weight:700;border-color:rgba(245,158,11,.12);border-left:3px solid #f59e0b}
.menu-btn.active .nav-icon{background:rgba(245,158,11,.15);border-color:rgba(245,158,11,.3)}
.menu-btn.active .nav-icon svg{stroke:#f59e0b}
.key-row{border:1px solid rgba(30,41,59,.5);border-radius:14px;padding:14px;background:rgba(10,12,18,.6);transition:all .2s}
.key-row:hover{border-color:rgba(245,158,11,.12);background:rgba(15,17,25,.7)}
.key-row.is-expired{opacity:.55;border-color:rgba(239,68,68,.1)}
.key-row.is-expired:hover{opacity:.75}
.script-card{border:1px solid rgba(30,41,59,.5);border-radius:14px;padding:14px;background:rgba(10,12,18,.6);transition:all .2s}
.script-card:hover{border-color:rgba(245,158,11,.12);background:rgba(15,17,25,.7)}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:16px;height:16px;border:2px solid rgba(245,158,11,.2);border-top-color:#f59e0b;border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
.code-input{letter-spacing:8px;text-align:center;font-size:24px;font-weight:900;font-family:'JetBrains Mono',monospace}
</style>
</head>
<body class="min-h-screen">
<div class="fixed bottom-5 left-5 z-50">
<button onclick="toggleQM()" class="w-11 h-11 rounded-full btn-gold shadow-2xl flex items-center justify-center text-xs font-black tracking-tighter cursor-pointer border border-amber-400/20">NX</button>
<div id="qm" class="absolute bottom-14 left-0 glass p-2.5 rounded-2xl w-48 space-y-0.5 shadow-2xl hidden" style="border-color:rgba(245,158,11,.15)">
<div class="flex justify-between items-center px-2 pb-2 mb-1 border-b border-amber-500/10"><span class="text-[8px] font-bold text-slate-600 tracking-widest">NAV</span><button onclick="toggleQM()" class="text-[10px] text-red-400/70 font-bold cursor-pointer leading-none">X</button></div>
<button onclick="sw('beranda');toggleQM()" class="w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:bg-white/5 rounded-lg transition cursor-pointer">Overview</button>
<button onclick="sw('ggscript');toggleQM()" class="w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:bg-white/5 rounded-lg transition cursor-pointer">Scripts</button>
<button onclick="sw('keysystem');toggleQM()" class="w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:bg-white/5 rounded-lg transition cursor-pointer">Licenses</button>
</div></div>

<div id="authGate" class="fixed inset-0 z-[100] bg-[#05060a] flex items-center justify-center">
<div class="w-full max-w-sm mx-4">
<div class="text-center mb-6">
<div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/20 mb-3"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg></div>
<h1 class="text-lg font-bold gold-text tracking-tight">NEXUS X CLOUD</h1>
<div class="flex items-center justify-center gap-1.5 mt-1"><span class="text-[8px] font-black bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/30 leading-none">.js</span><span class="text-[9px] text-slate-600 font-medium">ADMIN PANEL</span></div>
</div>

<div id="fTab" class="flex mb-4 gap-1 bg-black/30 p-1 rounded-xl border border-amber-500/5">
<button id="tabReg" onclick="stab('reg')" class="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-amber-500/15 text-amber-400 border border-amber-500/30">Register</button>
<button id="tabLog" onclick="stab('log')" class="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer text-slate-500">Login</button>
</div>

<div id="fReg" class="glass glass-gold rounded-2xl p-5 space-y-3">
<input type="email" id="rE" placeholder="Gmail Address" class="w-full px-4 py-2.5 rounded-xl input-dark text-sm mono">
<input type="password" id="rP" placeholder="Password (min 4)" class="w-full px-4 py-2.5 rounded-xl input-dark text-sm mono">
<button onclick="doReg()" id="btnReg" class="w-full py-2.5 rounded-xl btn-gold text-sm">Register</button>
</div>

<div id="fVerify" class="glass glass-gold rounded-2xl p-5 space-y-4 hidden">
<div class="text-center">
<div class="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
</div>
<h3 class="text-sm font-bold text-white">Code Sent!</h3>
<p class="text-[10px] text-slate-500 mt-1">Check your inbox <b class="text-emerald-400" id="vEmail">-</b> for the security key</p>
<p class="text-[9px] text-slate-600 mt-0.5">Also check Spam folder</p>
</div>
<div>
<label class="block text-[9px] font-bold text-slate-500 mb-2 uppercase tracking-wider text-center">Enter Security Key</label>
<input type="text" id="vCode" maxlength="6" placeholder="------" class="w-full px-4 py-3 rounded-xl input-dark code-input">
</div>
<button onclick="doVerify()" id="btnVerify" class="w-full py-2.5 rounded-xl btn-gold text-sm">Verify & Continue</button>
<div class="text-center">
<button onclick="doResend()" id="btnResend" class="text-[10px] text-slate-500 hover:text-amber-400 underline cursor-pointer transition">Resend Code</button>
<p id="resendTimer" class="text-[9px] text-slate-600 mt-1 hidden"></p>
</div>
</div>

<div id="fLog" class="glass glass-gold rounded-2xl p-5 space-y-3 hidden">
<input type="email" id="lE" placeholder="Gmail Address" class="w-full px-4 py-2.5 rounded-xl input-dark text-sm mono">
<input type="password" id="lP" placeholder="Password" class="w-full px-4 py-2.5 rounded-xl input-dark text-sm mono">
<button onclick="doLog()" class="w-full py-2.5 rounded-xl btn-gold text-sm">Login</button>
</div>
</div></div>

<div id="mainApp" class="hidden min-h-screen flex flex-col md:flex-row">
<aside class="w-full md:w-60 bg-[#080a10] border-b md:border-b-0 md:border-r border-slate-800/40 flex flex-col justify-between p-3 shrink-0">
<div>
<div class="flex items-center gap-2 mb-6 px-2 py-2">
<div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg></div>
<div class="flex items-baseline gap-1"><span class="text-sm font-bold text-white tracking-wide">NEXUS</span><span class="text-[7px] font-black bg-yellow-500/20 text-yellow-400 px-1 py-0.5 rounded border border-yellow-500/30 leading-none">.js</span></div>
</div>
<p class="text-[7px] font-bold text-slate-700 tracking-[.25em] uppercase px-3 mb-2">Menu</p>
<nav class="space-y-0.5 px-1">
<button id="btn-beranda" onclick="sw('beranda')" class="menu-btn"><div class="nav-icon bg-slate-800/60 border border-slate-700/40"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></div><span>Overview</span></button>
<button id="btn-ggscript" onclick="sw('ggscript')" class="menu-btn"><div class="nav-icon bg-slate-800/60 border border-slate-700/40"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><span>Scripts</span></button>
<button id="btn-keysystem" onclick="sw('keysystem')" class="menu-btn"><div class="nav-icon bg-slate-800/60 border border-slate-700/40"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></div><span>Licenses</span></button>
</nav></div>
<div class="mt-6 pt-3 border-t border-slate-800/40 px-2 space-y-2">
<div class="flex items-center gap-2"><div class="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/15"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><p class="text-[9px] text-slate-500 truncate mono" id="aE">user@nexus.io</p></div>
<button onclick="doOut()" class="w-full py-1.5 bg-red-950/20 text-red-400/70 border border-red-500/10 rounded-lg text-[9px] font-medium cursor-pointer hover:bg-red-950/40 hover:text-red-400 transition">Disconnect</button>
</div></aside>
<main class="flex-1 p-4 md:p-6 overflow-y-auto">
<div id="view-beranda" class="space-y-4">
<div><h2 class="text-base font-bold text-white">Overview</h2><p class="text-[9px] text-slate-600 mt-0.5">Real-time dashboard</p></div>
<div class="grid grid-cols-3 gap-3 au d1">
<div class="tc sg ga glass rounded-2xl p-3.5 cursor-pointer" style="transform:translateY(0)" onclick="toggleExpPanel()"><p class="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Scripts</p><p class="text-2xl font-black text-amber-400 mt-1 mono" id="statScripts">--</p></div>
<div class="tc sg gg glass rounded-2xl p-3.5 cursor-pointer" style="transform:translateY(0)" onclick="toggleExpPanel()"><p class="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Active</p><p class="text-2xl font-black text-emerald-400 mt-1 mono" id="statActive">--</p></div>
<div class="tc sg gr glass rounded-2xl p-3.5 cursor-pointer" style="transform:translateY(0)" onclick="toggleExpPanel()"><p class="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Expired</p><p class="text-2xl font-black text-red-400 mt-1 mono" id="statExpired">--</p></div>
</div>
<div id="expPanel" class="exp-panel"><div class="glass rounded-2xl p-4 space-y-2" style="border-color:rgba(239,68,68,.12)"><div class="flex items-center gap-2 mb-2"><div class="w-6 h-6 rounded-lg bg-red-500/15 flex items-center justify-center border border-red-500/20"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><p class="text-[11px] font-bold text-red-400">Expired License Details</p></div><div id="expList" class="space-y-1.5"></div></div></div>
<div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
<div class="lg:col-span-2 space-y-3">
<p class="text-[7px] font-bold text-slate-700 tracking-[.25em] uppercase px-1">Architecture</p>
<div class="tc glass rounded-2xl p-4 au d2 blur-r" style="transform:translateY(0)">
<div class="flex items-start gap-2.5"><div class="flex flex-col items-center pt-0.5"><span class="tag bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">L1</span><div class="flow-v"></div></div><div class="flex-1 pb-1.5"><p class="text-[10px] font-bold text-white">Loader Entry</p><div class="mt-1.5 flex items-center gap-1.5"><code class="text-[7px] text-emerald-400/60 mono bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 truncate flex-1 min-w-0" id="dL1">-</code><button onclick="cp(document.getElementById('dL1').innerText)" class="shrink-0 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[7px] font-bold cursor-pointer hover:bg-emerald-500/20 transition">CP</button></div></div></div>
<div class="flex items-start gap-2.5"><div class="flex flex-col items-center pt-0.5"><span class="tag bg-blue-500/10 text-blue-400 border border-blue-500/20">L2</span><div class="flow-v"></div></div><div class="flex-1 pb-1.5"><p class="text-[10px] font-bold text-white">Key Validation</p><div class="mt-1.5 flex items-center gap-1.5"><code class="text-[7px] text-blue-400/60 mono bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 truncate flex-1 min-w-0" id="dL2">-</code><button onclick="cp(document.getElementById('dL2').innerText)" class="shrink-0 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[7px] font-bold cursor-pointer hover:bg-blue-500/20 transition">CP</button></div></div></div>
<div class="flex items-start gap-2.5"><div class="flex flex-col items-center pt-0.5"><span class="tag bg-amber-500/10 text-amber-400 border border-amber-500/20">L3</span></div><div class="flex-1"><p class="text-[10px] font-bold text-white">Menu Stream</p><div class="mt-1.5 flex items-center gap-1.5"><code class="text-[7px] text-amber-400/60 mono bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 truncate flex-1 min-w-0" id="dL3">-</code></div></div></div>
</div></div>
<div class="lg:col-span-3 space-y-3">
<p class="text-[7px] font-bold text-slate-700 tracking-[.25em] uppercase px-1">Quick Info</p>
<div class="glass rounded-2xl p-4 au d3 space-y-3">
<div class="flex items-start gap-3 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10"><div class="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/15 shrink-0 mt-0.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div><div><p class="text-[10px] font-bold text-amber-300">Scripts Tab</p><p class="text-[9px] text-slate-500 mt-0.5 leading-relaxed">Copy = Raw Lua URL langsung tanpa login/key.</p></div></div>
<div class="flex items-start gap-3 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10"><div class="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/15 shrink-0 mt-0.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg></div><div><p class="text-[10px] font-bold text-blue-300">Licenses Tab</p><p class="text-[9px] text-slate-500 mt-0.5 leading-relaxed">Copy Hook = 1-line script + key validation gateway.</p></div></div>
<div class="flex items-start gap-3 p-3 bg-red-500/5 rounded-xl border border-red-500/10"><div class="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/15 shrink-0 mt-0.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><div><p class="text-[10px] font-bold text-red-300">Tap Stat Cards</p><p class="text-[9px] text-slate-500 mt-0.5 leading-relaxed">Tap card Expired di atas untuk lihat detail license mati.</p></div></div>
</div></div></div></div>
<div id="view-ggscript" class="space-y-4 hidden">
<div><h2 class="text-base font-bold text-white">Cloud Scripts</h2><p class="text-[9px] text-slate-600 mt-0.5">Copy = Raw Lua langsung tanpa validasi key</p></div>
<div id="edC" class="glass rounded-2xl p-4 space-y-3 transition-all duration-300">
<div class="flex justify-between items-center"><h3 class="text-xs font-bold text-white flex items-center gap-2" id="edT"><span id="edI"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span><span id="edN">New Script</span></h3><button onclick="rstEd()" id="rstBtn" class="hidden text-[9px] text-red-400 hover:text-red-300 underline cursor-pointer">Cancel</button></div>
<input type="hidden" id="edId">
<input type="text" id="fN" placeholder="filename.lua" class="w-full px-3 py-2 rounded-xl input-dark text-xs mono">
<textarea id="fC" rows="8" placeholder="-- Write LUA script here..." class="w-full px-3 py-2.5 rounded-xl input-dark text-xs mono resize-none leading-relaxed"></textarea>
<button id="dpBtn" onclick="dep()" class="w-full py-2 rounded-xl btn-gold text-xs">Save & Deploy</button>
</div>
<div id="fList" class="space-y-2"></div>
</div>
<div id="view-keysystem" class="space-y-4 hidden">
<div><h2 class="text-base font-bold text-white">License Keys</h2><p class="text-[9px] text-slate-600 mt-0.5">Copy Hook = 1-line script dengan key validation</p></div>
<div class="glass rounded-2xl p-4 space-y-3">
<h3 class="text-xs font-bold text-white flex items-center gap-2"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Generate License</h3>
<div class="grid grid-cols-1 gap-2.5">
<div><label class="block text-[8px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Target Script</label><select id="kT" class="w-full px-3 py-2 rounded-xl input-dark text-xs mono"></select></div>
<div class="grid grid-cols-2 gap-2.5">
<div><label class="block text-[8px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Max Devices</label><input type="number" id="kM" value="1" min="1" class="w-full px-3 py-2 rounded-xl input-dark text-xs mono"></div>
<div><label class="block text-[8px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Expiration</label><input type="datetime-local" id="kE" class="w-full px-3 py-2 rounded-xl input-dark text-xs mono"></div>
</div>
<div><label class="block text-[8px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Custom Key (Optional)</label><input type="text" id="kC" placeholder="VIP-ALPHA-001" class="w-full px-3 py-2 rounded-xl input-dark text-xs mono"></div>
</div>
<button onclick="genK()" class="w-full py-2 rounded-xl btn-gold text-xs">Generate</button>
</div>
<div id="kList" class="space-y-2"></div>
</div>
</main></div>
<div id="toast" class="fixed bottom-5 right-5 bg-amber-500 text-black px-3.5 py-2 rounded-xl shadow-2xl opacity-0 transition-all duration-300 z-[200] text-[10px] font-bold pointer-events-none"><span id="tM"></span></div>
<script>
var S={files:[],keys:[],rawCache:{},hookCache:[],loaderCache:[],session:'',cur:'beranda',expOpen:false,regEmail:''};
function toast(m){var t=document.getElementById('toast');document.getElementById('tM').innerText=m;t.style.opacity='1';t.style.transform='translateY(0)';setTimeout(function(){t.style.opacity='0';t.style.transform='translateY(6px)'},2000)}
function cp(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){toast('Copied!')}).catch(function(){fb(t)})}else{fb(t)}}
function fb(t){var a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();document.execCommand('copy');document.body.removeChild(a);toast('Copied!')}
function toggleQM(){document.getElementById('qm').classList.toggle('hidden')}
function toggleExpPanel(){S.expOpen=!S.expOpen;var p=document.getElementById('expPanel');if(S.expOpen)p.classList.add('open');else p.classList.remove('open')}
function sw(t){S.cur=t;S.expOpen=false;document.getElementById('expPanel').classList.remove('open');['beranda','ggscript','keysystem'].forEach(function(m){document.getElementById('view-'+m).classList.add('hidden');document.getElementById('btn-'+m).classList.remove('active')});document.getElementById('view-'+t).classList.remove('hidden');document.getElementById('btn-'+t).classList.add('active');if(t==='beranda')initB();if(t==='ggscript')loadF();if(t==='keysystem'){loadF();loadK()}}
function getHookLua(sid){var b=location.origin;return 'local A=gg.getFile() gg.getFile=function() return A end local V=gg.makeRequest("'+b+'/api/server?type=loader&id='+sid+'").content if V then pcall(load(V)) end'}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
async function initB(){var b=location.origin;document.getElementById('dL1').innerText=b+'/api/server?type=loader';document.getElementById('dL2').innerText=b+'/api/server?type=login';document.getElementById('dL3').innerText=b+'/api/server?type=menu&id={id}';document.getElementById('statScripts').innerText='--';document.getElementById('statActive').innerText='--';document.getElementById('statExpired').innerText='--';document.getElementById('expList').innerHTML='<p class="text-[9px] text-slate-600 text-center py-3">Loading...</p>';try{var rS=await api('GET',''),rK=await api('GET','?type=keys');if(rS.ok&&rK.ok){var sc=await rS.json(),ks=await rK.json();var el=[];for(var i=0;i<ks.length;i++){if(new Date()>new Date(ks[i].expiry))el.push(ks[i])}var act=ks.length-el.length;document.getElementById('statScripts').innerText=sc.length;document.getElementById('statActive').innerText=act;document.getElementById('statExpired').innerText=el.length;if(!el.length){document.getElementById('expList').innerHTML='<p class="text-[9px] text-emerald-500/60 text-center py-3">All licenses active</p>'}else{var h='';for(var j=0;j<el.length;j++){var ek=el[j];var ed=new Date(ek.expiry);h+='<div class="flex items-center justify-between p-2.5 bg-red-500/5 rounded-xl border border-red-500/8"><div class="min-w-0 flex-1 mr-2"><div class="flex items-center gap-1.5"><span class="mono text-[10px] font-bold text-red-400 truncate">'+esc(ek.key)+'</span><span class="tag bg-red-500/10 text-red-400 border border-red-500/15">EXPIRED</span></div><p class="text-[8px] text-slate-600 mt-0.5 mono">'+esc(ek.target_script_name||'?')+' &middot; '+ed.toLocaleDateString('id-ID')+'</p></div><button onclick="dlK('+j+')" class="shrink-0 px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/15 rounded text-[8px] font-bold cursor-pointer hover:bg-red-500/20 transition">DEL</button></div>'}document.getElementById('expList').innerHTML=h}}}catch(e){document.getElementById('expList').innerHTML='<p class="text-[9px] text-slate-600 text-center py-3">Error</p>'}}
async function api(m,u,b){var o={method:m,headers:{'Content-Type':'application/json'}};if(S.session)o.headers['X-Session']=S.session;if(b)o.body=JSON.stringify(b);return fetch('/api/server'+u,o)}
async function loadF(){var r=await api('GET','');if(!r.ok)return;S.files=await r.json();S.rawCache={};var s=document.getElementById('kT');if(s){var opts='<option value="">-- Select --</option>';for(var i=0;i<S.files.length;i++)opts+='<option value="'+S.files[i].id+'">'+esc(S.files[i].name)+'</option>';s.innerHTML=opts}var c=document.getElementById('fList');if(!S.files.length){c.innerHTML='<div class="text-center py-8 text-slate-700 text-[10px]">No scripts yet</div>';return}var h='';for(var i=0;i<S.files.length;i++){var f=S.files[i];S.rawCache[f.id]=location.origin+'/api/server?type=raw&id='+f.id;h+='<div class="tc script-card" style="transform:translateY(0)"><div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2.5"><div class="min-w-0"><div class="flex items-center gap-2"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg><span class="mono text-[11px] font-bold text-amber-400 truncate">'+esc(f.name)+'</span><span class="tag bg-slate-800 text-slate-500 border border-slate-700">.lua</span></div><p class="text-[8px] text-slate-600 mt-1 mono truncate">'+f.id+'</p></div><div class="flex gap-1.5 shrink-0"><button onclick="cp(S.rawCache[\''+f.id+'\'])" class="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 rounded-lg text-[9px] font-semibold cursor-pointer hover:bg-emerald-500/20 transition">Copy Raw</button><button onclick="edF('+i+')" class="px-2 py-1.5 bg-slate-800/40 text-slate-400 border border-slate-700/40 rounded-lg text-[9px] cursor-pointer hover:bg-slate-700/40 transition"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button onclick="dlF('+i+')" class="px-2 py-1.5 bg-red-500/10 text-red-400/70 border border-red-500/15 rounded-lg text-[9px] cursor-pointer hover:bg-red-500/20 transition"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div></div>'}c.innerHTML=h}
function edF(idx){var f=S.files[idx];if(!f)return;document.getElementById('edId').value=f.id;document.getElementById('fN').value=f.name;document.getElementById('fC').value=f.content;document.getElementById('edC').classList.add('glass-edit');document.getElementById('edN').innerText='Editing: '+f.name;var d=document.getElementById('dpBtn');d.className='w-full py-2 rounded-xl btn-blue text-xs';d.innerText='Update Script';document.getElementById('rstBtn').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
function rstEd(){document.getElementById('edId').value='';document.getElementById('fN').value='';document.getElementById('fC').value='';document.getElementById('edC').classList.remove('glass-edit');document.getElementById('edN').innerText='New Script';var d=document.getElementById('dpBtn');d.className='w-full py-2 rounded-xl btn-gold text-xs';d.innerText='Save & Deploy';document.getElementById('rstBtn').classList.add('hidden')}
async function dep(){var n=document.getElementById('fN').value.trim(),c=document.getElementById('fC').value,e=document.getElementById('edId').value;if(!n||!c)return toast('Name & content required!');var r=await api('POST','',{name:n,content:c,existingScriptId:e});if(r.ok){toast(e?'Updated!':'Deployed!');rstEd();loadF()}else toast('Failed.')}
async function loadK(){var r=await api('GET','?type=keys');if(!r.ok)return;S.keys=await r.json();S.hookCache=[];S.loaderCache=[];var c=document.getElementById('kList');if(!S.keys.length){c.innerHTML='<div class="text-center py-8 text-slate-700 text-[10px]">No licenses yet</div>';return}var h='';for(var i=0;i<S.keys.length;i++){var k=S.keys[i];var ed=new Date(k.expiry),exp=new Date()>ed;var dc=Array.isArray(k.registered_devices)?k.registered_devices.length:0;var kc=exp?'text-red-400 line-through':'text-amber-400';var ec=exp?'text-red-400 font-bold':'text-slate-400';var badge=exp?'<span class="tag bg-red-500/10 text-red-400 border border-red-500/15">EXPIRED</span>':'<span class="tag bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">ACTIVE</span>';var hi=S.hookCache.length;S.hookCache.push(getHookLua(k.script_id));var li=S.loaderCache.length;S.loaderCache.push(location.origin+'/api/server?type=loader&id='+k.script_id);h+='<div class="tc key-row'+(exp?' is-expired':'')+'" style="transform:translateY(0)"><div class="flex justify-between items-start gap-2"><div class="min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="mono text-[11px] font-bold '+kc+' break-all">'+esc(k.key)+'</span>'+badge+'</div></div><button onclick="dlK('+i+')" class="shrink-0 px-2 py-1 bg-red-500/10 text-red-400/70 border border-red-500/15 rounded-lg text-[8px] font-bold cursor-pointer hover:bg-red-500/20 transition">DEL</button></div><div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-500 mono pt-2 mt-2 border-t border-slate-800/50"><span>Module: <b class="text-white">'+esc(k.target_script_name||'?')+'</b></span><span>Devices: <b class="text-emerald-400">'+dc+'/'+k.max_devices+'</b></span><span>Exp: <span class="'+ec+'">'+ed.toLocaleDateString('id-ID')+'</span></span></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"><button onclick="cp(S.hookCache['+hi+'])" class="py-2 bg-amber-500/8 text-amber-400 border border-amber-500/15 hover:bg-amber-500/15 text-[9px] font-bold rounded-xl transition cursor-pointer text-center">Copy Hook Script</button><button onclick="cp(S.loaderCache['+li+'])" class="py-2 bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:bg-slate-700/30 text-[9px] font-bold rounded-xl transition cursor-pointer text-center">Copy Loader URL</button></div></div>'}c.innerHTML=h}
async function genK(){var s=document.getElementById('kT').value,m=document.getElementById('kM').value,e=document.getElementById('kE').value,c=document.getElementById('kC').value.trim();if(!s||!e)return toast('Target & expiration required!');var r=await api('POST','',{action:'createKey',scriptId:s,expiry:e,maxDevices:m,customName:c});if(r.ok){var d=await r.json();toast('Key: '+d.key);document.getElementById('kC').value='';loadK()}else toast('Failed!')}
async function dlF(idx){var f=S.files[idx];if(!f)return;if(confirm('Delete '+f.name+'?')){await api('DELETE','?id='+f.id);loadF();toast('Deleted!')}}
async function dlK(idx){var k=S.keys[idx];if(!k)return;if(confirm('Delete '+k.key+'?')){await api('DELETE','?deleteKey='+k.key);loadK();if(S.cur==='beranda')initB();toast('Deleted!')}}

var resendTimer=null;
function startResendTimer(){var sec=30;var btn=document.getElementById('btnResend');var tmr=document.getElementById('resendTimer');btn.classList.add('hidden');tmr.classList.remove('hidden');tmr.innerText='Resend in '+sec+'s';clearInterval(resendTimer);resendTimer=setInterval(function(){sec--;tmr.innerText='Resend in '+sec+'s';if(sec<=0){clearInterval(resendTimer);btn.classList.remove('hidden');tmr.classList.add('hidden')}},1000)}

function stab(t){document.getElementById('fReg').classList.add('hidden');document.getElementById('fVerify').classList.add('hidden');document.getElementById('fLog').classList.add('hidden');document.getElementById('fTab').classList.remove('hidden');document.getElementById('tabReg').className=t==='reg'?'flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-amber-500/15 text-amber-400 border border-amber-500/30':'flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer text-slate-500';document.getElementById('tabLog').className=t==='log'?'flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-amber-500/15 text-amber-400 border border-amber-500/30':'flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer text-slate-500';if(t==='reg')document.getElementById('fReg').classList.remove('hidden');if(t==='log')document.getElementById('fLog').classList.remove('hidden')}

async function doReg(){
    var e=document.getElementById('rE').value.trim(),p=document.getElementById('rP').value;
    if(!e||!p)return toast('Fill all fields!');
    var btn=document.getElementById('btnReg');btn.innerHTML='<span class="spinner"></span> Sending...';btn.disabled=true;
    try{
        var r=await fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',email:e,password:p})});
        if(r.ok){
            S.regEmail=e;
            document.getElementById('vEmail').innerText=e;
            document.getElementById('vCode').value='';
            document.getElementById('fReg').classList.add('hidden');
            document.getElementById('fTab').classList.add('hidden');
            document.getElementById('fVerify').classList.remove('hidden');
            startResendTimer();
            toast('Code sent to '+e+'!');
        }else{toast('Registration failed!')}
    }catch(er){toast('Network error!')}
    btn.innerHTML='Register';btn.disabled=false;
}

async function doVerify(){
    var code=document.getElementById('vCode').value.trim().toUpperCase();
    if(!code||code.length<4)return toast('Enter the 6-digit code!');
    var btn=document.getElementById('btnVerify');btn.innerHTML='<span class="spinner"></span> Verifying...';btn.disabled=true;
    try{
        var r=await fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verifyCode',email:S.regEmail,code:code})});
        if(r.ok){var d=await r.json();if(d.valid){toast('Verified!');stab('log');document.getElementById('lE').value=S.regEmail}else{toast('Wrong code! Try again.');document.getElementById('vCode').value='';document.getElementById('vCode').focus()}}
        else{toast('Verification failed!')}
    }catch(er){toast('Network error!')}
    btn.innerHTML='Verify & Continue';btn.disabled=false;
}

async function doResend(){
    var btn=document.getElementById('btnResend');btn.innerHTML='Sending...';btn.disabled=true;
    try{
        var r=await fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resendCode',email:S.regEmail})});
        if(r.ok){toast('New code sent!');startResendTimer()}else{toast('Resend failed!')}
    }catch(er){toast('Network error!')}
    btn.innerHTML='Resend Code';btn.disabled=false;
}

async function doLog(){
    var e=document.getElementById('lE').value.trim(),p=document.getElementById('lP').value;
    if(!e||!p)return toast('Fill all fields!');
    var r=await fetch('/api/server',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email:e,password:p})});
    if(r.ok){var d=await r.json();S.session=d.session;localStorage.setItem('nx_session',d.session);document.getElementById('authGate').classList.add('hidden');document.getElementById('mainApp').classList.remove('hidden');document.getElementById('aE').innerText=e;sw('beranda')}else toast('Login failed!')}
function doOut(){localStorage.removeItem('nx_session');location.reload()}
(function(){function gc(el){while(el&&el!==document.body){if(el.classList&&el.classList.contains('tc'))return el;el=el.parentNode}return null}function onS(e){var t=e.touches?e.touches[0]:e;var card=gc(e.target);if(!card)return;var r=card.getBoundingClientRect();var x=(t.clientX-r.left)/r.width-0.5;var y=(t.clientY-r.top)/r.height-0.5;card.classList.add('pressing');card.style.transform='translate('+((x*4)|0)+'px,'+((y*4)|0)+'px) scale(0.988)'}function onE(e){var c=gc(e.target);if(!c)return;c.classList.remove('pressing');c.style.transform='translate(0,0) scale(1)'}document.addEventListener('touchstart',onS,{passive:true});document.addEventListener('mousedown',onS);document.addEventListener('touchend',onE,{passive:true});document.addEventListener('mouseup',onE);document.addEventListener('touchcancel',onE,{passive:true});document.addEventListener('mouseleave',function(e){var c=gc(e.target);if(c){c.classList.remove('pressing');c.style.transform='translate(0,0) scale(1)'}})})();
window.onload=function(){var c=localStorage.getItem('nx_session');if(c){S.session=c;document.getElementById('authGate').classList.add('hidden');document.getElementById('mainApp').classList.remove('hidden');sw('beranda')}}
<\/script>
</body>
</html>'''.lstrip('\n')

with open('index.html', 'w') as f:
    f.write(htm)
print('index.html OK')

import subprocess
subprocess.run(['git','add','-A'],check=True)
subprocess.run(['git','commit','-m','Fix: add email verification step with enter code input, resend timer, spinner loading'],check=True)
subprocess.run(['git','push','origin','main','--force'],check=True)
print('DONE')
