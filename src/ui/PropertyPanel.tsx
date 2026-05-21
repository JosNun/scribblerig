import type { PropField, Props } from "../registry/registry";

/**
 * Generic property editor: one control per schema field, used for both body and
 * connector properties. Numeric fields get a slider *and* a number box (type a
 * precise value); fields with `help` get a `?` tooltip. Adding a field to a
 * schema surfaces it here with no change to this component.
 */
export function PropertyPanel({
  title,
  schema,
  props,
  onChange,
}: {
  title: string;
  schema: PropField[];
  props: Props;
  onChange: (patch: Props) => void;
}) {
  return (
    <div className="panel properties">
      <div className="prop-title">{title}</div>
      {schema.length === 0 && <div className="prop-empty">No adjustable properties.</div>}
      {schema.map((f) => {
        const value = props[f.key];
        const label = (
          <span className="prop-label">
            {f.label}
            {f.help && (
              <span className="help" title={f.help} aria-label={f.help}>
                ?
              </span>
            )}
          </span>
        );

        if (f.kind === "boolean") {
          return (
            <label key={f.key} className="prop-row toggle">
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => onChange({ [f.key]: e.target.checked })}
              />
              {label}
            </label>
          );
        }

        const num = typeof value === "number" ? value : 0;
        const commit = (raw: number) => {
          if (Number.isNaN(raw)) return;
          const lo = f.min ?? -Infinity;
          const hi = f.max ?? Infinity;
          onChange({ [f.key]: Math.min(hi, Math.max(lo, raw)) });
        };
        return (
          <div key={f.key} className="prop-row">
            {label}
            <input
              type="number"
              className="prop-num"
              min={f.min}
              max={f.max}
              step={f.step}
              value={num}
              onChange={(e) => commit(parseFloat(e.target.value))}
            />
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={num}
              onChange={(e) => commit(parseFloat(e.target.value))}
            />
          </div>
        );
      })}
    </div>
  );
}
