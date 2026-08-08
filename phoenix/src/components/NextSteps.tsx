import { useEffect, useState } from "react";
import { computeNextSteps, type Step } from "../nextSteps";
import { storageReport } from "../safety";
import { usePaneActive } from "../paneContext";
import type { Settings } from "../settings";

const TIER_LABEL: Record<number, string> = {
  0: "first",
  1: "don't lose it",
  2: "makes the case stronger",
  3: "when you have a minute",
};

/** A short, ordered list of what to do next, built from her own records. */
export default function NextSteps({
  go,
  settings,
}: {
  go: (v: string) => void;
  settings: Settings;
}) {
  const active = usePaneActive();
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const r = await storageReport();
      const s = await computeNextSteps({
        vaultOn: !!settings.vaultCode,
        persisted: r.persisted,
        installed: r.installed,
        isIos: r.isIos,
        hisNames: settings.hisNames,
      });
      if (!cancelled) setSteps(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, settings.vaultCode, settings.hisNames]);

  if (!steps?.length) return null;

  return (
    <div className="panel">
      <h2>What to do next</h2>
      <p className="muted small">
        Worked out from what's actually in your case. You don't have to do all of it, and you don't
        have to do it today.
      </p>
      {steps.map((s, i) => (
        <div className="item-card" key={i}>
          <div className="head">
            <span className="tag">{TIER_LABEL[s.tier]}</span>
            <span className="title">{s.title}</span>
          </div>
          <p className="small" style={{ margin: "6px 0" }}>
            {s.why}
          </p>
          <button className="btn secondary sm" onClick={() => go(s.view)}>
            Take me there →
          </button>
        </div>
      ))}
    </div>
  );
}
