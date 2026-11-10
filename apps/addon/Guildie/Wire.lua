-- The text form of one guild's tooltip data, for guild sync (GuildSync.lua).
-- Received text comes from other players, so it is parsed by hand, field by
-- field, with every type, range and size checked. It is never run as code.
--
-- Compact, since addon messages are slow (about 250 bytes a second): reagent
-- names are left out (the item's own tooltip has them), and members and
-- professions are listed once and referred to by number.
--
--   2#<region>#<slug>#<guild name>#<generatedAt>#<members>#<professions>#<reagents>
--   members:     Name,classId;Name,classId;...
--   professions: Tailoring;Alchemy;...
--   reagents:    itemId:member.profession.recipes,member.profession.recipes;itemId:...
--
-- Inside a field, anything but letters, digits, ' _ - is written as ~XX (hex
-- byte), so the result is printable ASCII without spaces (nothing for the chat
-- system to trim at a chunk's edge) and the separators can't appear in names.

local ADDON, ns = ...

local Wire = {}
ns.Wire = Wire

Wire.MAX_BYTES = 128 * 1024
local MAX_MEMBERS = 1000
local MAX_PROFESSIONS = 32
local MAX_REAGENTS = 4000
local MAX_USERS = 8
local MAX_NAME = 48
local REGIONS = { us = true, eu = true, kr = true, tw = true }

local function escape(s)
    return (tostring(s):gsub("[^%w_'%-]", function(c) return string.format("~%02X", c:byte()) end))
end

-- nil if the field has anything but the allowed characters and well-formed escapes.
local function unescape(s)
    if not s or s:find("[^%w_'%-~]") then return nil end
    if s:gsub("~%x%x", ""):find("~", 1, true) then return nil end
    return (s:gsub("~(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

-- A name as shown in game: some text, no control characters, and no "|",
-- which would let it inject colors, textures or links into a tooltip.
local function validName(s)
    return type(s) == "string" and #s > 0 and #s <= MAX_NAME and not s:find("[%c|]")
end

local function int(s, min, max)
    if not s or not s:find("^%d+$") or #s > 15 then return nil end
    local n = tonumber(s)
    if n < min or n > max then return nil end
    return n
end

local function split(s, sep)
    local parts = {}
    if s == "" then return parts end
    local start = 1
    while true do
        local i = s:find(sep, start, true)
        if not i then
            table.insert(parts, s:sub(start))
            return parts
        end
        table.insert(parts, s:sub(start, i - 1))
        start = i + 1
    end
end

--- entry: { name, region, slug, generatedAt, reagents = { [itemId] = { users = { { name, classId, profession, recipes } } } } }
function Wire.encode(entry)
    local members, memberIndex = {}, {}
    local professions, professionIndex = {}, {}
    local reagents = {}
    local ids = {}
    for itemId in pairs(entry.reagents or {}) do
        if type(itemId) == "number" then table.insert(ids, itemId) end
    end
    table.sort(ids)
    for _, itemId in ipairs(ids) do
        local users = {}
        for _, user in ipairs(entry.reagents[itemId].users or {}) do
            if #users >= MAX_USERS then break end
            if validName(user.name) and validName(user.profession) then
                local mkey = user.name .. "," .. tostring(user.classId)
                local m = memberIndex[mkey]
                if not m then
                    table.insert(members, escape(user.name) .. "," .. string.format("%d", tonumber(user.classId) or 0))
                    m = #members
                    memberIndex[mkey] = m
                end
                local p = professionIndex[user.profession]
                if not p then
                    table.insert(professions, escape(user.profession))
                    p = #professions
                    professionIndex[user.profession] = p
                end
                table.insert(users, string.format("%d.%d.%d", m, p, math.max(1, math.floor(tonumber(user.recipes) or 1))))
            end
        end
        if #users > 0 then table.insert(reagents, string.format("%d", itemId) .. ":" .. table.concat(users, ",")) end
    end
    return table.concat({
        "2",
        escape(entry.region),
        escape(entry.slug),
        escape(entry.name),
        string.format("%.0f", entry.generatedAt or 0),
        table.concat(members, ";"),
        table.concat(professions, ";"),
        table.concat(reagents, ";"),
    }, "#")
end

--- The entry, or nil and why not.
function Wire.decode(text)
    if type(text) ~= "string" or #text > Wire.MAX_BYTES then return nil, "too big" end
    local parts = split(text, "#")
    if #parts ~= 8 or parts[1] ~= "2" then return nil, "not version 2" end
    local region, slug, name = unescape(parts[2]), unescape(parts[3]), unescape(parts[4])
    if not region or not REGIONS[region] then return nil, "region" end
    if not slug or #slug == 0 or #slug > 64 or slug:find("[%c|/]") then return nil, "slug" end
    if not validName(name) then return nil, "name" end
    local generatedAt = int(parts[5], 1, 1e14)
    if not generatedAt then return nil, "generatedAt" end

    local members = {}
    for _, m in ipairs(split(parts[6], ";")) do
        if #members >= MAX_MEMBERS then return nil, "members" end
        local mname, classId = m:match("^([^,]*),(%d+)$")
        mname = unescape(mname)
        classId = int(classId, 0, 99)
        if not validName(mname) or not classId then return nil, "member" end
        table.insert(members, { name = mname, classId = classId })
    end

    local professions = {}
    for _, p in ipairs(split(parts[7], ";")) do
        if #professions >= MAX_PROFESSIONS then return nil, "professions" end
        p = unescape(p)
        if not validName(p) then return nil, "profession" end
        table.insert(professions, p)
    end

    local reagents, count = {}, 0
    for _, r in ipairs(split(parts[8], ";")) do
        count = count + 1
        if count > MAX_REAGENTS then return nil, "reagents" end
        local id, list = r:match("^(%d+):(.+)$")
        local itemId = int(id, 1, 9999999)
        if not itemId or reagents[itemId] then return nil, "reagent" end
        local users = {}
        for _, u in ipairs(split(list, ",")) do
            if #users >= MAX_USERS then return nil, "users" end
            local m, p, n = u:match("^(%d+)%.(%d+)%.(%d+)$")
            local member = members[int(m, 1, MAX_MEMBERS) or 0]
            local profession = professions[int(p, 1, MAX_PROFESSIONS) or 0]
            local recipes = int(n, 1, 100000)
            if not member or not profession or not recipes then return nil, "user" end
            table.insert(users, { name = member.name, classId = member.classId, profession = profession, recipes = recipes })
        end
        reagents[itemId] = { users = users }
    end
    return { name = name, region = region, slug = slug, generatedAt = generatedAt, reagents = reagents }
end

--- Adler-32 style checksum, to catch a transfer put together wrong.
function Wire.checksum(text)
    local a, b = 1, 0
    for i = 1, #text do
        a = (a + text:byte(i)) % 65521
        b = (b + a) % 65521
    end
    return b * 65536 + a
end
