-- Guild sync: guildmates' addons pass the newest tooltip data around, so one
-- member with the Guildie app (or a fresh addon release) keeps the whole guild
-- current. Addon messages on the GUILD channel, prefix "Guildie":
--
--   H1 <key> <generatedAt>                         "I have this" (0: nothing)
--   S1 <id> <key> <generatedAt> <chunks> <bytes> <checksum>   a transfer starts
--   C1 <id> <n> <text>                             chunk n of the Wire text
--
-- Each member announces H after login (15-45 s, again at ~5 min, then every
-- 20 min). Hearing an older H, a member with newer data offers it after a
-- random 1-5 s, unless someone starts sending that version (or newer) first.
-- Hearing a newer H, a member with older data answers with its own H (2-8 s,
-- skipped if someone else already did), which makes the newer one send.
-- Transfers go to the whole guild, so everyone behind catches up at once.
--
-- Sending is one message per 1.2 s (about 200 bytes/s), under the game's
-- per-prefix limit. Received data is parsed by Wire.decode, never run; it's
-- kept only if it's for our guild, from a guild member, and newer than ours.
-- Silent: nothing goes to chat. "/guildie sync" shows what it's doing.

local ADDON, ns = ...

local PREFIX = "Guildie"
local CHUNK = 230 -- text per message; with "C1 <id> <n> " it stays under the 255-byte limit
local SEND_INTERVAL = 1.2
local FIRST_ANNOUNCE = { 15, 45 }
local SECOND_ANNOUNCE = { 300, 360 }
local ANNOUNCE_EVERY = 20 * 60
local OFFER_DELAY = { 1, 5 }
local REPLY_DELAY = { 2, 8 }
local RESEND_COOLDOWN = 180 -- don't send the same data twice within this long
local TRANSFER_TIMEOUT = 90 -- give up on a transfer silent this long
local MAX_INCOMING = 3
local FUTURE_SLACK_MS = 10 * 60 * 1000 -- generatedAt beyond now + this is a lie
local MAX_CHUNKS = math.ceil(ns.Wire.MAX_BYTES / CHUNK)

local sync = {
    queue = {},
    incoming = {},
    log = {},
}
ns.sync = sync

local function now() return GetTime() end
local function between(range) return range[1] + math.random() * (range[2] - range[1]) end
local function after(seconds, fn) if C_Timer then C_Timer.After(seconds, fn) end end
local function ms(n) return string.format("%.0f", n) end

local function note(text)
    table.insert(sync.log, 1, { at = now(), text = text })
    sync.log[6] = nil
    if ns.onSyncChange then ns.onSyncChange() end
end

-- ---- Who's in the guild -----------------------------------------------------------

local roster, rosterDirty = {}, true

local function shortName(name)
    return (Ambiguate and Ambiguate(name, "none") or name):match("^[^%-]+") or name
end

local function isGuildmate(sender)
    if rosterDirty then
        rosterDirty = false
        roster = {}
        for i = 1, (GetNumGuildMembers and GetNumGuildMembers() or 0) do
            local name = GetGuildRosterInfo(i)
            if name then
                roster[name] = true
                roster[shortName(name)] = true
            end
        end
    end
    return roster[sender] or roster[shortName(sender)] or false
end

local function isMe(sender)
    local me = UnitName("player")
    return sender == me or shortName(sender) == me
end

-- ---- Sending: one message per SEND_INTERVAL ------------------------------------------

local ticker

local function rawSend(text)
    if C_ChatInfo and C_ChatInfo.SendAddonMessage then return C_ChatInfo.SendAddonMessage(PREFIX, text, "GUILD") end
    if SendAddonMessage then return SendAddonMessage(PREFIX, text, "GUILD") end
end

-- Newer clients say why a message wasn't sent; on a throttle, try again next tick.
local function throttled(result)
    local R = Enum and Enum.SendAddonMessageResult
    return R ~= nil and result ~= nil and (result == R.AddonMessageThrottle or result == R.ChannelThrottle)
end

local function pump()
    local item = sync.queue[1]
    if not item or not IsInGuild() then
        wipe(sync.queue)
        if ticker then ticker:Cancel() end
        ticker = nil
        return
    end
    local ok, result = pcall(rawSend, item.text)
    if ok and throttled(result) and item.tries < 10 then
        item.tries = item.tries + 1
        return
    end
    table.remove(sync.queue, 1)
end

local function enqueue(text)
    table.insert(sync.queue, { text = text, tries = 0 })
    if not ticker and C_Timer and C_Timer.NewTicker then
        pump()
        ticker = C_Timer.NewTicker(SEND_INTERVAL, pump)
    end
end

-- ---- Announcing and offering -------------------------------------------------------

local function ourKey() return ns.guild and ns.guild.key end

function sync.announce()
    local key = ourKey()
    if not key or #sync.queue > 0 then return end
    enqueue("H1 " .. key .. " " .. ms(ns.activeAt()))
    sync.lastAnnounceAt = now()
end

local function sendData()
    local key, at = ourKey(), ns.activeAt()
    if not key or at == 0 or #sync.queue > 0 then return end
    local entry = ns.active.entry
    local text = ns.Wire.encode({
        name = entry.name or ns.guild.name,
        region = entry.region or ns.guild.region,
        slug = entry.slug or ns.slug(ns.guild.name),
        generatedAt = at,
        reagents = entry.reagents,
    })
    if #text > ns.Wire.MAX_BYTES then return end
    local id = string.format("%04x", math.random(0, 65535))
    local chunks = math.ceil(#text / CHUNK)
    enqueue(table.concat({ "S1", id, key, ms(at), chunks, #text, ms(ns.Wire.checksum(text)) }, " "))
    for i = 1, chunks do
        enqueue("C1 " .. id .. " " .. i .. " " .. text:sub((i - 1) * CHUNK + 1, i * CHUNK))
    end
    sync.sentAt, sync.sentVersion = now(), at
    note(string.format("sending to the guild (%d messages)", chunks + 1))
end

-- Someone has older data: offer ours, unless someone beats us to it.
local function scheduleOffer()
    local at = ns.activeAt()
    if sync.offerPending or at == 0 or #sync.queue > 0 then return end
    if sync.sentVersion == at and now() - sync.sentAt < RESEND_COOLDOWN then return end
    sync.offerPending = true
    local scheduledAt = now()
    after(between(OFFER_DELAY), function()
        sync.offerPending = false
        local seen = sync.transferSeen
        if seen and seen.at >= scheduledAt and seen.version >= ns.activeAt() then return end
        sendData()
    end)
end

-- Someone has newer data: ask for it (with an H of our own), unless someone else already did.
local function scheduleReply(theirs)
    if sync.replyPending then return end
    sync.replyPending = true
    local scheduledAt = now()
    after(between(REPLY_DELAY), function()
        sync.replyPending = false
        if ns.activeAt() >= theirs then return end
        if sync.askSeenAt and sync.askSeenAt >= scheduledAt then return end
        local seen = sync.transferSeen
        if seen and seen.at >= scheduledAt and seen.version > ns.activeAt() then return end
        sync.announce()
    end)
end

-- ---- Receiving -------------------------------------------------------------------------

local function dropStale()
    for k, t in pairs(sync.incoming) do
        if now() - t.last > TRANSFER_TIMEOUT then sync.incoming[k] = nil end
    end
end

local function receiving(version)
    for _, t in pairs(sync.incoming) do
        if t.version == version then return true end
    end
    return false
end

local function count(t)
    local n = 0
    for _ in pairs(t) do n = n + 1 end
    return n
end

local function finish(id, t)
    sync.incoming[id] = nil
    local text = table.concat(t.parts)
    if #text ~= t.bytes or ns.Wire.checksum(text) ~= t.sum then
        note("a transfer from " .. t.from .. " arrived damaged; ignored")
        return
    end
    local entry, why = ns.Wire.decode(text)
    if not entry or entry.generatedAt ~= t.version then
        note("ignored data from " .. t.from .. " (" .. tostring(why or "version") .. ")")
        return
    end
    if ns.storeShared(entry, t.from) then
        sync.lastReceived = { from = t.from, at = now(), version = entry.generatedAt }
        note("got newer data from " .. t.from)
    end
end

local handlers = {}

function handlers.H(sender, rest)
    local key, version = rest:match("^(%S+) (%d+)$")
    version = tonumber(version)
    if key ~= ourKey() or not version then return end
    local mine = ns.activeAt()
    -- An H older than the newest we've heard is someone asking: no need for us to ask too.
    if sync.newestSeen and version < sync.newestSeen then sync.askSeenAt = now() end
    if version < mine then
        scheduleOffer()
    elseif version > mine and version <= ns.nowMs() + FUTURE_SLACK_MS then
        sync.newestSeen = math.max(sync.newestSeen or 0, version)
        scheduleReply(version)
    end
end

function handlers.S(sender, rest)
    local id, key, version, chunks, bytes, sum = rest:match("^(%x%x%x%x) (%S+) (%d+) (%d+) (%d+) (%d+)$")
    version, chunks, bytes, sum = tonumber(version), tonumber(chunks), tonumber(bytes), tonumber(sum)
    if key ~= ourKey() or not version then return end
    -- Remember the newest transfer lately started, so pending offers of that version (or older) stand down.
    local seen = sync.transferSeen
    if not seen or now() - seen.at > 120 or version >= seen.version then
        sync.transferSeen = { at = now(), version = version }
    end
    if version <= ns.activeAt() or version > ns.nowMs() + FUTURE_SLACK_MS then return end
    if chunks < 1 or chunks > MAX_CHUNKS or bytes > ns.Wire.MAX_BYTES or chunks ~= math.ceil(bytes / CHUNK) then return end
    dropStale()
    if receiving(version) or count(sync.incoming) >= MAX_INCOMING then return end
    sync.incoming[sender .. " " .. id] = {
        from = shortName(sender), version = version, chunks = chunks, bytes = bytes, sum = sum,
        parts = {}, last = now(),
    }
end

function handlers.C(sender, rest)
    local id, n, text = rest:match("^(%x%x%x%x) (%d+) (.*)$")
    local t = id and sync.incoming[sender .. " " .. id]
    if not t then return end
    -- One sender's messages arrive in order; a gap means the transfer is broken.
    if tonumber(n) ~= #t.parts + 1 or #text > CHUNK then
        sync.incoming[sender .. " " .. id] = nil
        return
    end
    table.insert(t.parts, text)
    t.last = now()
    if #t.parts == t.chunks then finish(sender .. " " .. id, t) end
end

local function onMessage(prefix, message, channel, sender)
    if prefix ~= PREFIX or channel ~= "GUILD" or not sender or isMe(sender) then return end
    local kind, rest = message:match("^(%u)1 (.*)$")
    local handler = kind and handlers[kind]
    if not handler or not ourKey() then return end
    if not isGuildmate(sender) then
        rosterDirty = true
        return
    end
    handler(sender, rest)
end
sync.onMessage = onMessage

-- ---- Schedule ----------------------------------------------------------------------------

local started
local function start()
    if started or not ourKey() then return end
    started = true
    after(between(FIRST_ANNOUNCE), sync.announce)
    after(between(SECOND_ANNOUNCE), sync.announce)
    after(between(SECOND_ANNOUNCE) + ANNOUNCE_EVERY, function()
        sync.announce()
        if C_Timer and C_Timer.NewTicker then C_Timer.NewTicker(ANNOUNCE_EVERY, sync.announce) end
    end)
end
ns.onDataChange(start)

--- One line for the window (/guildie sync).
function sync.status()
    local parts = {}
    if not ourKey() then return "Guild sync: waiting for your guild." end
    if #sync.queue > 0 then table.insert(parts, string.format("sending, %d messages left", #sync.queue)) end
    if count(sync.incoming) > 0 then table.insert(parts, string.format("receiving %d", count(sync.incoming))) end
    for _, entry in ipairs(sync.log) do
        table.insert(parts, string.format("%s (%ds ago)", entry.text, math.floor(now() - entry.at)))
        if #parts >= 3 then break end
    end
    if sync.lastAnnounceAt then table.insert(parts, string.format("announced %ds ago", math.floor(now() - sync.lastAnnounceAt))) end
    if #parts == 0 then table.insert(parts, "starts shortly after login") end
    return "Guild sync: " .. table.concat(parts, "; ")
end

if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then
    C_ChatInfo.RegisterAddonMessagePrefix(PREFIX)
elseif RegisterAddonMessagePrefix then
    RegisterAddonMessagePrefix(PREFIX)
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("CHAT_MSG_ADDON")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")
frame:SetScript("OnEvent", function(_, event, ...)
    if event == "GUILD_ROSTER_UPDATE" then
        rosterDirty = true
    else
        onMessage(...)
    end
end)
