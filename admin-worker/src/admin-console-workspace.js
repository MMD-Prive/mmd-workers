// This browser function is serialized by the Console renderer.
export function adminConsoleWorkspace(routing, path, bootHome) {
  const root = document.querySelector("[data-admin-console]");
  const home = document.getElementById("ac-home");
  const panel = document.getElementById("ac-tool");
  const title = document.getElementById("ac-view-title");
  const back = document.getElementById("ac-back");
  const refresh = document.getElementById("ac-refresh");
  const notice = document.getElementById("ac-tool-notice");
  const fallback = document.getElementById("ac-tool-fallback");
  const signIn = document.getElementById("ac-tool-sign-in");
  const frames = new Map();
  const lastToolUrl = new Map();
  // Webflow serves Member Intelligence on www and redirects the apex URL.
  const membershipOrigin = "https://www.mmdbkk.com";
  let homeUrl = path;
  let homeClient;
  let activeFrame;

  const relative = url => url.pathname + url.search + url.hash;
  const here = () => relative(new URL(location.href));
  function open(url, replace = false) {
    if (routing.resolve(location.href)?.view === "") homeUrl = here();
    if (url === path) url = homeUrl;
    if (here() === url) return;
    if (replace) history.replaceState(null, "", url);
    else history.pushState({ consoleBack: true }, "", url);
    show();
    document.getElementById("ac-main").focus();
    window.scrollTo(0, 0);
  }

  function follow(event, fromTool) {
    const link = event.target.closest?.("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || link.hasAttribute("download")) return;
    const destination = new URL(link.href, location.href);
    const current = new URL(link.ownerDocument.URL);
    if (!["http:", "https:"].includes(destination.protocol)) return;
    if (fromTool && destination.origin === current.origin && destination.pathname === current.pathname
      && destination.search === current.search && link.getAttribute("href").startsWith("#")) return; // In-page tabs and anchors belong to the tool.
    const url = routing.toConsole(destination);
    if (link.target && !["_self", "_top"].includes(link.target)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (url) {
      event.preventDefault();
      event.stopPropagation();
      const fromMenu = !fromTool && link.matches(".ac-nav-link, .ac-room-link");
      const previous = fromMenu ? lastToolUrl.get(routing.resolve(url)?.view) : "";
      open(previous || url);
    } else if (fromTool) {
      // Keep ordinary hand-offs to surfaces outside this Console's catalog.
      link.target = "_top";
    }
  }

  function mount(route) {
    const frame = document.createElement("iframe");
    frame.className = "ac-tool-frame";
    frame.title = route.title;
    frame.referrerPolicy = "same-origin";
    const webflowMembership = route.view === "membership" && location.origin === "https://mmdbkk.com";
    if (webflowMembership) {
      frame.dataset.membershipBridge = "true";
      frame.allow = "clipboard-write " + membershipOrigin;
    }
    frame.addEventListener("load", () => {
      if (webflowMembership) {
        frame.contentWindow.postMessage({ type: "mmd-console:attach", paths: routing.toolPaths }, membershipOrigin);
        return;
      }
      const doc = frame.contentDocument;
      if (doc && doc.URL === "about:blank") return;
      const loadedUrl = doc && new URL(doc.URL);
      const usable = loadedUrl && loadedUrl.origin === location.origin
        && loadedUrl.pathname.replace(/\/+$/, "") === new URL(route.tool, location.origin).pathname
        && doc.contentType === "text/html";
      frame.dataset.ready = usable ? "ready" : "failed";
      if (usable) {
        // The Console supplies global navigation. Keep tool-specific controls
        // and the existing Control Room sign-out button mounted.
        doc.getElementById("sigil-workspace-directory")?.remove();
        doc.body?.classList.remove("sigil-directory-offset");
        const roomMenu = doc.querySelector(".cr4__nav");
        if (roomMenu) roomMenu.style.display = "none";
        doc.addEventListener("click", event => follow(event, true), true);
      }
      if (frame === activeFrame) updateNotice();
    });
    frame.src = webflowMembership ? membershipOrigin + route.tool : route.tool;
    panel.append(frame);
    frames.set(route.tool, frame);
    return frame;
  }

  function updateNotice() {
    const failed = activeFrame?.dataset.ready === "failed";
    notice.hidden = !failed;
    if (activeFrame) activeFrame.hidden = failed;
    signIn.href = "/internal/admin/login?" + new URLSearchParams({ next: here() });
  }

  function show() {
    const route = routing.resolve(location.href);
    const isHome = route?.view === "";
    home.hidden = !isHome;
    refresh.hidden = !isHome;
    panel.hidden = isHome;
    back.hidden = isHome;
    document.getElementById("ac-tool-missing").hidden = Boolean(route);
    title.textContent = route?.title || "Console";
    document.title = title.textContent + " · SĪGIL System";

    if (activeFrame) activeFrame.hidden = true;
    activeFrame = null;
    if (route?.tool) {
      lastToolUrl.set(route.view, here());
      fallback.href = route.tool;
      activeFrame = frames.get(route.tool) || mount(route);
    }
    updateNotice();
    if (isHome) {
      if (!homeClient) homeClient = bootHome(routing.toConsole);
      else homeClient();
      homeUrl = here();
    }
    for (const link of root.querySelectorAll(".ac-nav-link, .ac-room-link")) {
      const linkRoute = routing.resolve(link.href);
      if (route && linkRoute?.view === route.view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    root.querySelector(".ac-mobile-tools").open = false;
  }

  root.addEventListener("click", event => {
    if (!event.target.closest?.("#ac-tool-fallback")) follow(event, false);
  });
  back.addEventListener("click", () => {
    if (history.state?.consoleBack) history.back();
    else open(homeUrl, true);
  });
  window.addEventListener("message", event => {
    if (event.origin !== membershipOrigin || event.source !== activeFrame?.contentWindow
      || activeFrame?.dataset.membershipBridge !== "true") return;
    if (event.data?.type === "mmd-console:login") {
      location.replace(signIn.href);
      return;
    }
    if (event.data?.type !== "mmd-console:open" || typeof event.data.path !== "string"
      || !URL.canParse(event.data.path, location.origin)) return;
    const url = routing.toConsole(event.data.path);
    if (url) open(url);
  });
  window.addEventListener("popstate", show);
  window.addEventListener("pagehide", event => {
    if (!event.persisted) return;
    for (const frame of frames.values()) frame.remove();
    frames.clear();
    lastToolUrl.clear();
    activeFrame = null;
  });
  window.addEventListener("pageshow", event => { if (event.persisted) show(); });
  show();
}
