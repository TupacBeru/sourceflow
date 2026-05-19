import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogActions } from "./Dialog";

// Imperative confirm() / prompt() built on top of the <Dialog> primitive.
// Components opt in by calling `await confirm({...})` or
// `await prompt({...})` and we render the host UI from <DialogHost />.

type ConfirmSpec = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};

type PromptField = {
  id: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "textarea";
};

type PromptSpec = {
  title: string;
  body?: ReactNode;
  fields: PromptField[];
  confirmLabel?: string;
  danger?: boolean;
  /** Optional list of named choices (radio group) returned in `__choice`. */
  choices?: { id: string; label: string; description?: string }[];
  defaultChoice?: string;
};

type Pending =
  | { kind: "confirm"; spec: ConfirmSpec; resolve: (v: boolean) => void }
  | {
      kind: "prompt";
      spec: PromptSpec;
      resolve: (v: Record<string, string> | null) => void;
    };

let setPending: ((p: Pending | null) => void) | null = null;

export function confirm(spec: ConfirmSpec): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!setPending) return resolve(false);
    setPending({ kind: "confirm", spec, resolve });
  });
}

export function prompt(
  spec: PromptSpec,
): Promise<Record<string, string> | null> {
  return new Promise<Record<string, string> | null>((resolve) => {
    if (!setPending) return resolve(null);
    setPending({ kind: "prompt", spec, resolve });
  });
}

export function DialogHost() {
  const [pending, setState] = useState<Pending | null>(null);

  useEffect(() => {
    setPending = setState;
    return () => {
      if (setPending === setState) setPending = null;
    };
  }, []);

  if (!pending) return null;

  if (pending.kind === "confirm") {
    return <ConfirmDialog pending={pending} clear={() => setState(null)} />;
  }
  return <PromptDialog pending={pending} clear={() => setState(null)} />;
}

function ConfirmDialog({
  pending,
  clear,
}: {
  pending: Extract<Pending, { kind: "confirm" }>;
  clear: () => void;
}) {
  const finish = (ok: boolean) => {
    clear();
    pending.resolve(ok);
  };
  return (
    <Dialog open onClose={() => finish(false)}>
      <h2 className="text-base font-semibold text-zinc-100">
        {pending.spec.title}
      </h2>
      {pending.spec.body && (
        <div className="mt-3 text-sm text-zinc-300">{pending.spec.body}</div>
      )}
      <DialogActions
        onCancel={() => finish(false)}
        onConfirm={() => finish(true)}
        confirmLabel={pending.spec.confirmLabel ?? "OK"}
        danger={pending.spec.danger}
      />
    </Dialog>
  );
}

function PromptDialog({
  pending,
  clear,
}: {
  pending: Extract<Pending, { kind: "prompt" }>;
  clear: () => void;
}) {
  const { spec } = pending;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of spec.fields) v[f.id] = f.defaultValue ?? "";
    if (spec.choices) v.__choice = spec.defaultChoice ?? spec.choices[0]!.id;
    return v;
  });

  const cancel = () => {
    clear();
    pending.resolve(null);
  };
  const ok = () => {
    clear();
    pending.resolve(values);
  };
  const allRequiredFilled = spec.fields.every(
    (f) => !f.required || (values[f.id] ?? "").trim().length > 0,
  );

  return (
    <Dialog open onClose={cancel} width={spec.fields.length > 2 ? 480 : 420}>
      <h2 className="text-base font-semibold text-zinc-100">{spec.title}</h2>
      {spec.body && (
        <div className="mt-2 text-sm text-zinc-400">{spec.body}</div>
      )}
      <div className="mt-4 space-y-3">
        {spec.fields.map((f) => (
          <div key={f.id}>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
              {f.label}
              {f.required && <span className="ml-0.5 text-red-400">*</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea
                rows={3}
                value={values[f.id] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.id]: e.target.value }))
                }
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <input
                type="text"
                autoFocus={spec.fields.indexOf(f) === 0}
                value={values[f.id] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && allRequiredFilled) ok();
                }}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
              />
            )}
          </div>
        ))}
        {spec.choices && (
          <div className="space-y-1.5 pt-1">
            {spec.choices.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-2 rounded border border-zinc-800 bg-zinc-950 p-2 hover:border-zinc-600"
              >
                <input
                  type="radio"
                  name="__choice"
                  value={c.id}
                  checked={(values.__choice ?? "") === c.id}
                  onChange={() =>
                    setValues((v) => ({ ...v, __choice: c.id }))
                  }
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm text-zinc-100">{c.label}</div>
                  {c.description && (
                    <div className="text-xs text-zinc-500">{c.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      <DialogActions
        onCancel={cancel}
        onConfirm={ok}
        confirmLabel={spec.confirmLabel ?? "OK"}
        confirmDisabled={!allRequiredFilled}
        danger={spec.danger}
      />
    </Dialog>
  );
}
