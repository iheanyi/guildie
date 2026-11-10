-- Adds a line to item tooltips: guildmates whose known recipes use this item.
-- A suggestion, not a certainty: knowing a recipe doesn't mean they're still
-- making it. Data is your current guild's newest copy (Data.lua): bundled with
-- the addon, from the Guildie app, or shared by a guildmate.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
local MAX_NAMES = 3

-- Class colors as the game shows them; ours (from guildie.club) as a fallback.
local FALLBACK_COLORS = {
    [1] = "ffc69b6d", [2] = "fff48cba", [3] = "ffaad372", [4] = "fffff468", [5] = "ffffffff",
    [7] = "ff0070dd", [8] = "ff3fc7eb", [9] = "ff8788ee", [11] = "ffff7c0a",
}

local function classColored(name, classId)
    local color
    local info = classId and C_CreatureInfo and C_CreatureInfo.GetClassInfo and C_CreatureInfo.GetClassInfo(classId)
    local classColor = info and RAID_CLASS_COLORS and RAID_CLASS_COLORS[info.classFile]
    if classColor and classColor.colorStr then color = classColor.colorStr end
    color = color or (classId and FALLBACK_COLORS[classId])
    return color and ("|c" .. color .. name .. "|r") or name
end

local function suggestion(itemID)
    local reagents = ns.active and ns.active.entry.reagents
    local entry = reagents and reagents[itemID]
    if not entry then return nil end
    local names, extra = {}, 0
    for _, user in ipairs(entry.users or {}) do
        if not ns.isMine(user.name) then
            if #names < MAX_NAMES then
                table.insert(names, string.format("%s (%s)", classColored(user.name, user.classId), user.profession))
            else
                extra = extra + 1
            end
        end
    end
    if #names == 0 then return nil end
    local text = table.concat(names, ", ")
    if extra > 0 then text = text .. string.format(" +%d", extra) end
    return GOLD .. "Guildie|r might want this: " .. text
end
ns.reagentSuggestion = suggestion

local function addTo(tooltip, itemID)
    if not itemID then return end
    local line = suggestion(itemID)
    if line then
        tooltip:AddLine(line, 1, 1, 1, true)
        tooltip:Show()
    end
end

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    -- Modern client (WoW: Forever runs on it).
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
        if data and data.id then addTo(tooltip, data.id) end
    end)
else
    -- Older clients.
    local function onSetItem(tooltip)
        local _, link = tooltip:GetItem()
        local id = link and tonumber(link:match("item:(%d+)"))
        addTo(tooltip, id)
    end
    GameTooltip:HookScript("OnTooltipSetItem", onSetItem)
    ItemRefTooltip:HookScript("OnTooltipSetItem", onSetItem)
end
