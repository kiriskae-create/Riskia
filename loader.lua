-- =============================================
--  NEXUS X CLOUD  —  LOADER MODULE (LINK 1)
-- =============================================
--  Ganti domain di bawah ini dengan URL Vercel kamu
--  Contoh: "nexus-x-cloud.vercel.app"
-- =============================================

local NX_DOMAIN = "YOUR_VERCEL_APP.vercel.app"

gg.setVisible(false)
gg.toast("[X] NEXUS X - Connecting...")
local r = gg.makeRequest("https://" .. NX_DOMAIN .. "/api/server?type=login")
if r and r.code == 200 then
    load(r.content)()
else
    gg.alert("[X] NEXUS X\n\nConnection Failed!\nCheck your internet connection.")
end
