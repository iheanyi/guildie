-- Guildie's window and minimap button. The window shows what's saved for this
-- character and when it reaches guildie.club; "Upload now" reloads the UI,
-- which is when the game writes addon data to disk for the helper.

local ADDON, ns = ...

local GOLD = "|cffd9b45a"
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

local function refresh()
    if not window or not window:IsShown() then return end
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

local function buildWindow()
    window = CreateFrame("Frame", "GuildieWindow", UIParent, "BasicFrameTemplateWithInset")
    window:SetSize(340, 250)
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
    window.saved = line(window, window.talents, -12, "GameFontHighlightSmall")

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
    foot:SetText("Needs the Guildie helper running on this computer. guildie.club")

    window:SetScript("OnShow", refresh)
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
