import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, onCoreEvent } from "../api";

type Step =
  | { name: "phone" }
  | { name: "code" }
  | { name: "password"; hint: string | null }
  | { name: "qr"; dataUrl: string | null };

export default function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Drive step transitions from backend login events (they are authoritative;
  // e.g. QR login jumps straight to password_required or complete).
  useEffect(() => {
    const unlisten = onCoreEvent(async (event) => {
      if (event.kind !== "login") return;
      switch (event.stage.stage) {
        case "password_required":
          setStep({ name: "password", hint: event.stage.hint });
          break;
        case "qr_code": {
          const dataUrl = await QRCode.toDataURL(event.stage.url, {
            width: 240,
            margin: 1,
          });
          setStep((current) =>
            current.name === "qr" ? { name: "qr", dataUrl } : current,
          );
          break;
        }
        case "complete":
          onLoggedIn();
          break;
        case "code_sent":
          setStep({ name: "code" });
          break;
      }
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [onLoggedIn]);

  async function guard(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered">
      <div className="login-card">
        <h1>Telegram</h1>

        {step.name === "phone" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guard(() => api.beginCodeLogin(phone));
            }}
          >
            <label>
              Phone number
              <input
                autoFocus
                placeholder="+46 70 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <button disabled={busy || phone.trim() === ""}>Send code</button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() =>
                void guard(async () => {
                  setStep({ name: "qr", dataUrl: null });
                  await api.beginQrLogin();
                })
              }
            >
              Log in with QR code
            </button>
          </form>
        )}

        {step.name === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guard(() => api.submitCode(code));
            }}
          >
            <p className="muted">We sent a code to your Telegram app or via SMS.</p>
            <label>
              Login code
              <input
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button disabled={busy || code.trim() === ""}>Sign in</button>
          </form>
        )}

        {step.name === "password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guard(() => api.submitPassword(password));
            }}
          >
            <p className="muted">
              Two-step verification is enabled.
              {step.hint ? ` Hint: ${step.hint}` : ""}
            </p>
            <label>
              Password
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy || password === ""}>Sign in</button>
          </form>
        )}

        {step.name === "qr" && (
          <div className="qr-step">
            <p className="muted">
              Scan with Telegram on your phone:
              <br />
              Settings → Devices → Link Desktop Device
            </p>
            {step.dataUrl ? (
              <img className="qr" src={step.dataUrl} alt="Login QR code" />
            ) : (
              <div className="qr placeholder">Generating…</div>
            )}
            <button
              type="button"
              className="link"
              onClick={() => setStep({ name: "phone" })}
            >
              Use phone number instead
            </button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
