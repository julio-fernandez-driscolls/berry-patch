import type { ButtonHTMLAttributes, ReactNode } from "react";
import Markdown from "react-markdown";
import type { Severity, Verdict } from "../../src/shared/protocol";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:bg-accent-hover",
    secondary: "bg-secondary text-secondary-fg hover:bg-secondary-hover",
    ghost: "text-link hover:underline px-1!",
  }[variant];
  return (
    <button
      className={`cursor-pointer rounded-sm px-2.5 py-1 text-xs whitespace-nowrap disabled:cursor-default disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

const BERRY_DOTS = ["bg-strawberry", "bg-raspberry", "bg-blackberry", "bg-blueberry"];

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className={`berry-dots inline-flex items-center gap-[3px] ${className}`}>
      {BERRY_DOTS.map((color) => (
        <span key={color} className={`size-1.5 rounded-full ${color}`} />
      ))}
    </span>
  );
}

export function Pill({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

export function DocIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d="M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V5z" />
      <path d="M9.5 1.75V5h3.25M5.75 8.25h4.5M5.75 10.75h3" />
    </svg>
  );
}

export function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`size-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""} ${className}`}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-critical/20 text-critical",
  major: "bg-major/20 text-major",
  minor: "bg-minor/20 text-minor",
  nit: "bg-nit/20 text-nit",
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill className={`uppercase ${SEVERITY_STYLE[severity]}`}>{severity}</Pill>;
}

const VERDICT: Record<Verdict, { label: string; style: string }> = {
  approve: { label: "Looks good", style: "bg-ok/20 text-ok" },
  comment: { label: "Comments", style: "bg-comment/20 text-comment" },
  request_changes: { label: "Changes requested", style: "bg-critical/20 text-critical" },
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return <Pill className={v.style}>{v.label}</Pill>;
}

export function Md({ children }: { children: string }) {
  return (
    <div className="md leading-relaxed break-words">
      <Markdown>{children}</Markdown>
    </div>
  );
}
