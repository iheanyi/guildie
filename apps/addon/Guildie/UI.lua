-- Guildie's window and minimap button. The window shows your guild's tooltip
-- data (which guild, how fresh, where from), what's saved for this character
-- and when it reaches guildie.club; "Upload now" reloads the UI, which is when
-- the game writes addon data to disk for the Guildie app.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
local SITE = "https://guildie.club"
local AFK_INTERVAL = 20 * 60 -- seconds between automatic reloads, at most

local function settings()
    GuildieDB.settings = GuildieDB.settings or {}
    local s = GuildieDB.settings
    if s.minimapAngle == nil then s.minimapAngle = 220 end
    if s.showMinimap == nil then s.showMinimap = true end
    if s.reloadWhenAfk == nil then s.reloadWhenAfk = false end
    return s
end

-- ---- Window ------------------------------------------------------------------

local window

local function line(parent, anchor, offset, template)
    local fs = parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlight")
    fs:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, offset or -6)
    fs:SetPoint("RIGHT", parent, "RIGHT", -16, 0)
    fs:SetJustifyH("LEFT")
    return fs
end

local function checkbox(parent, anchor, label, get, set)
    local cb = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
    cb:SetSize(24, 24)
    cb:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", -4, -6)
    local text = cb:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    text:SetPoint("LEFT", cb, "RIGHT", 2, 0)
    text:SetText(label)
    cb:SetScript("OnShow", function(self) self:SetChecked(get()) end)
    cb:SetScript("OnClick", function(self) set(self:GetChecked() and true or false) end)
    return cb, text
end

local function ago(ms)
    local seconds = math.max(0, math.floor((ns.nowMs() - ms) / 1000))
    if seconds < 90 then return "just now" end
    local minutes = math.floor(seconds / 60)
    if minutes < 60 then return minutes .. " min ago" end
    local hours = math.floor(minutes / 60)
    if hours < 48 then return hours .. (hours == 1 and " hour ago" or " hours ago") end
    return math.floor(hours / 24) .. " days ago"
end

local function day(ms)
    local t = math.floor(ms / 1000)
    return date("%b ", t) .. tonumber(date("%d", t))
end

--- "from the Guildie app, 2 min ago" / "shared by Brisket, 1 hour ago" / "bundled with the addon, Nov 10"
local function sourceText(active)
    local at = tonumber(active.entry.generatedAt) or 0
    if active.kind == "app" then return "from the Guildie app, " .. ago(at) end
    if active.kind == "shared" then return "shared by " .. (active.by or "a guildmate") .. ", " .. ago(at) end
    return "bundled with the addon, " .. day(at)
end

-- Lays out the lines that come and go, top to bottom, skipping hidden ones.
local function stack(items)
    local anchor = window.talents
    for _, item in ipairs(items) do
        if item.frame:IsShown() then
            item.frame:ClearAllPoints()
            item.frame:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", item.x or 0, item.gap)
            if item.width then item.frame:SetWidth(item.width) else item.frame:SetPoint("RIGHT", window, "RIGHT", -16, 0) end
            anchor = item.frame
        end
    end
end

local function refreshGuild()
    local guild, active = ns.guild, ns.active
    window.url:Hide()
    window.guildData:SetText("")
    if guild == nil then
        window.guild:SetText("Looking up your guild...")
    elseif guild == false then
        window.guild:SetText("You're not in a guild, so there are no guild tooltips.")
    elseif not active then
        window.guild:SetText(guild.name .. " isn't on Guildie yet. Add it at guildie.club")
        window.url:Show()
    else
        local count = 0
        for _ in pairs(active.entry.reagents or {}) do count = count + 1 end
        window.guild:SetText(guild.name)
        window.guildData:SetText(string.format("Reagent tooltips %s (%d reagent%s).", sourceText(active), count, count == 1 and "" or "s"))
    end
    window.guildData:SetShown(window.guildData:GetText() ~= "")
    window.sync:SetShown(ns.showSyncStatus and true or false)
    if ns.showSyncStatus and ns.sync then window.sync:SetText(ns.sync.status()) end
    stack({
        { frame = window.guild, gap = -12 },
        { frame = window.guildData, gap = -4 },
        { frame = window.url, gap = -4, x = 6, width = 200 },
        { frame = window.sync, gap = -4, x = window.url:IsShown() and -6 or 0 },
        { frame = window.saved, gap = -12, x = window.url:IsShown() and not window.sync:IsShown() and -6 or 0 },
    })
end

local function refresh()
    if not window or not window:IsShown() then return end
    refreshGuild()
    local me = ns.current()
    if not me then
        window.character:SetText("No data yet for this character.")
        window.talents:SetText("")
        window.saved:SetText("")
        return
    end
    window.character:SetText(string.format("%s, level %d", me.name or UnitName("player"), me.level or UnitLevel("player")))
    local points = ns.points(me)
    window.talents:SetText(string.format("%d talent point%s in %d talent%s", points, points == 1 and "" or "s", #me.talents, #me.talents == 1 and "" or "s"))
    if ns.dirty then
        window.saved:SetText(GOLD .. "Changed since your last upload.|r It goes to guildie.club when you log out, or now:")
    else
        window.saved:SetText("Up to date with your last upload. Changes go to guildie.club when you log out.")
    end
end
ns.onCapture = refresh
ns.onSyncChange = refresh
ns.onDataChange(refresh)

local function buildWindow()
    window = CreateFrame("Frame", "GuildieWindow", UIParent, "BasicFrameTemplateWithInset")
    window:SetSize(360, 340)
    window:SetPoint("CENTER")
    window:SetMovable(true)
    window:EnableMouse(true)
    window:RegisterForDrag("LeftButton")
    window:SetScript("OnDragStart", window.StartMoving)
    window:SetScript("OnDragStop", window.StopMovingOrSizing)
    window:SetFrameStrata("DIALOG")
    window:Hide()
    tinsert(UISpecialFrames, "GuildieWindow") -- Escape closes it

    local title = window:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    title:SetPoint("TOP", window, "TOP", 0, -5)
    title:SetText("Guildie")

    local top = CreateFrame("Frame", nil, window)
    top:SetPoint("TOPLEFT", window, "TOPLEFT", 16, -32)
    top:SetSize(1, 1)

    window.character = line(window, top, 0, "GameFontNormalLarge")
    window.talents = line(window, window.character, -6)
    window.guild = line(window, window.talents, -12, "GameFontNormal")
    window.guildData = line(window, window.guild, -4, "GameFontHighlightSmall")
    window.sync = line(window, window.guildData, -4, "GameFontDisableSmall")

    -- Addons can't open a browser: the address, ready to copy (Ctrl+C).
    local url = CreateFrame("EditBox", nil, window, "InputBoxTemplate")
    url:SetSize(200, 20)
    url:SetAutoFocus(false)
    url:SetFontObject("GameFontHighlightSmall")
    url:SetText(SITE)
    url:SetCursorPosition(0)
    url:SetScript("OnEditFocusGained", function(self) self:HighlightText() end)
    url:SetScript("OnEditFocusLost", function(self) self:HighlightText(0, 0) end)
    url:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    url:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
    url:SetScript("OnTextChanged", function(self, userInput)
        if userInput then
            self:SetText(SITE)
            self:HighlightText()
        end
    end)
    url:Hide()
    window.url = url

    window.saved = line(window, window.sync, -12, "GameFontHighlightSmall")

    local upload = CreateFrame("Button", nil, window, "UIPanelButtonTemplate")
    upload:SetSize(170, 24)
    upload:SetPoint("TOPLEFT", window.saved, "BOTTOMLEFT", 0, -8)
    upload:SetText("Upload now (reloads UI)")
    upload:SetScript("OnClick", function()
        ns.capture("upload-button")
        ReloadUI()
    end)
    window.upload = upload

    local afk = checkbox(window, upload, "Upload while I'm AFK (reloads your UI; experimental)",
        function() return settings().reloadWhenAfk end,
        function(on) settings().reloadWhenAfk = on end)
    local minimap = checkbox(window, afk, "Show minimap button",
        function() return settings().showMinimap end,
        function(on)
            settings().showMinimap = on
            if ns.updateMinimapButton then ns.updateMinimapButton() end
        end)

    local foot = line(window, minimap, -10, "GameFontDisableSmall")
    foot:SetText("Uploads need the Guildie app on this computer; tooltips work without it. guildie.club")

    window:SetScript("OnShow", refresh)
end

function ns.showWindow()
    if not window then buildWindow() end
    window:Show()
    refresh()
end

function ns.toggleWindow()
    if not window then buildWindow() end
    if window:IsShown() then window:Hide() else window:Show() end
end

-- Entry in the minimap's add-on menu, where the client has one.
function Guildie_OnAddonCompartmentClick()
    ns.toggleWindow()
end

-- ---- Minimap button ------------------------------------------------------------

local button

local function placeButton()
    local angle = math.rad(settings().minimapAngle)
    local radius = (Minimap:GetWidth() / 2) + 10
    button:ClearAllPoints()
    button:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * radius, math.sin(angle) * radius)
end

local function buildButton()
    button = CreateFrame("Button", "GuildieMinimapButton", Minimap)
    button:SetSize(31, 31)
    button:SetFrameStrata("MEDIUM")
    button:SetFrameLevel(8)
    button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    button:RegisterForDrag("LeftButton")
    button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

    local background = button:CreateTexture(nil, "BACKGROUND")
    background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
    background:SetSize(20, 20)
    background:SetPoint("TOPLEFT", 7, -5)

    local icon = button:CreateTexture(nil, "ARTWORK")
    icon:SetTexture("Interface\\AddOns\\Guildie\\icon")
    icon:SetSize(18, 18)
    icon:SetPoint("TOPLEFT", 7, -6)

    local border = button:CreateTexture(nil, "OVERLAY")
    border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
    border:SetSize(53, 53)
    border:SetPoint("TOPLEFT")

    button:SetScript("OnClick", function() ns.toggleWindow() end)
    button:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:AddLine("Guildie")
        local me = ns.current()
        if me then GameTooltip:AddLine(string.format("%d talent points saved", ns.points(me)), 1, 1, 1) end
        if ns.dirty then GameTooltip:AddLine("Changed since your last upload", 0.85, 0.71, 0.35) end
        GameTooltip:AddLine("Click to open. Drag to move.", 0.6, 0.6, 0.6)
        GameTooltip:Show()
    end)
    button:SetScript("OnLeave", function() GameTooltip:Hide() end)
    button:SetScript("OnDragStart", function(self)
        self:SetScript("OnUpdate", function()
            local mx, my = Minimap:GetCenter()
            local scale = Minimap:GetEffectiveScale()
            local cx, cy = GetCursorPosition()
            settings().minimapAngle = math.deg(math.atan2(cy / scale - my, cx / scale - mx))
            placeButton()
        end)
    end)
    button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
end

function ns.updateMinimapButton()
    if not button then buildButton() end
    placeButton()
    button:SetShown(settings().showMinimap)
end

-- ---- Upload while AFK (opt-in, experimental) -----------------------------------
-- Reloads the UI only when: the option is on, you're flagged AFK, you're out of
-- combat, something changed since the last upload, and it's been 20 minutes
-- since the UI last loaded. If the game doesn't let an addon reload by itself,
-- the option turns off and says so.

local loadedAt = GetTime()

local function maybeReloadWhileAfk()
    local s = settings()
    if not s.reloadWhenAfk or not ns.dirty then return end
    if not UnitIsAFK("player") or InCombatLockdown() then return end
    if GetTime() - loadedAt < AFK_INTERVAL then return end
    ns.capture("afk-reload")
    ReloadUI()
end

local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:RegisterEvent("ADDON_ACTION_BLOCKED")
events:RegisterEvent("ADDON_ACTION_FORBIDDEN")
events:SetScript("OnEvent", function(_, event, addon, action)
    if event == "PLAYER_LOGIN" then
        ns.updateMinimapButton()
        if C_Timer and C_Timer.NewTicker then C_Timer.NewTicker(60, maybeReloadWhileAfk) end
    elseif addon == ADDON and action and tostring(action):find("ReloadUI") then
        settings().reloadWhenAfk = false
        print(GOLD .. "Guildie|r: the game doesn't let addons reload the UI on their own, so \"Upload while I'm AFK\" is off. Uploads still happen when you log out.")
    end
end)
