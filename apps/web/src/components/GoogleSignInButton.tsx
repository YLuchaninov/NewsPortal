import { useEffect, useRef } from "react";
import { createClientActionError, reportClientError } from "@signalops/ui";

interface GoogleSignInButtonProps {
  clientId: string;
  authPath: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme: "outline";
              size: "large";
              type: "standard";
              text: "signin_with";
              shape: "rectangular";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript(): Promise<void> {
  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${GOOGLE_SCRIPT_SRC}"]`
  );
  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = existingScript ?? document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Google sign-in script failed to load."));
    if (!existingScript) {
      document.head.appendChild(script);
    }
  });
}

export function GoogleSignInButton({ clientId, authPath }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      reportClientError(new Error("Missing SIGNALOPS_WEB_GOOGLE_CLIENT_ID."), {
        context: "Google sign-in configuration",
        fallbackMessage: "Google sign-in is not configured.",
      });
      return;
    }

    void loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return;
        }
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const credential = String(response.credential ?? "").trim();
            if (!credential) {
              reportClientError(new Error("Google credential response was empty."), {
                context: "Google sign-in credential callback",
                fallbackMessage: "Google did not return a sign-in credential.",
              });
              return;
            }
            void fetch(authPath, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ credential }),
            })
              .then(async (authResponse) => {
                const payload = (await authResponse.json().catch(() => ({}))) as {
                  redirectTo?: string;
                  error?: string;
                  technicalError?: string;
                  errorCode?: string;
                };
                if (!authResponse.ok) {
                  throw createClientActionError(payload, {
                    fallbackMessage: "Google sign-in failed.",
                    status: authResponse.status,
                  });
                }
                window.location.assign(payload.redirectTo || "/");
              })
              .catch((authError) => {
                reportClientError(authError, {
                  context: "Google sign-in",
                  fallbackMessage: "Google sign-in failed.",
                });
              });
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          text: "signin_with",
          shape: "rectangular",
          width: 220,
        });
      })
      .catch((scriptError) => {
        if (!cancelled) {
          reportClientError(scriptError, {
            context: "Google sign-in script",
            fallbackMessage: "Google sign-in failed.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authPath, clientId]);

  return (
    <div className="flex flex-col items-end">
      <div ref={buttonRef} className="min-h-10" />
    </div>
  );
}
