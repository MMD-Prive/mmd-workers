import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { r as SigilLogo } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { S as useSearch, x as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { J as usingDemoData } from "./provider-CvQy8AcV.mjs";
import { n as login, r as redirectToCanonicalLogin, t as fetchAuthMe } from "./auth-D66UAcCi.mjs";
import { M as Eye, N as EyeOff, S as LockKeyhole, d as ShieldCheck } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/login-CJKGcKL4.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* PREVIEW ALIAS ONLY.
*
* Canonical production admin login authority is the Worker-owned server route
* /internal/admin/login (session issuer: /internal/admin/login/session).
* This route exists purely as a Lovable preview/presentation alias and must
* never become a second production admin auth namespace. On a live (non-demo)
* origin it immediately hard-redirects to the canonical login page, preserving
* a safe `next`. No auth is issued locally — the backend is the sole authority.
*/
function LoginPage() {
	const { next } = useSearch({ from: "/login" });
	const navigate = useNavigate();
	const [credential, setCredential] = (0, import_react.useState)("");
	const [show, setShow] = (0, import_react.useState)(false);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [checking, setChecking] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		if (!usingDemoData()) redirectToCanonicalLogin(next);
	}, [next]);
	(0, import_react.useEffect)(() => {
		if (!usingDemoData()) return;
		let alive = true;
		fetchAuthMe().then((me) => {
			if (!alive) return;
			if (me && me.ok !== false && me.authenticated !== false) navigate({
				to: next,
				replace: true
			});
			else setChecking(false);
		});
		return () => {
			alive = false;
		};
	}, [navigate, next]);
	async function onSubmit(e) {
		e.preventDefault();
		if (!credential || busy) return;
		setBusy(true);
		setError(null);
		const result = await login(credential, next);
		if (result.ok && result.redirectTo) {
			window.location.assign(result.redirectTo);
			return;
		}
		setError(result.error ?? "Sign-in failed. Please try again.");
		setBusy(false);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "flex min-h-screen items-center justify-center bg-background px-4 py-10",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-8 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SigilLogo, { className: "mx-auto" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "sr-only",
							children: "SĪGIL System"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted-foreground",
							children: "Internal operator console"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit,
					className: "rounded-xl border border-border bg-surface-1 p-6 shadow-lg",
					"aria-label": "Operator sign in",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-4 flex items-center gap-2 text-sm text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
								className: "h-4 w-4 text-gold",
								"aria-hidden": true
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Access is verified and audited by the server." })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							htmlFor: "credential",
							className: "mb-1.5 block text-xs font-medium text-foreground",
							children: "Access code"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LockKeyhole, {
									className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
									"aria-hidden": true
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									id: "credential",
									type: show ? "text" : "password",
									value: credential,
									onChange: (e) => setCredential(e.target.value),
									autoComplete: "off",
									autoFocus: true,
									disabled: checking || busy,
									className: "step-transition w-full rounded-lg border border-border bg-surface-2 py-2.5 pl-10 pr-16 text-sm text-foreground outline-none focus:border-gold/60 focus:ring-2 focus:ring-ring disabled:opacity-50",
									placeholder: "Enter operator access code"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => setShow((s) => !s),
									"aria-pressed": show,
									"aria-label": show ? "Hide access code" : "Show access code",
									className: "absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground",
									children: [show ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, {
										className: "h-3.5 w-3.5",
										"aria-hidden": true
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, {
										className: "h-3.5 w-3.5",
										"aria-hidden": true
									}), show ? "HIDE" : "SHOW"]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-[11px] leading-relaxed text-muted-foreground",
							children: "Your code is never stored in the browser. An approved session is issued as a secure server-side cookie only."
						}),
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							role: "alert",
							className: "mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning",
							children: error
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: checking || busy || !credential,
							className: "step-transition mt-5 w-full rounded-lg border border-gold/60 bg-gold-muted py-2.5 text-sm font-medium text-foreground outline-none hover:bg-gold/20 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
							children: checking ? "Checking session…" : busy ? "Checking access…" : "Enter Control Room"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-6 text-center font-mono text-[10px] text-muted-foreground",
					children: "Authentication · authorization · audit — owned by the backend"
				})
			]
		})
	});
}
//#endregion
export { LoginPage as component };
