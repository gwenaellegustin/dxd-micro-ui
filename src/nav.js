import { navigate as routerNavigate } from "./router.js";

const urlToView = {
  "index.html": "home",
  "app.html": "app",
  "evolution.html": "evolution",
};

export function navigate(target) {
  routerNavigate(urlToView[target] ?? target);
}
