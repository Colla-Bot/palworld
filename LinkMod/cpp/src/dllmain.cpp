#include <Mod/CppUserModBase.hpp>
#include <Unreal/UObject.hpp>
#include <Unreal/Hooks.hpp>
#include <Unreal/UFunction.hpp>
#include <Unreal/FProperty.hpp>
#include <windows.h>

struct LinkedMem {
    UINT32	uiVersion;
    DWORD	uiTick;
    float	fAvatarPosition[3];
    float	fAvatarFront[3];
    float	fAvatarTop[3];
    wchar_t	name[256];
    float	fCameraPosition[3];
    float	fCameraFront[3];
    float	fCameraTop[3];
    wchar_t	identity[256];
    UINT32	context_len;
    unsigned char context[256];
    wchar_t description[2048];
};

LinkedMem* lm = NULL;

namespace CollabotMods
{
    using namespace RC;
    using namespace Unreal;

    /**
    * LinkMod: UE4SS c++ mod class defintion
    */
    class LinkMod : public RC::CppUserModBase {
    private:
        HANDLE hMapObject;

    public:

        // constructor
        LinkMod() {
            ModVersion = STR("1.0");
            ModName = STR("LinkMod");
            ModAuthors = STR("Argo");
            ModDescription = STR("Link (positional audio) plugin for Mumble");
            // Do not change this unless you want to target a UE4SS version
            // other than the one you're currently building with somehow.
            //ModIntendedSDKVersion = STR("2.6");
        }

        // destructor
        ~LinkMod() override {
            // fill when required
        }

        static auto ScriptHook([[maybe_unused]] Unreal::UObject* Context, Unreal::FFrame& Stack, [[maybe_unused]] void* RESULT_DECL) -> void
        {
            static auto UpdatePosition = FName(STR("LINK_UpdatePosition"), FNAME_Add);
            static auto UpdateName = FName(STR("LINK_UpdateName"), FNAME_Add);
            auto name = Stack.Node()->GetNamePrivate();
            if (name == UpdatePosition)
            {
                struct Params {
                    FVector Position;
                    FVector Forward;
                };
                auto params = (Params*)Stack.Locals();

                if (!lm)
                    return;
                lm->uiTick++;

                lm->fAvatarPosition[0] = params->Position.X() / 100.f;
                lm->fAvatarPosition[1] = params->Position.Z() / 100.f;
                lm->fAvatarPosition[2] = -params->Position.Y() / 100.f;
                lm->fAvatarFront[0] = params->Forward.X();
                lm->fAvatarFront[1] = params->Forward.Z();
                lm->fAvatarFront[2] = -params->Forward.Y();

                FMemory::Memcpy(lm->fCameraPosition, lm->fAvatarPosition, sizeof(float) * 3);
                FMemory::Memcpy(lm->fCameraFront, lm->fAvatarFront, sizeof(float) * 3);
            }
            else if (name == UpdateName)
            {
                struct Params {
                    FString Name;
                };
                auto params = (Params*)Stack.Locals();

                if (!lm)
                    return;
                wcsncpy(lm->identity, params->Name.GetCharArray(), 256);
            }
        }

        auto on_program_start() -> void override
        {
            hMapObject = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, L"MumbleLink");
            if (hMapObject == NULL)
                return;

            lm = (LinkedMem*)MapViewOfFile(hMapObject, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(LinkedMem));
            if (lm == NULL) {
                CloseHandle(hMapObject);
                hMapObject = NULL;
                return;
            }

            if (lm->uiVersion != 2) {
                wcsncpy(lm->name, L"Palworld", 256);
                wcsncpy(lm->description, L"Palworld Link plugin.", 2048);
                lm->uiVersion = 2;
            }

            lm->fAvatarTop[0] = 0.0f;
            lm->fAvatarTop[1] = 1.0f;
            lm->fAvatarTop[2] = 0.0f;
            lm->fCameraTop[0] = 0.0f;
            lm->fCameraTop[1] = 1.0f;
            lm->fCameraTop[2] = 0.0f;

            memcpy(lm->context, "CollaBot", 8);
            lm->context_len = 8;
        }

        auto on_dll_load(std::wstring_view dll_name) -> void override
        {
        }

        auto on_unreal_init() -> void override
        {
            if (Unreal::UObject::ProcessLocalScriptFunctionInternal.is_ready())
            {
                Hook::RegisterProcessLocalScriptFunctionPostCallback(ScriptHook);
            }
        }

    };//class
}

/**
* export the start_mod() and uninstall_mod() functions to
* be used by the core ue4ss system to load in our dll mod
*/
#define MOD_EXPORT __declspec(dllexport) 
extern "C" {
    MOD_EXPORT RC::CppUserModBase* start_mod(){ return new CollabotMods::LinkMod(); }
    MOD_EXPORT void uninstall_mod(RC::CppUserModBase* mod) { delete mod; }
}
