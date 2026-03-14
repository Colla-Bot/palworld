local ModActor = nil
local PalUtility = nil
local World = nil

local function log(message)
    print(string.format("[DonationMod] %s\n", message))
end

local function translateGuid(Userdata)
    local self = {}
    self.A = Userdata.A
    self.B = Userdata.B
    self.C = Userdata.C
    self.D = Userdata.D
    return self
end

local function findPlayer(Id)
    local result = PalUtility:GetPlayerUIdByString(World, Id);
    if result ~= nil and result.A ~= 0 then
        return result
    end
    local Players = FindAllOf("PalPlayerController")
    for _, player in pairs(Players) do
        local playerState = player:GetPalPlayerState()
        if playerState ~= nil and playerState:IsValid() then
            local uid = string.lower(string.sub(string.format("%016x", playerState.PlayerUId.A), -8))
            if string.lower(Id) == uid or string.lower(Id) == (uid .. "000000000000000000000000") then
                return playerState.PlayerUId
            end
            if string.lower(Id) == string.lower(playerState.PlayerNamePrivate:ToString()) then
                return playerState.PlayerUId
            end
        end
    end
    return nil
end

RegisterCustomEvent("Donation_Init", function(Context)
    ModActor = Context:get()
    log("DonationMod initialized!")
end)

RegisterHook("/Script/Pal.PalPlayerState:EnterChat_Receive", function(Context, Chat)
    if ModActor == nil or not ModActor:IsValid() then
        return
    end

    local message = Chat:get().Message:ToString()
    local cmd, rest = message:match("^!(%S+)%s*(.*)$")
    if cmd == nil then
        return
    end

    if PalUtility == nil or not PalUtility:IsValid() then
        PalUtility = StaticFindObject("/Script/Pal.Default__PalUtility")
    end
    if World == nil or not World:IsValid() then
        World = FindFirstOf("World")
    end

    local playerState = Context:get()
    local playerUid = translateGuid(playerState.PlayerUId)
    local playerController = playerState:GetPlayerController()
    if not playerController.bAdmin then
        PalUtility:SendSystemToPlayerChat(World, "권한이 없습니다!", playerUid)
        return
    end

    cmd = cmd:lower()
    if cmd == "공지" then
        ModActor:Broadcast(rest)
    elseif cmd == "api" or cmd == "give" then
        local target, arg = rest:match("^(%S+)%s+(.*)$")
        if target == nil then
            PalUtility:SendSystemToPlayerChat(World, "대상이 올바르지 않습니다!", playerUid)
            return
        elseif target == "all" then
            if cmd == "api" then
                PalUtility:SendSystemToPlayerChat(World, "API는 전체 지급을 지원하지 않습니다!", playerUid)
                return
            end
        elseif target ~= "me" then
            local result = findPlayer(target)
            if not result then
                PalUtility:SendSystemToPlayerChat(World, "플레이어를 찾을 수 없습니다!", playerUid)
                return
            end
            playerUid = translateGuid(result)
        end

        if cmd == "api" then
            local amount = tonumber(arg)
            if not amount then
                return
            end
            ModActor:HandleDonation(playerUid, amount)
        elseif cmd == "give" then
            local id, count = arg:match("^(%S+)%s*(.*)$")
            if not id then
                return
            end
            id = FName(id)
            count = tonumber(count)
            if count == nil then
                count = 1
            end

            if target == "all" then
                ModActor:GiveAll(id, count)
            else
                ModActor:GiveItem(playerUid, id, count)
            end
        end
    end
end)

log("DonationMod loaded!")
