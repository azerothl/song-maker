"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ScrollMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-animate-section]").forEach((section) => {
        gsap.fromTo(
          section,
          { opacity: 0.35, y: 36 },
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            scrollTrigger: {
              trigger: section,
              start: "top 85%",
              end: "top 45%",
              scrub: 0.6,
            },
          },
        );
      });

      const items = gsap.utils.toArray<HTMLElement>("[data-feature-item]");
      if (items.length) {
        gsap.fromTo(
          items,
          { opacity: 0.25, x: -18 },
          {
            opacity: 1,
            x: 0,
            stagger: 0.08,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-feature-rail]",
              start: "top 75%",
              end: "bottom 55%",
              scrub: 0.8,
            },
          },
        );
      }

      gsap.utils.toArray<HTMLElement>("[data-frame-card]").forEach((card) => {
        gsap.fromTo(
          card,
          { y: 28 },
          {
            y: -8,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      });
    });

    return () => {
      ctx.revert();
    };
  }, []);

  return null;
}
