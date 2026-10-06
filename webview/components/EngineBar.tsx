import type { EngineState, EngineStatus } from "../../src/shared/protocol";
import { send } from "../vscode";
import { Button } from "./ui";

/** Engine switcher: a segmented control in the brand green, plus the active engine's status. */
export function EngineBar({ engines }: { engines: EngineState | null }) {
  if (!engines) return null;
  const active = engines.statuses.find((s) => s.id === engines.active) ?? engines.statuses[0];
  if (!active) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2 text-xs">
      <div role="tablist" aria-label="Review engine" className="flex gap-0.5 rounded-full border border-border p-0.5">
        {engines.statuses.map((status) => (
          <button
            key={status.id}
            role="tab"
            aria-selected={status.id === engines.active}
            onClick={() => send({ type: "setEngine", engine: status.id })}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              status.id === engines.active ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover"
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>

      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${active.ready ? "bg-ready" : "bg-strawberry"}`}
      />
      <span className={active.ready ? "" : "text-error"}>{active.detail}</span>

      <ModelPicker status={active} />
      <EngineAction status={active} />
    </div>
  );
}

function ModelPicker({ status }: { status: EngineStatus }) {
  if (status.models.length < 2) return null;
  return (
    <label className="flex items-center gap-1 text-muted">
      Model
      <select
        value={status.selectedModel ?? ""}
        onChange={(e) => send({ type: "setModel", engine: status.id, model: e.target.value })}
        className="cursor-pointer rounded-sm border border-input-border bg-input px-1.5 py-0.5 text-xs text-input-fg outline-none focus:border-focus"
      >
        {status.models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EngineAction({ status }: { status: EngineStatus }) {
  const action = status.action;
  if (!action) return null;
  return (
    <Button
      className="ml-auto"
      onClick={() => send(action.kind === "connectCodex" ? { type: "connectCodex" } : { type: "refreshEngines" })}
    >
      {action.label}
    </Button>
  );
}
