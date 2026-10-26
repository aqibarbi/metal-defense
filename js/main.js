const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const add = (tag, cls, html = "") => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  document.body.append(e);
  return e;
};
const raf = (fn) => {
  let queued = false;
  return (...a) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...a);
    });
  };
};

/* Theme: toggle with circular reveal (View Transitions API, instant swap elsewhere) */
const themeMeta = document.querySelector('meta[name="theme-color"]');
const setTheme = (t, save) => {
  root.dataset.theme = t;
  if (themeMeta) themeMeta.content = t === "light" ? "#f4f3ed" : "#0c0e0d";
  if (save) {
    try {
      localStorage.setItem("md-theme", t);
    } catch (e) {}
  }
};
const themeBtn = document.querySelector(".theme-toggle");
themeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  const apply = () => setTheme(next, true);
  if (!document.startViewTransition || reduced) return apply();
  const b = themeBtn.getBoundingClientRect(),
    x = b.left + b.width / 2,
    y = b.top + b.height / 2;
  const r = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  root.classList.add("theme-vt");
  const t = document.startViewTransition(apply);
  t.ready.then(() =>
    root.animate(
      {
        clipPath: [
          `circle(0 at ${x}px ${y}px)`,
          `circle(${r}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 650,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    ),
  );
  t.finished.finally(() => root.classList.remove("theme-vt"));
});
/* Follow the OS theme until the visitor picks one */
matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
  let saved = null;
  try {
    saved = localStorage.getItem("md-theme");
  } catch (err) {}
  if (!saved) setTheme(e.matches ? "light" : "dark", false);
});

/* Mobile menu: scrim, outside click, Escape (returns focus), resize reset */
const menuBtn = document.querySelector(".menu-btn");
const nav = document.getElementById("nav");
const scrim = add("div", "scrim");
const navQuery = matchMedia("(max-width: 900px)");
const setMenu = (open, returnFocus = false) => {
  nav.classList.toggle("open", open);
  scrim.classList.toggle("show", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (!open && returnFocus) menuBtn.focus();
};
menuBtn.addEventListener("click", () =>
  setMenu(!nav.classList.contains("open")),
);
nav.addEventListener("click", (e) => {
  if (e.target.closest("a")) setMenu(false);
});
scrim.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("open"))
    setMenu(false, true);
});
document.addEventListener("pointerdown", (e) => {
  if (nav.classList.contains("open") && !e.target.closest("#nav, .menu-btn"))
    setMenu(false);
});
navQuery.addEventListener("change", (e) => {
  if (!e.matches) setMenu(false);
});

/* Scroll: progress bar, smart header, back to top */
const header = document.querySelector(".site-header");
const bar = add("div", "progress");
const toTop = add(
  "button",
  "to-top",
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
toTop.type = "button";
toTop.setAttribute("aria-label", "Back to top");
toTop.addEventListener("click", () =>
  scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }),
);
let lastY = scrollY;
const onScroll = raf(() => {
  const y = scrollY,
    max = root.scrollHeight - innerHeight;
  bar.style.setProperty("--p", max > 0 ? Math.min(y / max, 1) : 0);
  header.classList.toggle("scrolled", y > 24);
  /* hide on a deliberate scroll down only; never while the menu is open */
  const dy = y - lastY;
  if (y <= 140) header.classList.remove("hide");
  else if (Math.abs(dy) > 6) {
    header.classList.toggle("hide", dy > 0 && !nav.classList.contains("open"));
    lastY =
      y; /* only moves once a direction is clear, so slow scrolls still count */
  }
  toTop.classList.toggle("show", y > 700);
});
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll, { passive: true });
onScroll();

/* Split headline into letters (screen readers get the full text via aria-label) */
const split = (el) => {
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  let i = 0;
  const walk = (node) =>
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (!part.trim()) return frag.append(" ");
          const w = document.createElement("span");
          w.className = "word";
          w.setAttribute("aria-hidden", "true");
          [...part].forEach((c) => {
            const s = document.createElement("span");
            s.className = "ch";
            s.style.setProperty("--i", Math.min(i++, 60));
            s.textContent = c;
            w.append(s);
          });
          frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  walk(el);
};
if (!reduced) $(".hero h1, .page-hero h1").forEach(split);

/* Marquee: duplicate track for a seamless loop */
$(".marquee-track").forEach((t) => {
  t.innerHTML += t.innerHTML;
});

/* Scroll reveal with stagger. Anything already above the fold shows at once. */
const items = $(".reveal");
if ("IntersectionObserver" in window && !reduced) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const i = [...el.parentElement.children]
          .filter((c) => c.classList.contains("reveal"))
          .indexOf(el);
        el.style.transitionDelay = `${Math.max(i, 0) * 90}ms`;
        el.classList.add("in");
        setTimeout(
          () => {
            el.style.transitionDelay = "";
          },
          1000 + i * 90,
        );
        io.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -4% 0px" },
  );
  items.forEach((el) => io.observe(el));
} else items.forEach((el) => el.classList.add("in"));

/* Pointer effects (mouse devices only) */
if (fine && !reduced) {
  /* Cursor ring: the loop sleeps once it has caught up with the pointer */
  const ring = add("div", "cursor off");
  let tx = -100,
    ty = -100,
    cx = tx,
    cy = ty,
    running = false;
  const tick = () => {
    cx += (tx - cx) * 0.18;
    cy += (ty - cy) * 0.18;
    ring.style.translate = `${cx}px ${cy}px`;
    if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1)
      requestAnimationFrame(tick);
    else running = false;
  };
  addEventListener(
    "pointermove",
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (ring.classList.contains("off")) {
        cx = tx;
        cy = ty;
        ring.classList.remove("off");
      }
      ring.classList.toggle(
        "hot",
        !!e.target.closest("a, button, input, textarea, .tile"),
      );
      if (!running) {
        running = true;
        requestAnimationFrame(tick);
      }
    },
    { passive: true },
  );
  root.addEventListener("pointerleave", () => ring.classList.add("off"));

  /* 3D tilt: image-led blocks only, so text never rotates */
  $(".tile, .product-card, .benefit-img").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      if (!el.classList.contains("in") && el.classList.contains("reveal"))
        return;
      const b = el.getBoundingClientRect(),
        px = (e.clientX - b.left) / b.width - 0.5,
        py = (e.clientY - b.top) / b.height - 0.5;
      el.style.transition = "transform .12s linear";
      el.style.transform = `perspective(900px) rotateX(${-py * 5}deg) rotateY(${px * 5}deg) translateY(-4px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transition =
        "transform .5s cubic-bezier(0.4, 0, 0.2, 1), box-shadow .3s, border-color .3s";
      el.style.transform = "";
    });
  });

  /* Cursor spotlight */
  $(".card, .product-card, .contact-box").forEach((el) => {
    el.classList.add("spot");
    el.addEventListener(
      "pointermove",
      (e) => {
        const b = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - b.left}px`);
        el.style.setProperty("--my", `${e.clientY - b.top}px`);
      },
      { passive: true },
    );
  });

  /* Magnetic buttons (small pull so click targets stay put) */
  $(".btn, .icon-btn").forEach((el) => {
    el.addEventListener(
      "pointermove",
      (e) => {
        const b = el.getBoundingClientRect();
        el.style.translate = `${(e.clientX - b.left - b.width / 2) * 0.2}px ${(e.clientY - b.top - b.height / 2) * 0.3}px`;
      },
      { passive: true },
    );
    el.addEventListener("pointerleave", () => {
      el.style.translate = "";
    });
  });

  /* Hero parallax */
  const hm = document.querySelector(".hero-media");
  if (hm) {
    const park = raf((x, y) => {
      hm.style.setProperty("--px", (x / innerWidth - 0.5) * 2);
      hm.style.setProperty("--py", (y / innerHeight - 0.5) * 2);
    });
    addEventListener(
      "pointermove",
      (e) => {
        if (scrollY < innerHeight) park(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }
}

/* Contact form: submit state (restored if the page comes back from bfcache) */
const sent = document.getElementById("sent");
if (sent && location.search.includes("sent")) sent.hidden = false;
const form = document.querySelector("form.form");
if (form) {
  const submit = form.querySelector('button[type="submit"]');
  const label = submit.textContent;
  form.addEventListener("submit", () => {
    submit.disabled = true;
    submit.textContent = "Sending…";
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
