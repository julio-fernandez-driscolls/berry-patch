import wordmarkSvg from "../../media/driscolls-wordmark.svg";

// The official wordmark ships as an SVG file; parse it once so React can recolour the letters per theme.
const WORDMARK = (() => {
  const svg = new DOMParser().parseFromString(wordmarkSvg, "image/svg+xml").documentElement;
  return {
    viewBox: svg.getAttribute("viewBox") ?? "0 0 432 84",
    paths: [...svg.querySelectorAll("path")].map((p) => ({
      d: p.getAttribute("d") ?? "",
      dot: p.getAttribute("fill")?.toUpperCase() === "#DA291C",
    })),
  };
})();

/** Driscoll's logotype: letters follow `currentColor`, the "Driscoll's Dot" stays strawberry red. */
export function DriscollsWordmark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={WORDMARK.viewBox} role="img" aria-label="Driscoll's" className={className}>
      {WORDMARK.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.dot ? "var(--strawberry-red)" : "currentColor"} />
      ))}
    </svg>
  );
}

const MEDIA = document.body.dataset.media ?? "";
const BERRIES = ["strawberries", "raspberries", "blackberries", "blueberries"];

export function BerryPatchWelcome({ engineLabel }: { engineLabel: string }) {
  return (
    <div className="m-auto flex max-w-xs flex-col items-center px-6 text-center">
      <div className="flex items-end" aria-hidden="true">
        {BERRIES.map((berry) => (
          <img key={berry} src={`${MEDIA}/berries/${berry}.png`} alt="" className="-mx-1.5 h-14 w-auto" />
        ))}
      </div>
      <p className="mt-4 font-brand text-lg text-balance text-wordmark">Only the finest patches make it to main.</p>
      <p className="mt-1 text-xs text-muted">Select a pull request to review it with {engineLabel}.</p>
    </div>
  );
}
