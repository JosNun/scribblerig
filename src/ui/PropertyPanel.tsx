import type { PropField, Props } from "../registry/registry";
import { DoodleCheckbox } from "./DoodleCheckbox";
import { DoodleDial } from "./DoodleDial";
import { NumberScrubber } from "./NumberScrubber";

/**
 * Generic property editor: one control per schema field, used for both body and
 * connector properties.
 *
 *  - **number** fields render a typeable number box + a doodle scrubber (see
 *    `NumberScrubber`).
 *  - **boolean** fields render a checkbox.
 *
 * Fields with `help` get a `?` tooltip. Adding a field to a schema surfaces it
 * here with no change to this component.
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
              <DoodleCheckbox
                checked={value === true}
                onChange={(next) => onChange({ [f.key]: next })}
              />
              {label}
            </label>
          );
        }

        if (f.kind === "angle") {
          const deg = typeof value === "number" ? value : 0;
          return (
            <div key={f.key} className="prop-row dial-row">
              {label}
              <DoodleDial
                value={deg}
                onChange={(next) => onChange({ [f.key]: next })}
                label={f.label}
              />
              <span className="prop-val">{Math.round(deg)}°</span>
            </div>
          );
        }

        const num = typeof value === "number" ? value : 0;
        const min = f.min ?? -Infinity;
        const max = f.max ?? Infinity;
        const step = f.step ?? 0.01;
        const commit = (raw: number) => {
          if (Number.isNaN(raw)) return;
          onChange({ [f.key]: Math.min(max, Math.max(min, raw)) });
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
            <NumberScrubber
              value={num}
              min={Number.isFinite(min) ? min : 0}
              max={Number.isFinite(max) ? max : 1}
              step={step}
              onChange={commit}
              label={f.label}
            />
          </div>
        );
      })}
    </div>
  );
}
