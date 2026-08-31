export type CatDiagnosticoRow = {
  id: string;
  nombre: string;
  padreId: string | null;
  nivel: number;
};

export type DiagnosticoPath = {
  nivel1: string | null;
  nivel2: string | null;
  nivel3: string | null;
  nivel1Id: string | null;
  nivel2Id: string | null;
  nivel3Id: string | null;
  path: string | null;
};

export function buildCatMap(cats: CatDiagnosticoRow[]) {
  return new Map(cats.map((c) => [c.id, c]));
}

export function diagnosticoPathFromId(
  cats: CatDiagnosticoRow[],
  categoriaId: string | null | undefined
): DiagnosticoPath {
  const empty: DiagnosticoPath = {
    nivel1: null,
    nivel2: null,
    nivel3: null,
    nivel1Id: null,
    nivel2Id: null,
    nivel3Id: null,
    path: null,
  };
  if (!categoriaId) return empty;

  const byId = buildCatMap(cats);
  const chain: CatDiagnosticoRow[] = [];
  let cur = byId.get(categoriaId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.padreId ? byId.get(cur.padreId) : undefined;
  }
  if (!chain.length) return empty;

  const n1 = chain.find((c) => c.nivel === 1) ?? null;
  const n2 = chain.find((c) => c.nivel === 2) ?? null;
  const n3 = chain.find((c) => c.nivel === 3) ?? null;
  const labels = [n1?.nombre, n2?.nombre, n3?.nombre].filter(Boolean) as string[];

  return {
    nivel1: n1?.nombre ?? null,
    nivel2: n2?.nombre ?? null,
    nivel3: n3?.nombre ?? null,
    nivel1Id: n1?.id ?? null,
    nivel2Id: n2?.id ?? null,
    nivel3Id: n3?.id ?? null,
    path: labels.length ? labels.join(" › ") : null,
  };
}

export function categoriaEnRama(
  cats: CatDiagnosticoRow[],
  categoriaId: string | null | undefined,
  filtro: { nivel1?: string; nivel2?: string; nivel3?: string }
): boolean {
  if (!categoriaId) return false;
  const { nivel1, nivel2, nivel3 } = filtro;
  if (!nivel1 && !nivel2 && !nivel3) return true;

  const path = diagnosticoPathFromId(cats, categoriaId);
  if (nivel3) return path.nivel3Id === nivel3;
  if (nivel2) return path.nivel2Id === nivel2;
  if (nivel1) return path.nivel1Id === nivel1;
  return true;
}
