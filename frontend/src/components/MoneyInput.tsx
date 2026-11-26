import { useEffect, useState, type KeyboardEvent } from "react";
import {
  formatMoneyEs,
  formatMoneyTyping,
  parseMoneyEs,
} from "../lib/money-format";

type Props = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  allowNegative?: boolean;
  /** Decimales máximos (default 2). Usá 0 para enteros. */
  maxDecimals?: number;
  name?: string;
  id?: string;
  min?: number;
  "aria-label"?: string;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Input de monto con separador de miles es-AR al tipear y al mostrar.
 * Guarda número (o null si vacío).
 */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  readOnly,
  allowNegative = false,
  maxDecimals = 2,
  name,
  id,
  min,
  "aria-label": ariaLabel,
  onBlur: onBlurProp,
  onKeyDown,
}: Props) {
  const [text, setText] = useState(() =>
    formatMoneyEs(value, maxDecimals)
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatMoneyEs(value, maxDecimals));
  }, [value, maxDecimals, focused]);

  function emit(nextText: string) {
    const n = parseMoneyEs(nextText);
    if (n == null) {
      onChange(null);
      return;
    }
    if (min != null && n < min) {
      onChange(min);
      return;
    }
    onChange(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      name={name}
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder ?? "0"}
      className={className}
      value={text}
      onFocus={() => setFocused(true)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        setFocused(false);
        const n = parseMoneyEs(text);
        const clamped =
          n == null ? null : min != null && n < min ? min : n;
        onChange(clamped);
        setText(formatMoneyEs(clamped, maxDecimals));
        onBlurProp?.();
      }}
      onChange={(e) => {
        if (disabled || readOnly) return;
        const next = formatMoneyTyping(e.target.value, {
          allowNegative,
          maxDecimals,
        });
        setText(next);
        emit(next);
      }}
    />
  );
}
