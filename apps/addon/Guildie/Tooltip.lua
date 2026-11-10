-- Adds a line to item tooltips: guildmates whose known recipes use this item.
-- A suggestion, not a certainty: knowing a recipe doesn't mean they're still
-- making it. Data comes from GuildieData.lua, which the helper downloads.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
local MAX_NAMES = 3

local function isMine(name)
    for _, mine in ipairs(GuildieData and GuildieData.mine or {}) do
        if mine == name then return true end
    end
    return name == UnitName("player")
end

local function suggestion(itemID)
    local entry = GuildieData and GuildieData.reagents and GuildieData.reagents[itemID]
    if not entry then return nil end
    local names, extra = {}, 0
    for _, user in ipairs(entry.users or {}) do
        if not isMine(user.name) then
            if #names < MAX_NAMES then
                table.insert(names, string.format("%s (%s)", user.name, user.profession))
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
