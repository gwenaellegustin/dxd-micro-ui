export function navigate(url) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    location.href = url;
  };
  document.body.classList.add("leaving");
  document.body.addEventListener("animationend", go, { once: true });
  setTimeout(go, 200); // fallback if animationend never fires
}
