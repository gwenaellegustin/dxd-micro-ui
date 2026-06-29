let currentView = "home";
const mountCallbacks = {};
const unmountCallbacks = {};

const VIEW_BUTTONS = {
  home: { left: null, right: null },
  app: { left: "close-btn", right: "validate-btn" },
  evolution: { left: "previous-btn", right: "evolution-validate-btn" },
};

const VIEW_ORDER = ["home", "app", "evolution"];

// Give the Android back button a history entry to pop
history.pushState(null, "");

window.addEventListener("popstate", () => {
  const leftBtnId = VIEW_BUTTONS[currentView]?.left;
  if (leftBtnId) {
    document.getElementById(leftBtnId)?.click();
  } else {
    // Already at home — re-push so the next back press stays in the app
    history.pushState(null, "");
  }
});

function updateHeaderButtons(viewName) {
  document.querySelectorAll("#app-header button").forEach((btn) => {
    btn.classList.remove("btn-active");
  });
  const { left, right } = VIEW_BUTTONS[viewName] ?? {};
  if (left) document.getElementById(left)?.classList.add("btn-active");
  if (right) document.getElementById(right)?.classList.add("btn-active");
}

export function onMount(view, fn) {
  mountCallbacks[view] = fn;
}

export function onUnmount(view, fn) {
  unmountCallbacks[view] = fn;
}

export function navigate(viewName) {
  if (viewName === currentView) return;

  const fromIdx = VIEW_ORDER.indexOf(currentView);
  const toIdx = VIEW_ORDER.indexOf(viewName);
  const isForward = toIdx > fromIdx;

  if (isForward) history.pushState(null, "");

  unmountCallbacks[currentView]?.();
  document.getElementById(`view-${currentView}`).classList.remove("view-active");

  const toEl = document.getElementById(`view-${viewName}`);
  toEl.classList.remove("slide-forward", "slide-back");
  void toEl.offsetWidth; // force reflow so animation restarts
  toEl.classList.add("view-active", isForward ? "slide-forward" : "slide-back");

  updateHeaderButtons(viewName);
  currentView = viewName;
  mountCallbacks[viewName]?.();
}

export function triggerInitialMount() {
  updateHeaderButtons(currentView);
  mountCallbacks[currentView]?.();
}
