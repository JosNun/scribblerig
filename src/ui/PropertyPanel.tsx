import { def, type Props } from "../registry/registry";
import type { Body } from "../scene/scene";

/**
 * Generic property editor: renders one control per field in the selected body
 * type's `propSchema`. Adding a property to a schema surfaces it here with no
 * change to this component.
 */
export function PropertyPanel({
  body,
  onChange,
}: {
  body: Body;
  onChange: (patch: Props) => void;
}) {
  const d = def(body.type);
  return (
    <div className="panel properties">
      <div className="prop-title">{d.label}</div>
      {d.propSchema.map((f) => {
        const value = body.props[f.key];
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
