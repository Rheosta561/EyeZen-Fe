"use client";

import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";

export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const choices = ["light", "dark", "system"] as const;
  return <button className="theme-control" aria-label="Change appearance" title="Change appearance: light, dark, or system" onClick={() => { const current = choices.indexOf((theme ?? "system") as typeof choices[number]); setTheme(choices[(current + 1) % choices.length]); }}><SunMoon size={16}/><span>Appearance</span></button>;
}
