export class Store extends EventTarget {
  #player = null;

  get player() {
    return this.#player;
  }

  setPlayer(player) {
    this.#player = player ? structuredClone(player) : null;
    this.dispatchEvent(new CustomEvent("player", { detail: this.#player }));
  }

  clear() {
    this.#player = null;
    this.dispatchEvent(new CustomEvent("player", { detail: null }));
  }

  onPlayer(listener) {
    const handler = (event) => listener(event.detail);
    this.addEventListener("player", handler);
    return () => this.removeEventListener("player", handler);
  }
}
