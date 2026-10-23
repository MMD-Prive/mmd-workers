//#region node_modules/.nitro/vite/services/ssr/assets/auth-D66UAcCi.js
/**
* Canonical production admin login authority (Worker-owned server UI).
* `/login` in this app is only a Lovable preview/presentation alias and must
* never become a second production admin auth namespace.
*/
var CANONICAL_ADMIN_LOGIN = "/internal/admin/login";
/** Build the canonical login URL, preserving a safe internal `next` target. */
function canonicalLoginUrl(next) {
	const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/internal/admin/control-room";
	return `${CANONICAL_ADMIN_LOGIN}?next=${encodeURIComponent(safe)}`;
}
/**
* Hard browser navigation to the canonical Worker-owned login page.
* TanStack navigation is deliberately NOT used: the login page is server UI.
*/
function redirectToCanonicalLogin(next) {
	if (typeof window === "undefined") return;
	window.location.replace(canonicalLoginUrl(next));
}
/** Check the current session against the backend. Never throws. */
async function fetchAuthMe(signal) {
	try {
		const res = await fetch("/v1/admin/auth/me", {
			method: "GET",
			credentials: "include",
			cache: "no-store",
			signal: signal ?? null
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}
function loginErrorMessage(status) {
	switch (status) {
		case 400: return "The request reached the server but was malformed (HTTP 400). Please retry.";
		case 401: return "Access code not recognized (HTTP 401). Check the code and try again.";
		case 403: return "This origin is not allowed to sign in (HTTP 403). Use the official console URL.";
		case 503: return "Sign-in is not configured on the server yet (HTTP 503). Contact the system owner.";
		default: return `Sign-in failed (HTTP ${status}). Please try again.`;
	}
}
/**
* Submit the operator access code to the Worker. The Worker validates the
* credential, issues the HttpOnly session cookie and redirects on success.
*/
async function login(credential, next) {
	const body = new URLSearchParams();
	body.set("credential", credential);
	body.set("next", next || "/internal/admin/control-room");
	try {
		const res = await fetch("/internal/admin/login/session", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
			credentials: "include",
			redirect: "follow",
			cache: "no-store",
			body: body.toString()
		});
		if (res.ok && res.redirected) return {
			ok: true,
			redirectTo: res.url
		};
		if (res.ok) return {
			ok: true,
			redirectTo: next || "/internal/admin/control-room"
		};
		return {
			ok: false,
			error: loginErrorMessage(res.status)
		};
	} catch {
		return {
			ok: false,
			error: "Could not reach the admin server. Refresh and try again."
		};
	}
}
//#endregion
export { login as n, redirectToCanonicalLogin as r, fetchAuthMe as t };
