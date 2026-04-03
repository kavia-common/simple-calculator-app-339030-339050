import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const MAX_DISPLAY_LEN = 18;

const OPERATORS = new Set(["+", "-", "×", "÷"]);
const OP_TO_FN = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "×": (a, b) => a * b,
  "÷": (a, b) => a / b,
};

function isOperatorChar(ch) {
  return OPERATORS.has(ch);
}

function toNumberOrNull(str) {
  // Accepts "0", "-3.2", ".5" etc. (we normalize ".5" to "0.5" before parsing)
  if (str === "" || str === "-" || str === "." || str === "-.") return null;
  const normalized = str.startsWith(".") ? `0${str}` : str.startsWith("-.") ? `-0${str.slice(1)}` : str;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatResult(num) {
  // Prevent -0
  const safe = Object.is(num, -0) ? 0 : num;

  // Use a precision cap to avoid floating point noise (e.g., 0.1+0.2)
  const rounded = Math.round((safe + Number.EPSILON) * 1e12) / 1e12;

  // Convert to string and clamp length, using scientific if too long
  let s = String(rounded);
  if (s.length > MAX_DISPLAY_LEN) {
    s = rounded.toExponential(8);
  }
  return s;
}

// PUBLIC_INTERFACE
function App() {
  /**
   * State model:
   * - display: what the user sees/edits
   * - accumulator: stored left-hand operand
   * - pendingOp: operator chosen waiting for RHS
   * - overwrite: if true, next digit replaces display (after equals or operator)
   * - error: if not null, display is locked until clear/backspace (backspace clears error)
   */
  const [display, setDisplay] = useState("0");
  const [accumulator, setAccumulator] = useState(null); // number|null
  const [pendingOp, setPendingOp] = useState(null); // "+", "-", "×", "÷" | null
  const [overwrite, setOverwrite] = useState(true);
  const [error, setError] = useState(null); // string|null

  const displaySecondary = useMemo(() => {
    if (error) return "";
    if (pendingOp && accumulator !== null) return `${formatResult(accumulator)} ${pendingOp}`;
    return "";
  }, [accumulator, pendingOp, error]);

  const commitOperation = useCallback(
    (rhsNumber) => {
      if (pendingOp == null || accumulator == null) return { ok: true, value: rhsNumber };

      // Divide by zero handling
      if (pendingOp === "÷" && rhsNumber === 0) {
        return { ok: false, error: "Cannot divide by zero" };
      }

      const fn = OP_TO_FN[pendingOp];
      const result = fn(accumulator, rhsNumber);

      if (!Number.isFinite(result)) {
        return { ok: false, error: "Invalid operation" };
      }
      return { ok: true, value: result };
    },
    [accumulator, pendingOp]
  );

  const clearAll = useCallback(() => {
    setDisplay("0");
    setAccumulator(null);
    setPendingOp(null);
    setOverwrite(true);
    setError(null);
  }, []);

  const backspace = useCallback(() => {
    if (error) {
      // Backspace acts as "dismiss" for error (but doesn't reset accumulator/op so user can continue)
      setError(null);
      setDisplay("0");
      setOverwrite(true);
      return;
    }

    if (overwrite) {
      // If we are in overwrite mode, backspace behaves like clearing current entry
      setDisplay("0");
      setOverwrite(true);
      return;
    }

    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith("-"))) return "0";
      return prev.slice(0, -1);
    });
  }, [error, overwrite]);

  const inputDigit = useCallback(
    (d) => {
      if (error) return;

      setDisplay((prev) => {
        if (overwrite) {
          setOverwrite(false);
          return d;
        }
        if (prev === "0") return d;
        if (prev.length >= MAX_DISPLAY_LEN) return prev;
        return prev + d;
      });
    },
    [overwrite, error]
  );

  const inputDecimal = useCallback(() => {
    if (error) return;

    setDisplay((prev) => {
      if (overwrite) {
        setOverwrite(false);
        return "0.";
      }
      // single-decimal validation
      if (prev.includes(".")) return prev;
      if (prev.length >= MAX_DISPLAY_LEN) return prev;
      return prev + ".";
    });
  }, [overwrite, error]);

  const toggleSign = useCallback(() => {
    if (error) return;

    setDisplay((prev) => {
      if (overwrite) {
        setOverwrite(false);
        return "-0";
      }
      if (prev === "0") return "-0";
      if (prev.startsWith("-")) return prev.slice(1);
      if (prev.length >= MAX_DISPLAY_LEN) return prev;
      return "-" + prev;
    });
  }, [overwrite, error]);

  const setOperator = useCallback(
    (op) => {
      if (error) return;

      const current = toNumberOrNull(display);

      // If user has just pressed operator repeatedly, allow replacing pending op
      if (overwrite && pendingOp && accumulator !== null) {
        setPendingOp(op);
        return;
      }

      // If current entry is incomplete (e.g. "-"), ignore operator
      if (current == null) return;

      if (accumulator === null) {
        setAccumulator(current);
        setPendingOp(op);
        setOverwrite(true);
        return;
      }

      if (pendingOp == null) {
        setPendingOp(op);
        setAccumulator(current);
        setOverwrite(true);
        return;
      }

      // Chain: compute accumulator (op) current, then set new op
      const result = commitOperation(current);
      if (!result.ok) {
        setError(result.error);
        setDisplay("Error");
        setOverwrite(true);
        return;
      }

      setAccumulator(result.value);
      setDisplay(formatResult(result.value));
      setPendingOp(op);
      setOverwrite(true);
    },
    [display, accumulator, pendingOp, commitOperation, error]
  );

  const equals = useCallback(() => {
    if (error) return;

    const current = toNumberOrNull(display);
    if (current == null) return;

    if (pendingOp == null) {
      // Nothing pending; just normalize display
      setDisplay(formatResult(current));
      setOverwrite(true);
      return;
    }

    if (accumulator == null) {
      // Shouldn't happen; safeguard
      setAccumulator(current);
      setPendingOp(null);
      setDisplay(formatResult(current));
      setOverwrite(true);
      return;
    }

    const result = commitOperation(current);
    if (!result.ok) {
      setError(result.error);
      setDisplay("Error");
      setOverwrite(true);
      return;
    }

    setDisplay(formatResult(result.value));
    setAccumulator(null);
    setPendingOp(null);
    setOverwrite(true);
  }, [display, accumulator, pendingOp, commitOperation, error]);

  const clearEntry = useCallback(() => {
    if (error) {
      setError(null);
    }
    setDisplay("0");
    setOverwrite(true);
  }, [error]);

  // Keyboard support
  useEffect(() => {
    function onKeyDown(e) {
      const { key } = e;

      if (key >= "0" && key <= "9") {
        e.preventDefault();
        inputDigit(key);
        return;
      }
      if (key === ".") {
        e.preventDefault();
        inputDecimal();
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        clearAll();
        return;
      }
      if (key === "Enter" || key === "=") {
        e.preventDefault();
        equals();
        return;
      }
      if (key === "+") {
        e.preventDefault();
        setOperator("+");
        return;
      }
      if (key === "-") {
        e.preventDefault();
        setOperator("-");
        return;
      }
      if (key === "*") {
        e.preventDefault();
        setOperator("×");
        return;
      }
      if (key === "/") {
        e.preventDefault();
        setOperator("÷");
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputDigit, inputDecimal, backspace, clearAll, equals, setOperator]);

  const buttonGrid = useMemo(
    () => [
      { label: "C", type: "utility", onClick: clearAll, aria: "Clear all" },
      { label: "CE", type: "utility", onClick: clearEntry, aria: "Clear entry" },
      { label: "⌫", type: "utility", onClick: backspace, aria: "Backspace" },
      { label: "÷", type: "op", onClick: () => setOperator("÷"), aria: "Divide" },

      { label: "7", type: "num", onClick: () => inputDigit("7") },
      { label: "8", type: "num", onClick: () => inputDigit("8") },
      { label: "9", type: "num", onClick: () => inputDigit("9") },
      { label: "×", type: "op", onClick: () => setOperator("×"), aria: "Multiply" },

      { label: "4", type: "num", onClick: () => inputDigit("4") },
      { label: "5", type: "num", onClick: () => inputDigit("5") },
      { label: "6", type: "num", onClick: () => inputDigit("6") },
      { label: "-", type: "op", onClick: () => setOperator("-"), aria: "Subtract" },

      { label: "1", type: "num", onClick: () => inputDigit("1") },
      { label: "2", type: "num", onClick: () => inputDigit("2") },
      { label: "3", type: "num", onClick: () => inputDigit("3") },
      { label: "+", type: "op", onClick: () => setOperator("+"), aria: "Add" },

      { label: "±", type: "utility", onClick: toggleSign, aria: "Toggle sign" },
      { label: "0", type: "num wide", onClick: () => inputDigit("0") },
      { label: ".", type: "num", onClick: inputDecimal, aria: "Decimal point" },
      { label: "=", type: "equals", onClick: equals, aria: "Equals" },
    ],
    [clearAll, clearEntry, backspace, setOperator, inputDigit, inputDecimal, equals, toggleSign]
  );

  return (
    <div className="App">
      <main className="calc-page">
        <section className="calc-card" aria-label="Calculator">
          <header className="calc-header">
            <div className="calc-brand">
              <div className="calc-dot" aria-hidden="true" />
              <span className="calc-title">Calculator</span>
            </div>
            <div className="calc-hint" aria-hidden="true">
              Enter · Esc · ⌫
            </div>
          </header>

          <div className="calc-display" role="status" aria-live="polite" aria-label="Calculator display">
            <div className="calc-display-secondary">{displaySecondary}</div>
            <div className={`calc-display-primary ${error ? "is-error" : ""}`}>{display}</div>
            {error ? <div className="calc-display-error">{error}</div> : null}
          </div>

          <div className="calc-grid" role="group" aria-label="Calculator buttons">
            {buttonGrid.map((b, idx) => (
              <button
                key={`${b.label}-${idx}`}
                type="button"
                className={`calc-btn ${b.type}`}
                onClick={b.onClick}
                aria-label={b.aria || b.label}
                data-operator={isOperatorChar(b.label) ? "true" : "false"}
              >
                {b.label}
              </button>
            ))}
          </div>

          <footer className="calc-footer">
            <span className="calc-footer-kbd">
              Keyboard: <kbd>0-9</kbd> <kbd>.</kbd> <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd>{" "}
              <kbd>Enter</kbd> <kbd>Esc</kbd>
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;
