-- Which guild you're in, and the tooltip data for it. Three places can have
-- it, and the newest (by generatedAt) wins:
--   bundle  GuildieBundle.lua: every public guild, shipped with each addon release
--   app     GuildieData.lua: written by the Guildie app for your own guilds
--   shared  GuildieDB.shared: sent by a guildmate's addon (GuildSync.lua)
-- All three are optional. Addons can't use the internet, so files only change
-- at login or /reload; guild sync is what changes data in between.

local ADDON, ns = ...

-- GetCurrentRegion(): 1 US (and Oceania, Latin America), 2 Korea, 3 Europe, 4 Taiwan, 5 China.
local REGIONS = { [1] = "us", [2] = "kr", [3] = "eu", [4] = "tw" }
-- Shared data nobody has refreshed in this long is dropped.
local SHARED_MAX_AGE = 60 * 24 * 3600

--- The server's guildSlug (apps/web/convex/shared/wow.ts): trimmed, lowercase, spaces as hyphens.
--- Lua lowercases ASCII only, so non-ASCII names can differ; lookups fall back to the guild's name.
function ns.slug(name)
    name = name:gsub("^%s+", ""):gsub("%s+$", "")
    return (name:lower():gsub("%s+", "-"))
end

function ns.region()
    local id = GetCurrentRegion and GetCurrentRegion()
    if REGIONS[id] then return REGIONS[id] end
    local name = GetCurrentRegionName and GetCurrentRegionName()
    if type(name) == "string" then return ({ US = "us", KR = "kr", EU = "eu", TW = "tw" })[name:upper()] end
end

--- Milliseconds, like the server's generatedAt.
function ns.nowMs()
    return (GetServerTime and GetServerTime() or time()) * 1000
end

-- ---- Guild detection -----------------------------------------------------------

-- ns.guild: nil until known; false when not in a guild; else { name, region, key }.
ns.guild = nil
-- ns.active: the data in use for ns.guild: { entry, kind = "bundle"|"app"|"shared", by = sender } or nil.
ns.active = nil

local function v2Entry(container, guild)
    if type(container) ~= "table" or container.version ~= 2 or type(container.guilds) ~= "table" then return nil end
    local entry = container.guilds[guild.key]
    if type(entry) == "table" then return entry end
    for _, e in pairs(container.guilds) do
        if type(e) == "table" and e.region == guild.region and e.name == guild.name then return e end
    end
end

-- Files written by Guildie app 0.2 and the helper: every guild's reagents merged.
-- Used for this guild only when it's the only guild in the file.
local function v1Entry(data, guild)
    if type(data) ~= "table" or data.version ~= 1 or type(data.reagents) ~= "table" then return nil end
    local guilds = type(data.guilds) == "table" and data.guilds or {}
    if #guilds ~= 1 or guilds[1] ~= guild.name then return nil end
    return { name = guild.name, region = guild.region, generatedAt = tonumber(data.generatedAt) or 0, reagents = data.reagents, legacy = true }
end

local function sharedStore()
    GuildieDB.shared = type(GuildieDB.shared) == "table" and GuildieDB.shared or {}
    return GuildieDB.shared
end

--- Every copy we have for the guild: { { entry, kind, by } ... }.
function ns.sources(guild)
    local list = {}
    local bundled = v2Entry(GuildieBundle, guild)
    if bundled then table.insert(list, { entry = bundled, kind = "bundle" }) end
    local app = v2Entry(GuildieData, guild) or v1Entry(GuildieData, guild)
    if app then table.insert(list, { entry = app, kind = "app" }) end
    local shared = sharedStore()[guild.key]
    if type(shared) == "table" and type(shared.reagents) == "table" then
        table.insert(list, { entry = shared, kind = "shared", by = shared.sharedBy })
    end
    return list
end

local RANK = { app = 3, shared = 2, bundle = 1 }

function ns.pick(guild)
    local best
    for _, s in ipairs(ns.sources(guild)) do
        local at = tonumber(s.entry.generatedAt) or 0
        local bestAt = best and (tonumber(best.entry.generatedAt) or 0)
        if not best or at > bestAt or (at == bestAt and RANK[s.kind] > RANK[best.kind]) then best = s end
    end
    return best
end

--- The generatedAt of what we'd share, or 0. Old-format app files aren't shared (they may mix guilds).
function ns.activeAt()
    if not ns.active or ns.active.entry.legacy then return 0 end
    return tonumber(ns.active.entry.generatedAt) or 0
end

local listeners = {}
function ns.onDataChange(fn) table.insert(listeners, fn) end
local function changed()
    for _, fn in ipairs(listeners) do fn() end
end

function ns.refreshActive()
    ns.active = ns.guild and ns.pick(ns.guild) or nil
    changed()
end

-- The bundle holds every public guild; once we know ours, let the rest go.
-- Joining another guild mid-session finds its data after the next /reload.
local function pruneBundle(guild)
    if type(GuildieBundle) ~= "table" or type(GuildieBundle.guilds) ~= "table" then return end
    local mine = v2Entry(GuildieBundle, guild)
    GuildieBundle.guilds = mine and { [guild.key] = mine } or {}
end

function ns.detectGuild()
    local guild
    if IsInGuild and not IsInGuild() then
        guild = false
    else
        local name = GetGuildInfo("player")
        local region = ns.region()
        if not name or not region then return end -- not loaded yet; GUILD_ROSTER_UPDATE retries
        guild = { name = name, region = region, key = region .. "/" .. ns.slug(name) }
    end
    local old = ns.guild
    if old == guild or (old and guild and old.key == guild.key) then return end
    ns.guild = guild
    if guild then pruneBundle(guild) end
    ns.refreshActive()
end

--- Store data a guildmate sent; true if it's newer than what we use and now in use.
function ns.storeShared(entry, sender)
    local guild = ns.guild
    if not guild or entry.region ~= guild.region or entry.name ~= guild.name then return false end
    if entry.generatedAt <= ns.activeAt() then return false end
    entry.sharedBy = sender
    entry.receivedAt = time()
    sharedStore()[guild.key] = entry
    ns.refreshActive()
    return true
end

local function pruneShared()
    local store = sharedStore()
    for key, entry in pairs(store) do
        if type(entry) ~= "table" or (tonumber(entry.receivedAt) or 0) < time() - SHARED_MAX_AGE then store[key] = nil end
    end
end

-- ---- Your own characters (tooltips skip them) ------------------------------------

function ns.isMine(name)
    if name == UnitName("player") then return true end
    for _, mine in ipairs(type(GuildieData) == "table" and type(GuildieData.mine) == "table" and GuildieData.mine or {}) do
        if mine == name then return true end
    end
    -- Characters this account played with the addon (SavedVariables are per account).
    for _, c in pairs(type(GuildieDB.characters) == "table" and GuildieDB.characters or {}) do
        if c.name == name then return true end
    end
    return false
end

-- ---- Events ------------------------------------------------------------------------

local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("PLAYER_GUILD_UPDATE")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")
frame:SetScript("OnEvent", function(_, event, unit)
    if event == "PLAYER_GUILD_UPDATE" and unit and unit ~= "player" then return end
    if event == "PLAYER_LOGIN" then
        pruneShared()
        -- Ask for the roster: GetGuildInfo can be empty until it arrives.
        if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
    end
    ns.detectGuild()
end)
