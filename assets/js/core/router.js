export class Router {
  #routes = new Map();
  #context;
  #started = false;

  constructor(context) {
    this.#context = context;
  }

  register(name, renderer) {
    this.#routes.set(name, renderer);
    return this;
  }

  current() {
    const raw = location.hash.replace(/^#\/?/, "").trim();
    return raw || "home";
  }

  navigate(name, { replace = false } = {}) {
    const target = this.#routes.has(name) ? name : "home";
    const hash = `#/${target}`;
    if (location.hash === hash) {
      return this.render(target);
    }
    if (replace) history.replaceState(null, "", hash);
    else location.hash = hash;
    if (replace) return this.render(target);
  }

  async render(name = this.current()) {
    const route = this.#routes.has(name) ? name : "home";
    const renderer = this.#routes.get(route);
    if (!renderer) return;

    const run = async () => renderer(this.#context);
    const reduceMotion = document.documentElement.dataset.reduceMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) {
      try {
        await document.startViewTransition(run).finished;
        return;
      } catch {
        // Fall through to a normal render if the browser rejects a transition.
      }
    }
    await run();
  }

  start() {
    if (this.#started) return;
    this.#started = true;
    addEventListener("hashchange", () => this.render());
    this.render();
  }
}
