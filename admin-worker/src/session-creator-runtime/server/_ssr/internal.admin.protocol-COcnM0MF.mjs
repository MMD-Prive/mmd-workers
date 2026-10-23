import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { J as usingDemoData, R as protocolApi } from "./provider-CvQy8AcV.mjs";
import { C as LoaderCircle, D as Info, G as ChevronRight, nt as ArrowLeft } from "../_libs/lucide-react.mjs";
import { n as ConsoleShell } from "./ConsoleShell-Dawp5DUR.mjs";
import { a as useQueryClient, r as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { i as AccordionTrigger, n as AccordionContent, r as AccordionItem, t as Accordion } from "./accordion-Tku30sEi.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/internal.admin.protocol-COcnM0MF.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var WORKFLOW = [
	"Draft",
	"Review",
	"QA",
	"Publish",
	"Audit"
];
var HEALTH = [
	{
		key: "published",
		label: "Published",
		tone: "text-ok border-ok/40",
		match: (s) => s === "published"
	},
	{
		key: "needs_review",
		label: "Needs Review",
		tone: "text-warn border-warn/40",
		match: (s) => s === "review" || s === "needs_review"
	},
	{
		key: "qa_failed",
		label: "QA Failed",
		tone: "text-destructive border-destructive/40",
		match: (s) => s === "qa_failed"
	},
	{
		key: "draft",
		label: "Draft",
		tone: "text-muted-foreground border-border",
		match: (s) => s === "draft" || s === "qa_passed" || !s
	}
];
var STATUS_LABEL = {
	draft: "Draft",
	review: "In review",
	qa_passed: "QA passed",
	qa_failed: "QA failed",
	published: "Published",
	archived: "Archived"
};
function statusLabel(s) {
	if (!s) return "Unknown";
	return STATUS_LABEL[s] ?? s;
}
function StatusChip({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", status === "published" ? "border-ok/40 text-ok" : status === "qa_failed" ? "border-destructive/40 text-destructive" : status === "review" || status === "qa_passed" ? "border-warn/40 text-warn" : "border-border text-muted-foreground"),
		children: statusLabel(status)
	});
}
function LiveStatus() {
	const demo = usingDemoData();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-border bg-surface p-3.5 text-[12px] text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 text-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, {
				className: "h-3.5 w-3.5",
				"aria-hidden": true
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[12px] font-medium",
				children: demo ? "Preview · read-only view, protocol changes disabled" : "Airtable authoritative · Worker live"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
			className: "mt-2 space-y-1 pl-5 [list-style:disc]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["Canonical repo: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono",
					children: "MMD-Prive/mmd-workers"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Authority: Airtable canonical base · Workers enforce every change" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Fast-read cache is a copy only; it never decides anything" }),
				demo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Draft, review, QA and publish are disabled on this preview" })
			]
		})]
	});
}
function ErrorBox({ error }) {
	const msg = error instanceof Error ? error.message : "Something went wrong.";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "alert",
		className: "rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-[13px] text-destructive",
		children: msg
	});
}
function Loading({ label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2 rounded-lg border border-border bg-surface p-4 text-[13px] text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
			className: "h-3.5 w-3.5 animate-spin motion-reduce:animate-none",
			"aria-hidden": true
		}), label]
	});
}
function ProtocolCenter() {
	const [activeKey, setActiveKey] = (0, import_react.useState)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConsoleShell, {
		module: "Protocol Center",
		path: "/internal/admin/protocol",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
			className: "mx-auto max-w-6xl space-y-6 px-4 py-8",
			children: activeKey ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
				protocolKey: activeKey,
				onBack: () => setActiveKey(null)
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Overview, { onOpen: setActiveKey })
		})
	});
}
function Overview({ onOpen }) {
	const { data, isPending, error } = useQuery({
		queryKey: ["protocols"],
		queryFn: ({ signal }) => protocolApi.list(signal)
	});
	const items = data?.items ?? [];
	const attention = items.filter((p) => [
		"review",
		"qa_failed",
		"qa_passed"
	].includes(String(p.status)));
	const recent = [...items].filter((p) => p.updated_at ?? p.published_at).sort((a, b) => String(b.updated_at ?? b.published_at).localeCompare(String(a.updated_at ?? a.published_at))).slice(0, 5);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-xl font-semibold tracking-tight",
			children: "What rules is MMD running today?"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-2 max-w-3xl text-[13px] text-muted-foreground",
			children: [
				"Protocol Center manages the rules MMD Privé operates by, and shows what needs your decision. It never calculates entitlement —",
				" ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-mono",
					children: "my_mmd_entitlement_resolver_v1"
				}),
				" stays the authority, and Workers own validation, publish and audit."
			]
		})] }),
		error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorBox, { error }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"aria-labelledby": "health-h",
			className: "space-y-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				id: "health-h",
				className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
				children: "Protocol health"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
				children: HEALTH.map((h) => {
					const count = data?.counts?.[h.key] ?? items.filter((p) => h.match(p.status)).length;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: cn("rounded-lg border bg-surface p-4", h.tone),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[12px]",
								children: h.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-2xl font-semibold tabular-nums text-foreground",
								children: isPending || error ? "—" : count
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[11px] text-muted-foreground",
								children: isPending ? "Loading" : error ? "Unavailable" : "From canonical record"
							})
						]
					}, h.key);
				})
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"aria-labelledby": "domains-h",
			className: "space-y-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				id: "domains-h",
				className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
				children: "Domains"
			}), isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Loading, { label: "Loading protocols…" }) : items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-lg border border-dashed border-border bg-surface-2 p-6 text-[13px] text-muted-foreground",
				children: "No protocols were returned."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-3 md:grid-cols-2",
				children: items.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => onOpen(d.key),
					className: "step-transition group flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-left outline-none hover:border-gold/50 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block text-[14px] font-medium text-foreground",
								children: d.label ?? d.key
							}),
							d.summary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-1 block text-[12px] text-muted-foreground",
								children: d.summary
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mt-2 flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: d.status }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[11px] text-muted-foreground",
										children: [
											"Draft v",
											d.draft_version ?? "—",
											" · Published v",
											d.published_version ?? 0
										]
									}),
									d.consumers?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[11px] text-muted-foreground",
										children: ["Used by: ", d.consumers.join(" · ")]
									}) : null
								]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
						className: "mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-gold",
						"aria-hidden": true
					})]
				}, d.key))
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 lg:grid-cols-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-labelledby": "attn-h",
				className: "space-y-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "attn-h",
					className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Needs attention"
				}), attention.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-lg border border-dashed border-border bg-surface-2 p-6 text-[13px] text-muted-foreground",
					children: "Nothing is waiting on you right now."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "space-y-2",
					children: attention.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-[12px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => onOpen(p.key),
							className: "text-left text-foreground underline-offset-4 hover:underline",
							children: p.label ?? p.key
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: p.status })]
					}, p.key))
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				"aria-labelledby": "recent-h",
				className: "space-y-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "recent-h",
					className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Recent changes"
				}), recent.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-lg border border-dashed border-border bg-surface-2 p-6 text-[13px] text-muted-foreground",
					children: "No changes have been recorded yet."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "space-y-2",
					children: recent.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-lg border border-border bg-surface p-3 text-[12px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-foreground",
								children: p.label ?? p.key
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-muted-foreground",
								children: [
									"v",
									p.published_version ?? 0,
									" · ",
									p.owner ?? "—"
								]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-muted-foreground",
							children: p.change_summary ?? "No change summary."
						})]
					}, p.key))
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"aria-labelledby": "queue-h",
			className: "space-y-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "queue-h",
					className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Publish queue"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "flex flex-wrap items-center gap-2",
					"aria-label": "Protocol workflow",
					children: WORKFLOW.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] tracking-[0.14em] text-muted-foreground",
							children: [
								String(i + 1).padStart(2, "0"),
								" · ",
								s.toUpperCase()
							]
						}), i < WORKFLOW.length - 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: "→"
						})]
					}, s))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-lg border border-dashed border-border bg-surface-2 p-6 text-[13px] text-muted-foreground",
					children: items.filter((p) => p.can_publish === true).length === 0 ? "Nothing is ready to publish. A protocol only becomes publishable after the backend records a passing QA run." : `${items.filter((p) => p.can_publish === true).length} protocol(s) cleared QA and can be published.`
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveStatus, {})
	] });
}
function Detail({ protocolKey, onBack }) {
	const qc = useQueryClient();
	const [actionError, setActionError] = (0, import_react.useState)(null);
	const [actionNote, setActionNote] = (0, import_react.useState)(null);
	const { data, isPending, error } = useQuery({
		queryKey: ["protocol", protocolKey],
		queryFn: ({ signal }) => protocolApi.detail(protocolKey, signal)
	});
	const p = data?.protocol ?? { key: protocolKey };
	const refresh = async () => {
		await Promise.all([qc.invalidateQueries({ queryKey: ["protocol", protocolKey] }), qc.invalidateQueries({ queryKey: ["protocols"] })]);
	};
	const run = useMutation({
		mutationFn: async (action) => {
			if (action === "Draft") return protocolApi.draft(protocolKey);
			if (action === "Review") return protocolApi.review(protocolKey);
			if (action === "QA") return protocolApi.runQa(protocolKey);
			if (action === "Publish") {
				const expected = p.draft_version;
				if (typeof expected !== "number") throw new Error("The backend did not report a draft version. Reload and try again.");
				return protocolApi.publish(protocolKey, expected);
			}
			throw new Error("Audit history is read-only.");
		},
		onMutate: () => {
			setActionError(null);
			setActionNote(null);
		},
		onSuccess: async (res) => {
			setActionNote(res?.snapshot_warning ?? res?.message ?? null);
			await refresh();
		},
		onError: (e) => {
			setActionError(e instanceof Error ? e.message : "The change was not accepted.");
		}
	});
	const canDo = (action) => {
		if (isPending || error || run.isPending) return false;
		if (action === "Audit") return false;
		if (action === "Draft") return p.can_draft === true;
		if (action === "Review") return p.can_review === true;
		if (action === "QA") return p.can_run_qa === true;
		return p.can_publish === true && typeof p.draft_version === "number";
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			onClick: onBack,
			className: "step-transition inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-muted-foreground outline-none hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
				className: "h-3.5 w-3.5",
				"aria-hidden": true
			}), "All protocols"]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "text-xl font-semibold tracking-tight",
			children: p.label ?? protocolKey
		}), p.summary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 max-w-3xl text-[13px] text-muted-foreground",
			children: p.summary
		})] }),
		isPending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Loading, { label: "Loading protocol…" }),
		error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorBox, { error }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "grid gap-x-8 gap-y-3 text-[12px] sm:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Status",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: p.status })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Version",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-foreground",
							children: [
								"Draft v",
								p.draft_version ?? "—",
								" · Published v",
								p.published_version ?? 0
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Effective from",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: p.effective_from ?? "—"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Published at",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: p.published_at ?? "—"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Owner",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: p.owner ?? "—"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Source of truth",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-foreground",
							children: p.source_of_truth ?? data?.source_of_truth ?? "Airtable canonical base"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Used by",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-foreground",
							children: p.consumers?.join(" · ") ?? "—"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
						label: "Risk level",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", p.risk_level === "high" ? "border-destructive/40 text-destructive" : p.risk_level === "medium" ? "border-warn/40 text-warn" : "border-border text-muted-foreground"),
							children: p.risk_level ?? "—"
						})
					})
				]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 lg:grid-cols-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Published vs Draft",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3 sm:grid-cols-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextBlock, {
							label: "Published",
							text: data?.published_text,
							empty: "Nothing published yet."
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextBlock, {
							label: "Draft",
							text: data?.draft_text,
							empty: "Draft text is empty."
						})]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "QA checklist",
					children: data?.qa?.checks?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-1.5 text-[12px]",
						children: data.qa.checks.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-start gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: c.passed ? "text-ok" : "text-destructive",
								children: c.passed ? "✓" : "✗"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-muted-foreground",
								children: [
									c.label ?? c.id,
									" ",
									c.detail ? `— ${c.detail}` : ""
								]
							})]
						}, c.id ?? i))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: "No QA run has been recorded for this draft."
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Change summary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: p.change_summary ?? "No change summary recorded."
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
					title: "Audit history",
					children: data?.audit?.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-1.5 text-[12px] text-muted-foreground",
						children: data.audit.map((a, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-foreground",
								children: a.action ?? "change"
							}),
							" · v",
							a.from_version ?? "—",
							" → v",
							a.to_version ?? "—",
							" · ",
							a.actor ?? "—",
							" ·",
							" ",
							a.at ?? "—"
						] }, a.id ?? i))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[12px] text-muted-foreground",
						children: "No audit entries yet."
					})
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "space-y-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[12px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Workflow actions"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-2",
					children: WORKFLOW.map((s) => {
						const enabled = canDo(s);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: !enabled,
							onClick: () => run.mutate(s),
							title: enabled ? void 0 : s === "Publish" ? p.publish_blocked_reason ?? "Publish opens after QA passes on this draft." : s === "Audit" ? "Audit history is read-only." : "Not available for this protocol right now.",
							className: cn("step-transition rounded-md border px-3 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring", enabled ? "border-gold/50 text-foreground hover:bg-surface-2" : "cursor-not-allowed border-border text-muted-foreground opacity-50"),
							children: s
						}, s);
					})
				}),
				run.isPending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Loading, { label: "Sending to the canonical record…" }),
				actionError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorBox, { error: new Error(actionError) }),
				actionNote && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-[12px] text-warn",
					children: actionNote
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-[11px] text-muted-foreground",
					children: ["Fails closed: the backend decides what is allowed. Publish stays off until a passing QA run is recorded, and versions are set by the server — never here.", data?.cache_status ? ` Fast-read copy: ${data.cache_status}.` : ""]
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Accordion, {
			type: "single",
			collapsible: true,
			className: "rounded-lg border border-border bg-surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionItem, {
				value: "tech",
				className: "border-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccordionTrigger, {
					className: "px-4 text-[12px] uppercase tracking-[0.16em] text-muted-foreground hover:no-underline",
					children: "Technical details"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AccordionContent, {
					className: "space-y-3 px-4 text-[12px] text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap items-center gap-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded border border-ok/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ok",
								children: "Live backend · Airtable canonical · Worker enforced"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "space-y-1 font-mono text-[11px] text-foreground",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "GET /v1/admin/protocols" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["GET /v1/admin/protocols/", protocolKey] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
									"POST /v1/admin/protocols/",
									protocolKey,
									"/draft"
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
									"POST /v1/admin/protocols/",
									protocolKey,
									"/review"
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
									"POST /v1/admin/protocols/",
									protocolKey,
									"/qa/run"
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
									"POST /v1/admin/protocols/",
									protocolKey,
									"/publish"
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
									"GET /v1/admin/protocols/",
									protocolKey,
									"/audit"
								] })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
							"Same-origin with credentials. Every mutation carries an",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "Idempotency-Key"
							}),
							"; publish sends",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-mono",
								children: "expected_version"
							}),
							" from the backend draft version. Authority: ",
							data?.authority ?? "airtable",
							" ·",
							" ",
							data?.source_of_truth ?? "Airtable canonical base",
							". KV is a disposable published read cache written only after the Airtable write and audit append succeed."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LiveStatus, {})
					]
				})]
			})
		})
	] });
}
function TextBlock({ label, text, empty }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[11px] uppercase tracking-wider text-muted-foreground",
		children: label
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mt-1 whitespace-pre-wrap text-[12px] text-foreground",
		children: text?.trim() ? text : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-muted-foreground",
			children: empty
		})
	})] });
}
function Row({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "flex items-center",
			children
		})]
	});
}
function Panel({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-lg border border-border bg-surface-2 p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "text-[13px] font-medium text-foreground",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1.5",
			children
		})]
	});
}
//#endregion
export { ProtocolCenter as component };
