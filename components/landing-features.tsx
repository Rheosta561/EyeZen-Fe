"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Bell, CalendarDays, ClipboardList, DoorOpen, ShieldCheck, Users } from "lucide-react";

const features = [
  {
    icon: CalendarDays,
    title: "Plan every shift",
    body: "Build clear rosters, balance availability, and adjust cover when the day changes.",
    tag: "Rosters",
  },
  {
    icon: ClipboardList,
    title: "Run the appointment desk",
    body: "Keep appointments, clinicians, and clinic rooms moving together in one view.",
    tag: "Appointments",
  },
  {
    icon: ShieldCheck,
    title: "Handle leave and cover",
    body: "Request time away, review approvals, and find the right person to step in.",
    tag: "Leave & cover",
  },
  {
    icon: DoorOpen,
    title: "Keep rooms ready",
    body: "See which clinical spaces are available and keep every session in the right room.",
    tag: "Rooms",
  },
  {
    icon: Users,
    title: "Bring the right people in",
    body: "Invite staff, manage accounts, and give each role the tools they need.",
    tag: "People",
  },
  {
    icon: Bell,
    title: "Share the right updates",
    body: "Send notifications and act on changes without chasing messages across teams.",
    tag: "Notifications",
  },
] as const;

export function LandingFeatures() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mx-auto w-full max-w-[1240px] pb-8 pt-0 md:pb-[42px] md:pt-1" aria-labelledby="landing-features-title">
      <div className="mb-5 flex flex-col items-start gap-2.5 md:flex-row md:items-end md:justify-between md:gap-7">
        <div>
          <div className="section-kicker">WHAT EYEZEN DOES <span>·</span> EVERY DAY</div>
          <h2 id="landing-features-title" className="mt-2.5 max-w-[620px] text-[clamp(1.625rem,3.1vw,2.375rem)] font-semibold leading-[1.12] tracking-[-0.05em]">Everything a clinic day needs, in one calm workspace.</h2>
        </div>
        <p className="m-0 max-w-[520px] text-xs leading-[1.7] text-[var(--muted)] md:max-w-[330px] md:mb-[3px]">From the first roster to the final handover, each tool keeps hospital teams moving together.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.article
              key={feature.title}
              className="relative flex min-h-[196px] flex-col gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)] transition-[border-color,box-shadow] duration-200 before:pointer-events-none before:absolute before:-right-[70px] before:-top-[80px] before:h-[170px] before:w-[170px] before:rounded-full before:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] before:content-[''] hover:border-[var(--primary)] hover:shadow-[0_16px_40px_color-mix(in_srgb,var(--foreground)_10%,transparent)] motion-reduce:transition-none"
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: reduceMotion ? 0 : index * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
              whileHover={reduceMotion ? undefined : { y: -5 }}
            >
              <motion.span
                className="relative grid h-10 w-10 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))] text-[var(--primary)]"
                aria-hidden="true"
                animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: index * 0.25 }}
              >
                <Icon size={19} strokeWidth={1.8} />
              </motion.span>
              <div className="relative grid gap-1.5">
                <h3 className="m-0 text-sm font-semibold leading-tight tracking-[-0.01em]">{feature.title}</h3>
                <p className="m-0 text-[11px] leading-[1.6] text-[var(--muted)]">{feature.body}</p>
              </div>
              <div className="relative mt-auto flex items-center justify-between gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                  <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)] motion-reduce:animate-none" aria-hidden="true"/>
                  {feature.tag}
                </span>
                <span className="text-base text-[var(--primary)]" aria-hidden="true">↗</span>
              </div>
              <motion.span
                className="relative block h-0.5 w-full origin-left rounded-full bg-[color-mix(in_srgb,var(--primary)_70%,transparent)]"
                aria-hidden="true"
                initial={reduceMotion ? false : { scaleX: 0 }}
                whileInView={reduceMotion ? undefined : { scaleX: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.8, delay: reduceMotion ? 0 : 0.15 + index * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
