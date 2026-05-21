import type { PropField, Props } from "../registry/registry";

/**
 * Generic property editor: one control per schema field. Used for both body
 * and connector properties — the caller supplies the title, schema, and props.
 * Adding a field to a schema surfaces it here with no change to this component.
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
        if (f.kind === "boolean") {
          return (
            <label key={f.key} className="prop-row toggle">
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => onChange({ [f.key]: e.target.checked })}
              />
              {f.label}
            </label>
          );
        }
        const num = typeof value === "number" ? value : 0;
        return (
          <label key={f.key} className="prop-row">
            <span className="prop-label">{f.label}</span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={num}
              onChange={(e) => onChange({ [f.key]: parseFloat(e.target.value) })}
            />
            <span className="prop-val">{num.toFixed(2)}</span>
          </label>
        );
      })}
    </div>
  );
}
