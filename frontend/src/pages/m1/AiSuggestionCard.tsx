import { useState } from "react";
import { Bell } from "../../components/icons";

type Suggestion = {
  id: string;
  titulo: string;
  detalle: string;
};

const MOCK_SUGGESTIONS: Suggestion[] = [
  {
    id: "sug-1",
    titulo: "Cambio permanente detectado",
    detalle:
      "Detecté 2 servicios de Verduras del Valle repetidos en la semana tipo con horario distinto al histórico. ¿Confirmar como cambio permanente?",
  },
];

type Props = {
  onDismiss?: () => void;
};

/**
 * Bloque visual mock — la IA sugiere, nunca ejecuta ni modifica datos.
 */
export function AiSuggestionCard({ onDismiss }: Props) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const sug = MOCK_SUGGESTIONS[index];

  if (dismissed || !sug) return null;

  function descartar() {
    if (index < MOCK_SUGGESTIONS.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
      <div className="flex items-center gap-2 font-semibold">
        <Bell size={15} /> Agente de IA sugiere
      </div>
      <p className="mt-1">
        <span className="font-medium">{sug.titulo}. </span>
        {sug.detalle}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          title="Solo abre revisión — no modifica datos"
          onClick={() =>
            alert(
              "La IA solo sugiere. Revisá el caso en el panel; ningún dato se modifica automáticamente."
            )
          }
        >
          Revisar
        </button>
        <button
          type="button"
          onClick={descartar}
          className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
        >
          Descartar
        </button>
      </div>
      <p className="mt-2 text-xs text-indigo-500 dark:text-indigo-300">
        La IA sugiere, no ejecuta — necesita validación de Pablo.
      </p>
    </div>
  );
}
