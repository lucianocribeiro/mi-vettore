import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/** Sin interacción → cartel “¿Seguís ahí?” */
const IDLE_MS = 60 * 60 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "pointerdown",
];

/**
 * Tras 60 min sin usar la app, pregunta si el usuario sigue ahí.
 * “Sí, sigo acá” reinicia el contador; “Cerrar sesión” hace logout.
 */
export function IdleSessionGuard() {
  const { user, token, logout } = useAuth();
  const [askStillHere, setAskStillHere] = useState(false);
  const timerRef = useRef<number | null>(null);
  const askOpenRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    if (!user || !token || askOpenRef.current) return;
    timerRef.current = window.setTimeout(() => {
      askOpenRef.current = true;
      setAskStillHere(true);
    }, IDLE_MS);
  }, [user, token, clearTimer]);

  const onActivity = useCallback(() => {
    if (askOpenRef.current) return;
    armTimer();
  }, [armTimer]);

  useEffect(() => {
    if (!user || !token) {
      clearTimer();
      askOpenRef.current = false;
      setAskStillHere(false);
      return;
    }
    armTimer();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onActivity);
    return () => {
      clearTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [user, token, armTimer, onActivity, clearTimer]);

  useEffect(() => {
    if (!askStillHere) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [askStillHere]);

  function seguirAqui() {
    askOpenRef.current = false;
    setAskStillHere(false);
    armTimer();
  }

  function cerrarSesion() {
    askOpenRef.current = false;
    setAskStillHere(false);
    clearTimer();
    logout();
  }

  if (!user || !token || !askStillHere) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
      >
        <h3
          id="idle-session-title"
          className="text-base font-bold text-[var(--vl-heading)]"
        >
          ¿Seguís ahí?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--vl-text-muted)]">
          Llevás un rato sin usar la app. ¿Querés seguir con la sesión abierta?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={cerrarSesion}
            className="min-h-10 rounded-md border border-[var(--vl-card-border)] px-4 text-sm font-medium text-[var(--vl-text-muted)]"
          >
            Cerrar sesión
          </button>
          <button
            type="button"
            onClick={seguirAqui}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Sí, sigo acá
          </button>
        </div>
      </div>
    </div>
  );
}
