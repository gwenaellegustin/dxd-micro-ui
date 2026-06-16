let currentView = "home";
const mountCallbacks = {};
const unmountCallbacks = {};

const VIEW_BUTTONS = {
  home: { left: null, right: null },
  app: { left: "close-btn", right: "validate-btn" },
  evolution: { left: "previous-btn", right: "evolution-validate-btn" },
};

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
  unmountCallbacks[currentView]?.();
  document.getElementById(`view-${currentView}`).classList.remove("view-active");
  document.getElementById(`view-${viewName}`).classList.add("view-active");
  updateHeaderButtons(viewName);
  currentView = viewName;
  mountCallbacks[viewName]?.();
}

export function triggerInitialMount() {
  updateHeaderButtons(currentView);
  mountCallbacks[currentView]?.();
}
