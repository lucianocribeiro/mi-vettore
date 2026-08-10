import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function docsBucket(): string {
  return process.env.SUPABASE_DOCS_BUCKET || "documentacion";
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function isSupabaseStorageConfigured(): boolean {
  return !!getSupabaseAdmin();
}

export async function uploadDocumento(opts: {
  path: string;
  body: Buffer;
  contentType: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      ok: false,
      error:
        "Supabase Storage no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    };
  }
  const { error } = await sb.storage
    .from(docsBucket())
    .upload(opts.path, opts.body, {
      contentType: opts.contentType,
      upsert: true,
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path: opts.path };
}

export async function signedDocumentoUrl(
  path: string,
  expiresInSec = 60 * 15
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return { ok: false, error: "Supabase Storage no configurado" };
  }
  const { data, error } = await sb.storage
    .from(docsBucket())
    .createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo firmar URL" };
  }
  return { ok: true, url: data.signedUrl };
}
