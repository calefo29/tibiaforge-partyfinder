export function Brand({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-[0.3px]">
      <span
        className="border-2 border-[var(--accent)] rotate-45"
        style={{ width: size, height: size }}
      />
      <span>
        TibiaForge <span className="font-normal text-[var(--text-mute)] ml-1">Party Finder</span>
      </span>
    </div>
  );
}
