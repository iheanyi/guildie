-- A minimal stand-in for the WoW API, enough to load the addon's files and
-- run several game clients side by side: each client gets its own globals,
-- and they share one clock and one GUILD addon-message channel. Not a
-- simulation of the game, only of the parts the addon calls.

local M = {}

local ADDON_DIR = (arg and arg[0] or ""):match("^(.*)/tests/[^/]*$") or "."
M.addonDir = ADDON_DIR .. "/Guildie"

-- ---- Clock -----------------------------------------------------------------------

local clock = { now = 1000, server = 1794330000, queue = {}, seq = 0 }
M.clock = clock

local function schedule(at, fn)
    clock.seq = clock.seq + 1
    table.insert(clock.queue, { at = at, fn = fn, seq = clock.seq })
end

function M.advance(seconds)
    local target = clock.now + seconds
    while true do
        table.sort(clock.queue, function(a, b) return a.at < b.at or (a.at == b.at and a.seq < b.seq) end)
        local nextItem = clock.queue[1]
        if not nextItem or nextItem.at > target then break end
        table.remove(clock.queue, 1)
        clock.server = clock.server + (nextItem.at - clock.now)
        clock.now = nextItem.at
        nextItem.fn()
    end
    clock.server = clock.server + (target - clock.now)
    clock.now = target
end

-- ---- Widgets: anything not modeled is a no-op -----------------------------------------

local function widget(name)
    local w = { shown = true, text = "", scripts = {}, events = {}, name = name }
    return setmetatable(w, {
        __index = function(t, k)
            local methods = {
                SetText = function(self, s) self.text = s end,
                GetText = function(self) return self.text end,
                Show = function(self) self.shown = true end,
                Hide = function(self) self.shown = false end,
                SetShown = function(self, on) self.shown = on and true or false end,
                IsShown = function(self) return self.shown end,
                GetWidth = function() return 140 end,
                SetScript = function(self, event, fn) self.scripts[event] = fn end,
                HookScript = function(self, event, fn) self.scripts[event] = fn end,
                GetScript = function(self, event) return self.scripts[event] end,
                RegisterEvent = function(self, event) self.events[event] = true end,
                CreateFontString = function() return widget() end,
                CreateTexture = function() return widget() end,
            }
            return methods[k] or function() end
        end,
    })
end

-- ---- The guild channel ------------------------------------------------------------------

local channel = { clients = {}, sent = {}, throttled = 0 }
M.channel = channel

function M.reset()
    clock.queue = {}
    channel.clients = {}
    channel.sent = {}
    channel.throttled = 0
end

-- ---- One game client ----------------------------------------------------------------------

local FILES = { "Guildie.lua", "Data.lua", "Wire.lua", "GuildSync.lua", "UI.lua", "Tooltip.lua" }

--- opts: name, guild (name or nil), inGuild (default: guild ~= nil), region (id, default 3),
--- roster (list of names, shared by default), bundle, data (GuildieData), db (GuildieDB),
--- guildInfoLate (GetGuildInfo answers nil until roster), silent (don't receive)
function M.client(opts)
    local env = setmetatable({}, { __index = _G })
    local frames = {}
    local client = { env = env, name = opts.name, frames = frames, opts = opts }
    env._G = env
    env.wipe = function(t) for k in pairs(t) do t[k] = nil end return t end
    env.tinsert = table.insert
    env.date = os.date
    env.time = function() return math.floor(clock.server) end
    env.GetTime = function() return clock.now end
    env.GetServerTime = function() return math.floor(clock.server) end
    env.C_Timer = {
        After = function(s, fn) schedule(clock.now + s, fn) end,
        NewTicker = function(s, fn)
            local ticker = { cancelled = false }
            function ticker:Cancel() self.cancelled = true end
            local function tick()
                if ticker.cancelled then return end
                fn(ticker)
                if not ticker.cancelled then schedule(clock.now + s, tick) end
            end
            schedule(clock.now + s, tick)
            return ticker
        end,
    }
    env.CreateFrame = function(_, name)
        local f = widget(name)
        table.insert(frames, f)
        if name then env[name] = f end
        return f
    end
    env.UIParent, env.Minimap = widget(), widget()
    env.GameTooltip, env.ItemRefTooltip = widget(), widget()
    env.UISpecialFrames = {}
    env.SlashCmdList = {}
    env.RAID_CLASS_COLORS = nil
    env.ReloadUI = function() client.reloaded = true end
    env.UnitGUID = function() return "Player-1-0000ABCD" end
    env.UnitName = function() return opts.name end
    env.UnitLevel = function() return 60 end
    env.UnitClass = function() return "Mage", "MAGE" end
    env.UnitIsAFK = function() return false end
    env.InCombatLockdown = function() return false end
    env.GetCursorPosition = function() return 0, 0 end
    env.Ambiguate = function(name) return name end
    env.IsInGuild = function()
        if opts.inGuild ~= nil then return opts.inGuild end
        return opts.guild ~= nil
    end
    env.GetGuildInfo = function()
        if opts.guildInfoLate then return nil end
        return opts.guild, "Member", 3
    end
    env.GetCurrentRegion = function() return opts.region or 3 end
    local roster = opts.roster or M.roster or {}
    env.GetNumGuildMembers = function() return #roster end
    env.GetGuildRosterInfo = function(i) return roster[i] end
    env.C_GuildInfo = { GuildRoster = function() end }
    env.Enum = {
        TooltipDataType = { Item = 0 },
        SendAddonMessageResult = { Success = 0, InvalidPrefix = 1, InvalidMessage = 2, AddonMessageThrottle = 3, ChannelThrottle = 8 },
    }
    -- The game's per-prefix limit, roughly: a burst of 10, then one more per second.
    local allowance, lastRefill = 10, clock.now
    env.C_ChatInfo = {
        RegisterAddonMessagePrefix = function(prefix) client.prefix = prefix end,
        SendAddonMessage = function(prefix, text, chan)
            assert(#prefix <= 16, "prefix too long")
            assert(#text <= 255, "addon message over 255 bytes: " .. #text)
            assert(not text:find("%z"), "addon message with a NUL byte")
            allowance = math.min(10, allowance + (clock.now - lastRefill))
            lastRefill = clock.now
            if allowance < 1 then
                channel.throttled = channel.throttled + 1
                return 3
            end
            allowance = allowance - 1
            table.insert(channel.sent, { from = opts.name, at = clock.now, text = text })
            -- Delivered to the whole guild, the sender included, a moment later.
            schedule(clock.now + 0.05, function()
                for _, c in ipairs(channel.clients) do
                    if not c.opts.silent then c:fire("CHAT_MSG_ADDON", prefix, text, chan, opts.name) end
                end
            end)
            return 0
        end,
    }
    env.TooltipDataProcessor = {
        AddTooltipPostCall = function(_, fn) client.tooltipHook = fn end,
    }

    function client:fire(event, ...)
        for _, f in ipairs(frames) do
            if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
        end
    end

    --- The lines the addon adds to an item's tooltip.
    function client:tooltip(itemId)
        local lines = {}
        local tip = widget()
        tip.AddLine = function(_, text) table.insert(lines, text) end
        self.tooltipHook(tip, { id = itemId })
        return lines
    end

    -- Load like the game: the data files, then the code in .toc order, then SavedVariables.
    env.GuildieBundle = opts.bundle
    env.GuildieData = opts.data
    local ns = {}
    client.ns = ns
    for _, file in ipairs(FILES) do
        local chunk = assert(loadfile(M.addonDir .. "/" .. file))
        setfenv(chunk, env)
        chunk("Guildie", ns)
    end
    env.GuildieDB = opts.db or {}
    table.insert(channel.clients, client)
    return client
end

--- Log in: the events the game sends at login.
function M.login(client)
    client:fire("PLAYER_LOGIN")
    client:fire("PLAYER_ENTERING_WORLD")
end

-- ---- Tiny test runner -----------------------------------------------------------------------

local passed, failed = 0, 0

function M.test(name, fn)
    M.reset()
    local ok, err = xpcall(fn, debug.traceback)
    if ok then
        passed = passed + 1
        print("ok   " .. name)
    else
        failed = failed + 1
        print("FAIL " .. name .. "\n     " .. tostring(err))
    end
end

function M.eq(actual, expected, what)
    if actual ~= expected then
        error(string.format("%s: expected %s, got %s", what or "value", tostring(expected), tostring(actual)), 2)
    end
end

function M.done()
    print(string.format("\n%d passed, %d failed", passed, failed))
    os.exit(failed == 0 and 0 or 1)
end

return M
