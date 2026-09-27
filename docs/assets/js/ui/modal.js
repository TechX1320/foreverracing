export function showDialog(html, { locked = false } = {}) {
  const root = document.getElementById("dialogRoot");
  const dialog = document.createElement("dialog");
  dialog.className = "fr-dialog";
  dialog.innerHTML = html;
  root.append(dialog);

  if (locked) {
    dialog.addEventListener("cancel", (event) => event.preventDefault());
  } else {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closeDialog(dialog);
    });
  }

  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
}

export function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) dialog.close();
  else dialog.remove();
}
