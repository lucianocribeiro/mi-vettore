const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    const ctx = localStorage.getItem("mi-vettore-contexto");
    if (ctx === "EMPRESA" || ctx === "CHOFER") {
      headers.set("X-Contexto-Acceso", ctx);
    }
  } catch {
    /* ignore */
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error ||
        (res.status >= 500
          ? "El servidor no está disponible"
          : "Error de red"),
      res.status
    );
  }

  return data as T;
}

export async function apiDownload(
  path: string,
  token?: string | null,
  fallbackName = "download.bin"
): Promise<void> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const ctx = localStorage.getItem("mi-vettore-contexto");
    if (ctx === "EMPRESA" || ctx === "CHOFER") {
      headers.set("X-Contexto-Acceso", ctx);
    }
  } catch {
    /* ignore */
  }

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as { error?: string }).error || "Error al descargar",
      res.status
    );
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(cd);
  const filename = match?.[1] || fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
