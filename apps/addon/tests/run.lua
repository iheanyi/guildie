-- Plain-Lua tests for the addon, against the stubbed WoW API in wow.lua.
--   luajit apps/addon/tests/run.lua [path/to/GuildieBundle.lua]
-- (LuaJIT or Lua 5.1, like the game.) With a bundle file (from scripts/build.ts),
-- also checks that real data survives guild sync.

package.path = (arg[0]:match("^(.*)/[^/]*$") or ".") .. "/?.lua;" .. package.path
local wow = require("wow")
local test, eq = wow.test, wow.eq

local HOUR = 3600 * 1000
local function nowMs() return math.floor(wow.clock.server) * 1000 end

local function entry(opts)
    return {
        name = opts.name or "Meow Pew Pew",
        region = opts.region or "eu",
        slug = opts.slug or "meow-pew-pew",
        generatedAt = opts.generatedAt,
        reagents = opts.reagents or {
            [2589] = { name = "Linen Cloth", users = {
                { name = "Brisket", classId = 8, profession = "Tailoring", recipes = 12 },
                { name = "Ðemo", classId = 4, profession = "First Aid", recipes = 3 },
            } },
            [2318] = { name = "Light Leather", users = {
                { name = "Corwin", classId = 11, profession = "Leatherworking", recipes = 9 },
            } },
        },
    }
end

local function v2(e, mine)
    return { version = 2, generatedAt = e.generatedAt, mine = mine, guilds = { [e.region .. "/" .. e.slug] = e } }
end

local function standalone(opts)
    -- One client, for what doesn't need the channel.
    opts.name = opts.name or "Lexi"
    local c = wow.client(opts)
    wow.login(c)
    return c
end

-- ---- Wire ----------------------------------------------------------------------------

test("wire: round trip, escaping, checksum", function()
    local c = standalone({ guild = "Meow Pew Pew" })
    local Wire = c.ns.Wire
    local e = entry({ generatedAt = 1794329809487 })
    local text = Wire.encode(e)
    assert(not text:find("[^%w_'%-~#;,:%.]"), "wire text has only printable ASCII, no spaces: " .. text)
    local back = assert(Wire.decode(text))
    eq(back.name, "Meow Pew Pew", "name")
    eq(back.slug, "meow-pew-pew", "slug")
    eq(back.generatedAt, 1794329809487, "generatedAt")
    eq(back.reagents[2589].users[2].name, "Ðemo", "UTF-8 name")
    eq(back.reagents[2589].users[2].profession, "First Aid", "profession with a space")
    eq(back.reagents[2589].users[1].recipes, 12, "recipes")
    eq(back.reagents[2318].users[1].classId, 11, "classId")
    eq(Wire.checksum("abc"), 38600999, "adler-32 of abc")
end)

test("wire: rejects anything malformed, and never throws", function()
    local c = standalone({ guild = "Meow Pew Pew" })
    local Wire = c.ns.Wire
    local good = Wire.encode(entry({ generatedAt = 5 }))
    local bad = {
        "",
        "1#eu#x#X#5###",
        "2#xx#x#X#5###",                         -- unknown region
        "2#eu#x#X#5####",                        -- extra field
        "2#eu#x#~7Ccff0000Evil#5###",            -- "|" in a name (UI escape codes)
        "2#eu#x#X#5#Bob,8##1:1.1.1",             -- profession 1 doesn't exist
        "2#eu#x#X#5#Bob,8#Alch#1:2.1.1",         -- member 2 doesn't exist
        "2#eu#x#X#5#Bob,8#Alch#1:1.1.1;1:1.1.1", -- the same item twice
        "2#eu#x#X#abc###",                       -- generatedAt not a number
        "2#eu#x#X~G1#5###",                      -- bad escape
        "2#eu#x#X~#5###",
        "2#eu#x#X#5#Bob,8#Alch#1:1.1.1,1.1.1,1.1.1,1.1.1,1.1.1,1.1.1,1.1.1,1.1.1,1.1.1", -- 9 users
        "2#eu#x#X#5#Bob,8#Alch#99999999:1.1.1",  -- item id out of range
        "2#eu#x#" .. string.rep("A", 49) .. "#5###", -- name too long
        "2#eu#x#X#5###" .. string.rep("x", Wire.MAX_BYTES), -- too big
    }
    for _, text in ipairs(bad) do
        local ok, result = pcall(Wire.decode, text)
        assert(ok, "decode threw on " .. text:sub(1, 60))
        eq(result, nil, "decode of " .. text:sub(1, 60))
    end
    -- Random damage: never an error, and anything accepted is well-formed.
    math.randomseed(42)
    for _ = 1, 3000 do
        local s = good
        for _ = 1, math.random(1, 4) do
            local i = math.random(1, #s)
            s = s:sub(1, i - 1) .. string.char(math.random(0, 255)) .. s:sub(i + 1)
        end
        local ok, result = pcall(Wire.decode, s)
        assert(ok, "decode threw: " .. tostring(result))
        if result then
            for id, r in pairs(result.reagents) do
                assert(type(id) == "number" and #r.users <= 8)
                for _, u in ipairs(r.users) do assert(not u.name:find("[|%c]")) end
            end
        end
    end
end)

-- ---- Guild detection and picking a source ----------------------------------------------------

test("slug matches the server's guildSlug", function()
    local c = standalone({ guild = "X" })
    eq(c.ns.slug("The Long Watch"), "the-long-watch")
    eq(c.ns.slug("  Meow   Pew Pew "), "meow-pew-pew")
    eq(c.ns.slug("Unbound"), "unbound")
end)

test("region and guild key; GetGuildInfo late at login", function()
    local c = wow.client({ name = "Lexi", guild = "Meow Pew Pew", region = 1, guildInfoLate = true })
    wow.login(c)
    eq(c.ns.guild, nil, "unknown until the roster arrives")
    c.opts.guildInfoLate = false
    c:fire("GUILD_ROSTER_UPDATE")
    eq(c.ns.guild.key, "us/meow-pew-pew", "key")
    for id, region in pairs({ [2] = "kr", [3] = "eu", [4] = "tw" }) do
        c.opts.region = id
        eq(c.ns.region(), region, "region " .. id)
    end
end)

test("not in a guild", function()
    local c = standalone({ guild = nil, bundle = v2(entry({ generatedAt = 1 })) })
    eq(c.ns.guild, false, "guild")
    eq(c.ns.active, nil, "no data")
    eq(#c:tooltip(2589), 0, "no tooltip line")
end)

test("newest of bundle, app and shared wins", function()
    local old, mid, new = nowMs() - 48 * HOUR, nowMs() - 2 * HOUR, nowMs() - 120 * 1000
    local c = standalone({
        guild = "Meow Pew Pew",
        bundle = v2(entry({ generatedAt = old })),
        data = v2(entry({ generatedAt = mid }), { "Corwin" }),
    })
    eq(c.ns.active.kind, "app", "app is newest")
    local shared = entry({ generatedAt = new })
    shared.sharedBy, shared.receivedAt = "Brisket", wow.clock.server
    c.env.GuildieDB.shared = { ["eu/meow-pew-pew"] = shared }
    c.ns.refreshActive()
    eq(c.ns.active.kind, "shared", "shared is newest")
    eq(c.ns.active.by, "Brisket", "shared by")
end)

test("bundle only, found by name when the slug differs (non-ASCII)", function()
    local e = entry({ name = "Ðawn", slug = "ðawn", generatedAt = 5 })
    local c = standalone({ guild = "Ðawn", bundle = { version = 2, generatedAt = 5, guilds = {
        ["eu/ðawn"] = e,
        ["eu/other"] = entry({ name = "Other", slug = "other", generatedAt = 5 }),
    } } })
    eq(c.ns.active.kind, "bundle", "found")
    eq(c.env.GuildieBundle.guilds["eu/other"], nil, "other guilds dropped from memory")
end)

test("v1 GuildieData.lua from an older app: used for its one guild", function()
    local reagents = entry({}).reagents
    local c = standalone({ guild = "Meow Pew Pew", data = {
        version = 1, generatedAt = nowMs(), guilds = { "Meow Pew Pew" }, mine = {}, reagents = reagents,
    } })
    eq(c.ns.active.kind, "app", "v1 used")
    eq(c.ns.activeAt(), 0, "but not shared with the guild")
    local d = standalone({ name = "Other", guild = "Meow Pew Pew", data = {
        version = 1, generatedAt = nowMs(), guilds = { "Meow Pew Pew", "Alt Guild" }, mine = {}, reagents = reagents,
    } })
    eq(d.ns.active, nil, "mixed guilds: not used")
end)

-- ---- Tooltip ------------------------------------------------------------------------------------

test("tooltip line skips your own characters", function()
    local c = standalone({ name = "Lexi", guild = "Meow Pew Pew", data = v2(entry({ generatedAt = nowMs() }), { "Corwin" }) })
    local lines = c:tooltip(2589)
    eq(#lines, 1, "one line")
    assert(lines[1]:find("Guildie|r might want this: |cff3fc7ebBrisket|r %(Tailoring%), |cfffff468Ðemo|r %(First Aid%)"), lines[1])
    eq(#c:tooltip(2318), 0, "Corwin is mine (from the app)")
    c.env.GuildieDB.characters = { x = { name = "Brisket" } }
    assert(not c:tooltip(2589)[1]:find("Brisket"), "characters this account played are mine too")
    eq(#c:tooltip(12345), 0, "unknown item")
end)

-- ---- Window ---------------------------------------------------------------------------------------

local function windowText(c)
    c.ns.showWindow()
    local w = c.env.GuildieWindow
    return w.guild:GetText(), w.guildData:GetText(), w.url.shown
end

test("window: where the data came from and how fresh", function()
    local c = standalone({ guild = "Meow Pew Pew", data = v2(entry({ generatedAt = nowMs() - 120 * 1000 })) })
    local guild, data, url = windowText(c)
    eq(guild, "Meow Pew Pew")
    eq(data, "Reagent tooltips from the Guildie app, 2 min ago (2 reagents).")
    eq(url, false, "no URL box")

    local shared = entry({ generatedAt = nowMs() - HOUR })
    shared.sharedBy, shared.receivedAt = "Brisket", wow.clock.server
    local s = standalone({ name = "Sam", guild = "Meow Pew Pew", db = { shared = { ["eu/meow-pew-pew"] = shared } } })
    eq(select(2, windowText(s)), "Reagent tooltips shared by Brisket, 1 hour ago (2 reagents).")

    local at = os.time({ year = 2026, month = 11, day = 9, hour = 12 }) * 1000
    local b = standalone({ name = "Bo", guild = "Meow Pew Pew", bundle = v2(entry({ generatedAt = at })) })
    eq(select(2, windowText(b)), "Reagent tooltips bundled with the addon, Nov 9 (2 reagents).")
end)

test("window: guild not on Guildie, and no guild", function()
    local c = standalone({ guild = "MeowPewPew" })
    local guild, _, url = windowText(c)
    eq(guild, "MeowPewPew isn't on Guildie yet. Add it at guildie.club")
    eq(url, true, "URL box shown")
    eq(c.env.GuildieWindow.url:GetText(), "https://guildie.club")
    local d = standalone({ name = "Solo", guild = nil })
    eq(windowText(d), "You're not in a guild, so there are no guild tooltips.")
end)

-- ---- Guild sync -----------------------------------------------------------------------------------

local ROSTER = { "Appy", "Bundy", "Newbie", "Late" }

local function guildOf(specs)
    wow.roster = ROSTER
    local clients = {}
    for _, spec in ipairs(specs) do
        spec.guild = spec.guild or "Meow Pew Pew"
        local c = wow.client(spec)
        wow.login(c)
        clients[spec.name] = c
    end
    return clients
end

local function sentBy(name, kind)
    local n = 0
    for _, m in ipairs(wow.channel.sent) do
        if m.from == name and (not kind or m.text:sub(1, 1) == kind) then n = n + 1 end
    end
    return n
end

test("sync: one member's app data reaches everyone, sent once, within limits", function()
    local fresh, stale = nowMs() - 60 * 1000, nowMs() - 30 * HOUR
    local g = guildOf({
        { name = "Appy", data = v2(entry({ generatedAt = fresh })) },
        { name = "Bundy", bundle = v2(entry({ generatedAt = stale })) },
        { name = "Newbie" },
    })
    wow.advance(180)
    for _, name in ipairs({ "Bundy", "Newbie" }) do
        local c = g[name]
        eq(c.ns.active.kind, "shared", name .. " uses shared data")
        eq(c.ns.active.by, "Appy", name .. " got it from Appy")
        eq(c.ns.activeAt(), fresh, name .. " has the fresh version")
        eq(c.env.GuildieDB.shared["eu/meow-pew-pew"].reagents[2589].users[1].name, "Brisket", "kept in SavedVariables")
        assert(c:tooltip(2589)[1]:find("Brisket"), "tooltip works")
    end
    eq(sentBy("Appy", "S"), 1, "Appy sent one transfer")
    eq(sentBy("Bundy", "S") + sentBy("Newbie", "S"), 0, "nobody else sent data")
    eq(wow.channel.throttled, 0, "never hit the game's throttle")
    -- Bandwidth: at most one message per 1.2 s per sender.
    local last = {}
    for _, m in ipairs(wow.channel.sent) do
        if last[m.from] then assert(m.at - last[m.from] >= 1.19 or m.text:sub(1, 1) == "H", "too fast") end
        last[m.from] = m.at
    end
    -- And quiet afterwards: periodic announces only.
    local before = #wow.channel.sent
    wow.advance(3600)
    for i = before + 1, #wow.channel.sent do eq(wow.channel.sent[i].text:sub(1, 1), "H", "only announces") end
    eq(sentBy("Appy", "S"), 1, "no resend")
end)

test("sync: a late login gets caught up by one of those who have it", function()
    local g = guildOf({
        { name = "Appy", data = v2(entry({ generatedAt = nowMs() - 60 * 1000 })) },
        { name = "Bundy", bundle = v2(entry({ generatedAt = nowMs() - 30 * HOUR })) },
    })
    wow.advance(120)
    local transfers = sentBy("Appy", "S") + sentBy("Bundy", "S")
    local late = wow.client({ name = "Late", guild = "Meow Pew Pew" })
    wow.login(late)
    wow.advance(120)
    eq(late.ns.active and late.ns.active.kind, "shared", "Late caught up")
    eq(late.ns.activeAt(), g.Appy.ns.activeAt(), "with the newest version")
    eq(sentBy("Appy", "S") + sentBy("Bundy", "S"), transfers + 1, "sent once, by Appy or Bundy")
end)

test("sync: two members with different versions: the newest ends up everywhere", function()
    local g = guildOf({
        { name = "Appy", data = v2(entry({ generatedAt = nowMs() - 60 * 1000 })) },
        { name = "Bundy", bundle = v2(entry({ generatedAt = nowMs() - 30 * HOUR })) },
        { name = "Newbie", bundle = v2(entry({ generatedAt = nowMs() - 5 * HOUR })) },
    })
    wow.advance(600)
    for _, name in ipairs({ "Bundy", "Newbie" }) do
        eq(g[name].ns.activeAt(), g.Appy.ns.activeAt(), name .. " has the newest")
    end
end)

test("sync: ignores outsiders, other guilds, future dates and damage", function()
    local g = guildOf({ { name = "Bundy", bundle = v2(entry({ generatedAt = nowMs() - HOUR })) } })
    local c = g.Bundy
    local Wire = c.ns.Wire
    local function transfer(sender, e, key, mangle)
        local text = Wire.encode(e)
        local sum = Wire.checksum(text)
        if mangle then text = mangle(text) end
        local chunks = math.ceil(#text / 230)
        c:fire("CHAT_MSG_ADDON", "Guildie", string.format("S1 abcd %s %.0f %d %d %.0f", key or "eu/meow-pew-pew", e.generatedAt, chunks, #text, sum), "GUILD", sender)
        for i = 1, chunks do
            c:fire("CHAT_MSG_ADDON", "Guildie", "C1 abcd " .. i .. " " .. text:sub((i - 1) * 230 + 1, i * 230), "GUILD", sender)
        end
    end
    local newer = entry({ generatedAt = nowMs() - 60 * 1000 })
    transfer("Stranger", newer)
    eq(c.ns.active.kind, "bundle", "not from someone outside the guild")
    transfer("Appy", entry({ name = "Other", slug = "other", generatedAt = nowMs() }), "eu/other")
    eq(c.ns.active.kind, "bundle", "not for another guild key")
    transfer("Appy", entry({ name = "Other", slug = "meow-pew-pew", generatedAt = nowMs() }))
    eq(c.ns.active.kind, "bundle", "not when the data names another guild")
    transfer("Appy", entry({ generatedAt = nowMs() + 24 * HOUR }))
    eq(c.ns.active.kind, "bundle", "not from the future")
    transfer("Appy", newer, nil, function(t) return t:gsub("Brisket", "Brisker") end)
    eq(c.ns.active.kind, "bundle", "not when the checksum fails")
    transfer("Appy", entry({ generatedAt = nowMs() - 2 * HOUR }))
    eq(c.ns.active.kind, "bundle", "not older data")
    c:fire("CHAT_MSG_ADDON", "Guildie", "S1 abcd eu/meow-pew-pew 1 99999 99999999 1", "GUILD", "Appy")
    c:fire("CHAT_MSG_ADDON", "Guildie", "garbage", "GUILD", "Appy")
    c:fire("CHAT_MSG_ADDON", "Guildie", "H1 eu/meow-pew-pew notanumber", "GUILD", "Appy")
    transfer("Appy", newer)
    eq(c.ns.active.kind, "shared", "a guildmate's newer data is taken")
    eq(c.ns.active.by, "Appy", "from Appy")
end)

-- ---- Real data (optional) -------------------------------------------------------------------------

local bundlePath = arg[1]
if bundlePath then
    test("sync: a real bundle survives the trip (" .. bundlePath .. ")", function()
        local env = {}
        local chunk = assert(loadfile(bundlePath))
        setfenv(chunk, env)
        chunk()
        local key, e = next(env.GuildieBundle.guilds)
        assert(key, "the bundle has no guilds")
        -- The app's copy, an hour newer than the bundle's.
        local fresh = {}
        for k, v in pairs(e) do fresh[k] = v end
        fresh.generatedAt = nowMs() - 60 * 1000
        local g = guildOf({
            { name = "Appy", guild = e.name, region = ({ us = 1, kr = 2, eu = 3, tw = 4 })[e.region], data = { version = 2, guilds = { [key] = fresh } } },
            { name = "Bundy", guild = e.name, region = ({ us = 1, kr = 2, eu = 3, tw = 4 })[e.region], bundle = env.GuildieBundle },
        })
        local bytes = #g.Appy.ns.Wire.encode(fresh)
        wow.advance(60 + bytes / 230 * 1.2 + 30)
        local got = g.Bundy.ns.active
        eq(got.kind, "shared", "received")
        local count, users = 0, 0
        for id, r in pairs(e.reagents) do
            count = count + 1
            users = users + #r.users
            local mine = got.entry.reagents[id]
            assert(mine and #mine.users == #r.users, "reagent " .. id)
            for i, u in ipairs(r.users) do
                assert(mine.users[i].name == u.name and mine.users[i].profession == u.profession and mine.users[i].recipes == u.recipes)
            end
        end
        print(string.format("     %s: %d reagents, %d users, %d bytes on the wire, ~%ds to send", e.name, count, users, bytes, math.ceil(bytes / 230 * 1.2)))
    end)
end

wow.done()
