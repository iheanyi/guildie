-- guildie: saves this character's current talents (and level) so the guildie
-- desktop helper can upload them to guildie.club. Addons can't use the
-- internet; the game writes GuildieDB to disk on /reload and on logout, and the
-- helper watches that file. Source: https://github.com/natedunn/guildie
--
-- Talents are read the way the WowSims exporter reads WoW: Forever's (MIT,
-- https://github.com/wowsims/exporter): C_ClassTalents / C_Traits. Each talent
-- is sent as its TraitDefinition ID, which is the same ID Blizzard's web API
-- uses, so guildie.club knows its class and tree.

local ADDON, ns = ...
local VERSION = 1

GuildieDB = GuildieDB or {}

local function activeConfigID()
    if C_ClassTalents and C_ClassTalents.GetActiveConfigID then
        return C_ClassTalents.GetActiveConfigID()
    end
    if C_SpecializationInfo and C_SpecializationInfo.GetCombatConfigIDForSpecGroup then
        local group = C_SpecializationInfo.GetActiveSpecGroup and C_SpecializationInfo.GetActiveSpecGroup() or 1
        return C_SpecializationInfo.GetCombatConfigIDForSpecGroup(group)
    end
end

local function talentName(configID, definitionID)
    local def = C_Traits.GetDefinitionInfo and C_Traits.GetDefinitionInfo(definitionID)
    if not def then return nil end
    if def.overrideName and def.overrideName ~= "" then return def.overrideName end
    local spellID = def.spellID or def.overriddenSpellID
    if not spellID then return nil end
    if C_Spell and C_Spell.GetSpellName then return C_Spell.GetSpellName(spellID) end
    if GetSpellInfo then return (GetSpellInfo(spellID)) end
end

--- Talents with points: { { id = definitionID, rank = n, name = "..." }, ... }, or nil if unreadable.
local function readTalents()
    if not C_Traits then return nil end
    local configID = activeConfigID()
    if not configID then return nil end
    local config = C_Traits.GetConfigInfo(configID)
    if not config or not config.treeIDs then return nil end
    local talents = {}
    for _, treeID in ipairs(config.treeIDs) do
        for _, nodeID in ipairs(C_Traits.GetTreeNodes(treeID) or {}) do
            local node = C_Traits.GetNodeInfo(configID, nodeID)
            local rank = node and (node.currentRank or node.ranksPurchased) or 0
            if rank > 0 and node.activeEntry then
                local entry = C_Traits.GetEntryInfo(configID, node.activeEntry.entryID)
                if entry and entry.definitionID then
                    table.insert(talents, {
                        id = entry.definitionID,
                        rank = rank,
                        name = talentName(configID, entry.definitionID),
                    })
                end
            end
        end
    end
    return talents
end

-- Minimal JSON encoder: strings, numbers, booleans, arrays and string-keyed tables.
local function encode(value)
    local t = type(value)
    if t == "string" then
        return '"' .. value:gsub('[%c"\\]', function(c)
            local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
            return map[c] or string.format("\\u%04x", c:byte())
        end) .. '"'
    elseif t == "number" then
        return tostring(value)
    elseif t == "boolean" then
        return value and "true" or "false"
    elseif t == "table" then
        local parts = {}
        if #value > 0 or next(value) == nil then
            for _, v in ipairs(value) do table.insert(parts, encode(v)) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        for k, v in pairs(value) do
            table.insert(parts, encode(tostring(k)) .. ":" .. encode(v))
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return "null"
end

--- A short fingerprint of what we'd upload, to tell whether it changed.
local function fingerprint(character)
    local parts = { tostring(character.level) }
    for _, t in ipairs(character.talents) do table.insert(parts, t.id .. ":" .. t.rank) end
    table.sort(parts)
    return table.concat(parts, ",")
end

local function capture(reason)
    local guid = UnitGUID("player")
    if not guid then return end
    local ok, talents = pcall(readTalents)
    local _, classToken = UnitClass("player")
    GuildieDB.characters = GuildieDB.characters or {}
    local previous = GuildieDB.characters[guid]
    GuildieDB.characters[guid] = {
        guid = guid,
        name = UnitName("player"),
        level = UnitLevel("player"),
        classToken = classToken,
        capturedAt = GetServerTime(),
        -- Keep the last good read if talents can't be read right now.
        talents = (ok and talents) or (previous and previous.talents) or {},
    }
    -- What the helper uploads, as-is: { version, characters = [ ... ] }.
    local list = {}
    for _, character in pairs(GuildieDB.characters) do table.insert(list, character) end
    GuildieDB.version = VERSION
    GuildieDB.payload = encode({ version = VERSION, characters = list })
    GuildieDB.lastReason = reason
    -- The game wrote GuildieDB to disk when this session's UI loaded; anything
    -- different since then reaches the helper only at the next /reload or logout.
    local now = fingerprint(GuildieDB.characters[guid])
    ns.loadedFingerprint = ns.loadedFingerprint or now
    ns.dirty = now ~= ns.loadedFingerprint
    if ns.onCapture then ns.onCapture() end
end
ns.capture = capture

--- What the window shows for the current character.
function ns.current()
    return GuildieDB.characters and GuildieDB.characters[UnitGUID("player")]
end

function ns.points(character)
    local points = 0
    for _, t in ipairs(character and character.talents or {}) do points = points + t.rank end
    return points
end

local frame = CreateFrame("Frame")
for _, event in ipairs({
    "PLAYER_ENTERING_WORLD",
    "TRAIT_CONFIG_UPDATED",
    "ACTIVE_COMBAT_CONFIG_CHANGED",
    "PLAYER_LEVEL_UP",
    "PLAYER_LOGOUT",
}) do
    frame:RegisterEvent(event)
end
frame:SetScript("OnEvent", function(_, event)
    -- Talent data can lag the event a moment; PLAYER_LOGOUT can't wait.
    if event == "PLAYER_LOGOUT" or not C_Timer then
        capture(event)
    else
        C_Timer.After(1, function() capture(event) end)
    end
end)

SLASH_GUILDIE1 = "/guildie"
SlashCmdList.GUILDIE = function()
    capture("slash")
    if ns.toggleWindow then ns.toggleWindow() end
end
