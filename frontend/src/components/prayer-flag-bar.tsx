import { PRAYER_FLAGS } from "@/config/chat-theme";

type PrayerFlagBarProps = {
  className?: string;
  thicknessClassName?: string;
};

export function PrayerFlagBar({
  className = "",
  thicknessClassName = "h-[2px]",
}: PrayerFlagBarProps) {
  return (
    <div className={`prayer-flag-bar flex w-full overflow-hidden ${thicknessClassName} ${className}`} aria-hidden="true">
      {PRAYER_FLAGS.map((color, index) => (
        <div key={color} className="prayer-flag-segment flex-1" style={{ background: color, animationDelay: `${index * 0.28}s` }} />
      ))}
      <span className="prayer-flag-sheen" />
    </div>
  );
}
