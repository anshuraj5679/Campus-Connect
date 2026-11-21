import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/config";

/**
 * Placeholder college crest: a plain shield with the institution's initials.
 * Replace with the official crest SVG when the college provides one.
 */
export function Crest({ initials = siteConfig.crestInitials, className }: { initials?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 46"
      role="img"
      aria-label="College crest"
      className={cn("h-9 w-8 shrink-0", className)}
    >
      <path
        d="M20 1.5 37.5 7v14.2c0 10.6-7.2 19.4-17.5 23.3C9.7 40.6 2.5 31.8 2.5 21.2V7L20 1.5Z"
        fill="var(--maroon)"
      />
      <path
        d="M20 5 34.5 9.6v11.6c0 8.8-5.9 16.2-14.5 19.6-8.6-3.4-14.5-10.8-14.5-19.6V9.6L20 5Z"
        fill="none"
        stroke="var(--maroon-foreground)"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={initials.length > 2 ? 10.5 : 13}
        fontWeight="700"
        letterSpacing="0.5"
        fill="var(--maroon-foreground)"
      >
        {initials}
      </text>
    </svg>
  );
}
