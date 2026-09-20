"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { brandCarouselSlides } from "@/data/brandCarousel";

const AUTOPLAY_MS = 5500;
const TOUCH_SWIPE_THRESHOLD = 40;

type SlideState = "active" | "next" | "prev";

function slideState(index: number, active: number, total: number): SlideState {
  if (index === active) return "active";
  const diff = (index - active + total) % total;
  return diff <= total / 2 ? "next" : "prev";
}

export function BrandCarousel() {
  const total = brandCarouselSlides.length;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const running = playing && !hovered && !focused && !reducedMotion;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % total);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [running, total]);

  function goTo(index: number) {
    setActive(((index % total) + total) % total);
  }
  function next() {
    goTo(active + 1);
  }
  function prev() {
    goTo(active - 1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < TOUCH_SWIPE_THRESHOLD) return;
    if (delta < 0) next();
    else prev();
  }

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Anuncios de Preciara"
      className="relative overflow-hidden border-b border-border-navy bg-navy-900"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={handleKeyDown}
    >
      <CarouselBackground />

      <Container>
        <div
          className="relative flex flex-col gap-1.5 py-2.5 sm:h-[88px] sm:flex-row sm:items-center sm:gap-5 sm:py-0 lg:h-[84px]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="carousel-viewport relative h-[54px] min-w-0 shrink-0 overflow-hidden sm:h-10 sm:flex-1 sm:shrink lg:h-11">
            {brandCarouselSlides.map((slide, i) => {
              const state = slideState(i, active, total);
              return (
                <div
                  key={slide.id}
                  role="group"
                  aria-roledescription="diapositiva"
                  aria-label={`${i + 1} de ${total}`}
                  aria-hidden={state !== "active"}
                  data-state={state}
                  className="carousel-slide pointer-events-none absolute inset-0 flex flex-col justify-center"
                >
                  <p className="line-clamp-2 text-sm font-bold leading-tight text-white sm:line-clamp-1 sm:text-base lg:text-lg">
                    {slide.headline}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-navy-100 sm:line-clamp-1 sm:text-sm">
                    {slide.text}
                  </p>
                </div>
              );
            })}
          </div>

          <CarouselOrnament />

          <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={prev}
              className="flex h-7 w-7 items-center justify-center rounded-full text-navy-100 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
              aria-label="Anuncio anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            </button>

            <div className="flex items-center gap-1.5" role="group" aria-label="Selecciona un anuncio">
              {brandCarouselSlides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-current={i === active ? "true" : undefined}
                  aria-label={`Anuncio ${i + 1} de ${total}`}
                  onClick={() => goTo(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === active ? "w-4 bg-teal-500" : "w-1.5 bg-white/25 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={next}
              className="flex h-7 w-7 items-center justify-center rounded-full text-navy-100 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
              aria-label="Anuncio siguiente"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            </button>

            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-pressed={!playing}
              aria-label={playing ? "Pausar carrusel" : "Reanudar carrusel"}
              className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-navy-100 transition-colors hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
            >
              {playing ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Fondo decorativo de toda la franja: resplandores animados + línea de precio muy sutil. */
function CarouselBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="carousel-glow absolute -left-10 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-teal-600), transparent 70%)" }}
      />
      <div
        className="carousel-glow-delay absolute -right-16 -bottom-20 h-56 w-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-crystal), transparent 70%)" }}
      />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.14]"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 70 L60 58 L120 66 L180 34 L240 46 L300 20 L360 30 L400 12"
          stroke="var(--color-crystal)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Formas geométricas con efecto cristal + mini gráfico de precio, solo en escritorio. */
function CarouselOrnament() {
  return (
    <div aria-hidden="true" className="relative hidden h-full w-32 shrink-0 items-center lg:flex xl:w-40">
      <div className="relative h-16 w-full">
        <div className="absolute right-3 top-1 h-11 w-24 -rotate-6 rounded-xl border border-white/15 bg-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-sm" />
        <div className="absolute right-8 top-4 h-11 w-24 rotate-3 rounded-xl border border-teal-500/25 bg-teal-500/10 shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur-sm" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 140 64" fill="none">
          <path
            d="M4 46 L26 38 L48 44 L70 24 L92 32 L114 14 L134 20"
            stroke="var(--color-teal-500)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="134" cy="20" r="3" fill="var(--color-coral-500)" />
        </svg>
      </div>
    </div>
  );
}
