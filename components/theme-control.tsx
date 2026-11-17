"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type Appearance = "light" | "dark" | "system";

const APPEARANCES = [
  { value: "light", label: "Light", hint: "Bright, focused surfaces", icon: Sun },
  { value: "dark", label: "Dark", hint: "Comfortable in low light", icon: Moon },
  { value: "system", label: "System", hint: "Follow this device", icon: Monitor },
] as const;

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

function useMounted() {
  return useSyncExternalStore(subscribeMounted, getMountedSnapshot, getMountedServerSnapshot);
}

function animateAppearance() {
  if (typeof document === "undefined" || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.remove("appearance-transition");
  void root.offsetWidth;
  root.classList.add("appearance-transition");
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    root.classList.remove("appearance-transition");
    transitionTimer = undefined;
  }, 420);
}

function useAppearance() {
  const { theme, resolvedTheme, systemTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const previousResolvedTheme = useRef(resolvedTheme);

  useEffect(() => {
    if (mounted && previousResolvedTheme.current && previousResolvedTheme.current !== resolvedTheme) animateAppearance();
    previousResolvedTheme.current = resolvedTheme;
  }, [mounted, resolvedTheme]);

  const selected: Appearance = mounted && (theme === "light" || theme === "dark" || theme === "system") ? theme : "system";
  const effective: "light" | "dark" = selected === "system" ? (mounted && systemTheme === "dark" ? "dark" : "light") : selected;

  function changeAppearance(next: Appearance) {
    animateAppearance();
    setTheme(next);
  }

  return { mounted, selected, effective, changeAppearance };
}

export function ThemeControl() {
  const { mounted, selected, effective, changeAppearance } = useAppearance();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const current = APPEARANCES.find((option) => option.value === selected) ?? APPEARANCES[2];
  const Icon = current.icon;

  if (!mounted) return <span className="theme-control-placeholder inline-block h-9 w-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] md:w-28" aria-hidden="true" />;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-semibold leading-none text-[var(--foreground)] shadow-[var(--shadow)] transition-colors duration-150 hover:bg-[var(--surface-muted)] hover:text-[var(--primary)] data-[state=open]:border-[var(--primary)] data-[state=open]:bg-[var(--surface-muted)] data-[state=open]:text-[var(--primary)]"
          aria-label={`Appearance: ${current.label}. Change appearance`}
          title={`Appearance: ${current.label}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={effective}
              initial={reduceMotion ? false : { opacity: 0, rotate: -40, scale: 0.72 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 40, scale: 0.72 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              className="grid h-4 w-4 place-items-center text-[var(--primary)]"
              aria-hidden="true"
            >
              <Icon size={15} strokeWidth={2} />
            </motion.span>
          </AnimatePresence>
          <span className="theme-control-label hidden whitespace-nowrap md:inline">Appearance</span>
        </motion.button>
      </DropdownMenu.Trigger>
      <AnimatePresence>
        {open ? (
          <DropdownMenu.Content asChild forceMount align="end" sideOffset={8} collisionPadding={10}>
            <motion.div
              className="appearance-menu z-[70] min-w-[232px] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-[7px] text-[var(--foreground)] shadow-[0_18px_50px_color-mix(in_srgb,var(--foreground)_18%,transparent)]"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Appearance</div>
              <DropdownMenu.RadioGroup value={selected} onValueChange={(value) => changeAppearance(value as Appearance)} className="grid gap-0.5">
                {APPEARANCES.map((option) => {
                  const OptionIcon = option.icon;
                  const active = selected === option.value;
                  return (
                    <DropdownMenu.RadioItem
                      key={option.value}
                      value={option.value}
                      className="flex min-h-[46px] cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)] data-[highlighted]:bg-[var(--surface-muted)] data-[state=checked]:font-semibold data-[state=checked]:text-[var(--primary)]"
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--primary)] ${active ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))]" : "bg-[var(--surface-muted)]"}`} aria-hidden="true">
                        <OptionIcon size={16} strokeWidth={1.9} />
                      </span>
                      <span className="grid flex-1 gap-0.5">
                        <b className="font-semibold">{option.label}</b>
                        <small className="text-[11px] font-normal text-[var(--muted)]">{option.hint}</small>
                      </span>
                      <span className="grid h-4 w-4 shrink-0 place-items-center text-[var(--primary)]" aria-hidden="true">
                        <AnimatePresence initial={false}>
                          {active ? (
                            <motion.span
                              key="check"
                              initial={reduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -20 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ duration: reduceMotion ? 0 : 0.16 }}
                            >
                              <Check size={14} strokeWidth={2.4} />
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </span>
                    </DropdownMenu.RadioItem>
                  );
                })}
              </DropdownMenu.RadioGroup>
            </motion.div>
          </DropdownMenu.Content>
        ) : null}
      </AnimatePresence>
    </DropdownMenu.Root>
  );
}

export function AppearanceSettings() {
  const { mounted, selected, changeAppearance } = useAppearance();
  const reduceMotion = useReducedMotion();

  return (
    <section className="account-settings-card [grid-column:1/-1]">
      <div className="section-kicker">APPEARANCE <span>·</span> THEME</div>
      <h2>Choose how EyeZen looks</h2>
      <p>System follows this device automatically. Light and Dark stay fixed until you change them.</p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 min-[761px]:grid-cols-3" role="group" aria-label="Appearance preference">
        {APPEARANCES.map((option) => {
          const Icon = option.icon;
          const active = mounted && selected === option.value;
          const stateClass = active
            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_18%,transparent)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] hover:border-[var(--primary)]";
          return (
            <motion.button
              key={option.value}
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.14 }}
              className={`flex min-h-[56px] items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 disabled:cursor-default disabled:opacity-65 min-[761px]:min-h-[70px] ${stateClass}`}
              aria-pressed={active}
              disabled={!mounted}
              onClick={() => changeAppearance(option.value)}
            >
              <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg text-[var(--primary)] ${active ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--surface))]" : "bg-[var(--surface-muted)]"}`} aria-hidden="true">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <b className="text-[13px] font-semibold">{option.label}</b>
                <small className="text-[11px] leading-[1.35] text-[var(--muted)]">{option.hint}</small>
              </span>
              <span className="ml-auto grid h-4 w-4 shrink-0 place-items-center text-[var(--primary)]" aria-hidden="true">
                <AnimatePresence initial={false}>
                  {active ? (
                    <motion.span
                      key="check"
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    >
                      <Check size={16} strokeWidth={2.4} />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
