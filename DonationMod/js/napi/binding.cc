#include <napi.h>
#include <windows.h>
#include <iostream>

class DonationSender : public Napi::ObjectWrap<DonationSender> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "DonationSender", {
            InstanceMethod("sendDonation", &DonationSender::sendDonation),
            InstanceMethod("close", &DonationSender::Close)
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("DonationSender", func);
        return exports;
    }

    DonationSender(const Napi::CallbackInfo& info) : Napi::ObjectWrap<DonationSender>(info), hMailslot(INVALID_HANDLE_VALUE) {
        Napi::Env env = info.Env();

        const wchar_t* queueName = L"\\\\.\\mailslot\\DonationQueue";
        hMailslot = CreateFileW(
            queueName,
            GENERIC_WRITE,
            FILE_SHARE_READ,
            NULL,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            NULL
        );

        if (hMailslot == INVALID_HANDLE_VALUE) {
            Napi::Error::New(env, "Failed to open mailslot").ThrowAsJavaScriptException();
            return;
        }
    }

    ~DonationSender() {
        CloseMailslot();
    }

private:
    HANDLE hMailslot;

    struct Donation {
        int id;
        int count;
    };

    void CloseMailslot() {
        if (hMailslot != INVALID_HANDLE_VALUE) {
            CloseHandle(hMailslot);
            hMailslot = INVALID_HANDLE_VALUE;
        }
    }

    Napi::Value sendDonation(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (hMailslot == INVALID_HANDLE_VALUE) {
            Napi::Error::New(env, "Mailslot is not open").ThrowAsJavaScriptException();
            return env.Null();
        }

        if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
            Napi::TypeError::New(env, "Invalid argument").ThrowAsJavaScriptException();
            return env.Null();
        }

        Donation donation;
        donation.id = info[0].As<Napi::Number>().Int32Value();
        donation.count = info[1].As<Napi::Number>().Int32Value();

        DWORD bytesWritten;
        BOOL result = WriteFile(
            hMailslot,
            &donation,
            sizeof(Donation),
            &bytesWritten,
            NULL
        );

        if (!result) {
            DWORD error = GetLastError();
            if (error == ERROR_BROKEN_PIPE || error == ERROR_HANDLE_EOF) {
                CloseMailslot();
                Napi::Error::New(env, "Mailslot connection lost").ThrowAsJavaScriptException();
                return env.Null();
            }
            Napi::Error::New(env, "Failed to write to mailslot").ThrowAsJavaScriptException();
            return env.Null();
        }

        return Napi::Boolean::New(env, true);
    }

    Napi::Value Close(const Napi::CallbackInfo& info) {
        CloseMailslot();
        return info.Env().Undefined();
    }
};

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return DonationSender::Init(env, exports);
}

NODE_API_MODULE(donation, InitAll)
