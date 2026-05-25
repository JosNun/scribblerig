import type { PanelItem, PropField, Props } from "../registry/registry";
import { DoodleBorder } from "./DoodleBorder";
import { DoodleCheckbox } from "./DoodleCheckbox";
import { DoodleDial } from "./DoodleDial";
import { DoodleTooltip } from "./DoodleTooltip";
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
  schema: PanelItem[];
  props: Props;
  onChange: (patch: Props) => void;
}) {
  const fieldCount = schema.filter((s) => s.kind !== "section").length;
  return (
    <div className="panel properties">
      <DoodleBorder strokeWidth={2.5} />
      <div className="prop-title">{title}</div>
      {fieldCount === 0 && <div className="prop-empty">No adjustable properties.</div>}
      {schema.map((item, i) => {
        if (item.kind === "section") {
          return (
            <div key={`section-${i}-${item.label}`} className="prop-subtitle">
              {item.label}
            </div>
          );
        }
        const f: PropField = item;
        const value = props[f.key];
        const warning = f.warn ? f.warn(value, props) : null;
        const label = (
          <span className="prop-label">
            {f.label}
            {f.help && (
              <DoodleTooltip content={f.help} touchMode="tap">
                <span className="help" aria-label={f.help} role="button" tabIndex={0}>
                  ?
                </span>
              </DoodleTooltip>
            )}
          </span>
        );
        // A small inline warning under the field for "still legal but might
        // surprise you" values — e.g. spawner maxAlive past the soft cap.
        const warnEl = warning ? (
          <div className="prop-warn" role="note">
            <span aria-hidden>⚠</span> {warning}
          </div>
        ) : null;

        if (f.kind === "boolean") {
          return (
            <label key={f.key} className="prop-row toggle">
              <DoodleCheckbox
                checked={value === true}
                onChange={(next) => onChange({ [f.key]: next })}
              />
              {label}
              {warnEl}
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
              {warnEl}
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
            <span className="num-frame">
              <DoodleBorder strokeWidth={1.8} />
              <input
                type="number"
                className="prop-num"
                min={f.min}
                max={f.max}
                step={f.step}
                value={num}
                onChange={(e) => commit(parseFloat(e.target.value))}
              />
            </span>
            <NumberScrubber
              value={num}
              min={Number.isFinite(min) ? min : 0}
              max={Number.isFinite(max) ? max : 1}
              step={step}
              onChange={commit}
              label={f.label}
            />
            {warnEl}
          </div>
        );
      })}
    </div>
  );
}
