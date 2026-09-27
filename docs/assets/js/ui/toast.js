export function toast(title, message = "", timeout = 2600) {
  const root = document.getElementById("toastRoot");
  if (!root) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}`;
  root.append(node);
  setTimeout(() => node.remove(), timeout);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}
