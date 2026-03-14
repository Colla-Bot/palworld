#include <DynamicOutput/Output.hpp>
#include <Mod/CppUserModBase.hpp>
#include <Unreal/UObject.hpp>
#include <Unreal/UObjectGlobals.hpp>
#include <Unreal/UFunction.hpp>
#include <Unreal/FProperty.hpp>

#include <windows.h>
#include <iostream>
#include <queue>

template<typename T>
class ThreadSafeQueue {
private:
    std::queue<T> queue;
    CRITICAL_SECTION critSection;

public:
    ThreadSafeQueue() {
        InitializeCriticalSection(&critSection);
    }

    ~ThreadSafeQueue() {
        DeleteCriticalSection(&critSection);
    }

    void push(T value) {
        EnterCriticalSection(&critSection);
        queue.push(value);
        LeaveCriticalSection(&critSection);
    }

    bool try_pop(T& value) {
        EnterCriticalSection(&critSection);
        if (queue.empty())
        {
            LeaveCriticalSection(&critSection);
            return false;
        }
        value = queue.front();
        queue.pop();
        LeaveCriticalSection(&critSection);
        return true;
    }

    bool empty() {
        EnterCriticalSection(&critSection);
        bool isEmpty = queue.empty();
        LeaveCriticalSection(&critSection);
        return isEmpty;
    }
};

struct Donation {
    int id;
    int count;
};

ThreadSafeQueue<Donation> queue;
HANDLE hThread;
std::atomic<bool> running = true;

DWORD WINAPI ReceiverThread(LPVOID lpParam) {
    const wchar_t* queueName = L"\\\\.\\mailslot\\DonationQueue";
    HANDLE hQueue = CreateMailslot(queueName,
        sizeof(Donation),
        100,
        NULL);

    if (hQueue == INVALID_HANDLE_VALUE)
    {
        Output::send<LogLevel::Error>(STR("[DonationMod] Failed to create mailslot: {}\n"), GetLastError());
        running = false;
        return 1;
    }
    Output::send<LogLevel::Normal>(STR("[DonationMod] ReceiverThread started!\n"));

    while (running) {
        Donation receivedDonation;
        DWORD bytesRead;
        BOOL result = ReadFile(hQueue,
            &receivedDonation,
            sizeof(Donation),
            &bytesRead,
            NULL);

        if (result && bytesRead == sizeof(Donation))
        {
            queue.push(receivedDonation);
        }
        else
        {
            DWORD error = GetLastError();
            if (error != ERROR_SEM_TIMEOUT) {
                Output::send<LogLevel::Error>(STR("[DonationMod] Error reading from mailslot: {}\n"), error);
            }
        }

        Sleep(10);
    }

    CloseHandle(hQueue);
    return 0;
}

namespace CollabotMods
{
    using namespace RC;
    using namespace Unreal;
    
    /**
    * DonationMod: UE4SS c++ mod class defintion
    */
    class DonationMod : public RC::CppUserModBase {
    public:
        static Unreal::UObject* ModActor;
        
        // constructor
        DonationMod() {
            ModVersion = STR("1.0");
            ModName = STR("DonationMod");
            ModAuthors = STR("Argo");
            ModDescription = STR("Donation API Mod");
            // Do not change this unless you want to target a UE4SS version
            // other than the one you're currently building with somehow.
            //ModIntendedSDKVersion = STR("2.6");
        }
        
        // destructor
        ~DonationMod() override {
            // fill when required
            running = false;

            if (hThread != NULL) {
                if (WaitForSingleObject(hThread, 1000) == WAIT_TIMEOUT)
                {
                    TerminateThread(hThread, 0);
                }
                CloseHandle(hThread);
                hThread = NULL;
            }
        }

        static auto ScriptHook(Unreal::UObject* Context, Unreal::FFrame& Stack, [[maybe_unused]] void* RESULT_DECL) -> void
        {
            static auto Init = FName(STR("Donation_Init"), FNAME_Add);
            static auto Tick = FName(STR("Donation_Tick"), FNAME_Add);
            auto name = Stack.Node()->GetNamePrivate();
            if (name == Init)
            {
                ModActor = Context;
                Output::send<LogLevel::Normal>(STR("[DonationMod] Initialized.\n"));
            }
            else if (name == Tick)
            {
                Donation donation;
                if (queue.try_pop(donation)) {
                    static UFunction* fn = Context->GetFunctionByName(STR("HandleDonation"));
                    struct
                    {
                        FGuid PlayerUid;
                        int32 Count;
                    } params;
                    params.PlayerUid = FGuid(donation.id, 0, 0, 0);
                    params.Count = donation.count;
                    Context->ProcessEvent(fn, &params);
                }
            }
        }

        auto on_program_start() -> void override
        {
        }

        auto on_dll_load(std::wstring_view dll_name) -> void override
        {
        }

        auto on_unreal_init() -> void override
        {
            hThread = CreateThread(
                NULL,
                0,
                ReceiverThread,
                NULL,
                0,
                NULL
            );

            if (hThread == NULL)
            {
                Output::send<LogLevel::Error>(STR("[DonationMod] Failed to create thread: {}\n"), GetLastError());
            }

            if (Unreal::UObject::ProcessLocalScriptFunctionInternal.is_ready())
            {
                Hook::RegisterProcessLocalScriptFunctionPostCallback(ScriptHook);
            }
            
            UObjectGlobals::RegisterHook(STR("/Script/Pal.PalPlayerController:RequestUseItemToCharacter_ToServer"),
                [&](UnrealScriptFunctionCallableContext& Context, void* CustomData) {
                    if (ModActor != nullptr)
                    {
                        static UFunction* UseItemFn = ModActor->GetFunctionByName(STR("UseItem"));
                        auto Params = static_cast<void*>(Context.TheStack.Locals());
                        ModActor->ProcessEvent(UseItemFn, Params);
                    }
                },
                [&](UnrealScriptFunctionCallableContext& Context, void* CustomData) {
                }, nullptr);
        }

    };//class

    Unreal::UObject* DonationMod::ModActor = nullptr;
}

/**
* export the start_mod() and uninstall_mod() functions to
* be used by the core ue4ss system to load in our dll mod
*/
#define MOD_EXPORT __declspec(dllexport) 
extern "C" {
    MOD_EXPORT RC::CppUserModBase* start_mod(){ return new CollabotMods::DonationMod(); }
    MOD_EXPORT void uninstall_mod(RC::CppUserModBase* mod) { delete mod; }
}
