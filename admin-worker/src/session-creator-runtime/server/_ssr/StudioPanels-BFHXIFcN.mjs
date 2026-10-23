import { r as __toESM } from "../_runtime.mjs";
import { v as require_jsx_runtime } from "../_libs/@radix-ui/react-accordion+[...].mjs";
import { o as cn } from "./client-DnJZI2KL.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { Y as writesBlockedInPreview, d as PreviewWriteBlockedError } from "./provider-CvQy8AcV.mjs";
import { t as useMutation } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/StudioPanels-BFHXIFcN.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Studio — typed contracts + live same-origin adapter for the authoritative
* Studio Worker (`admin-worker/src/studio-real-worker.js` in MMD-Prive/mmd-workers).
*
* All Studio routes are POST under `/studio/api/*` and are auth-guarded by the
* Worker. Normalisation, validation, Airtable writes, R2 verification and the
* publish confirm-key gate all live in the backend. The UI only collects input
* and renders the backend's answer; it never decides validity or publishability.
*/
var STUDIO_FIELDS = [
	"ST",
	"GY",
	"FR",
	"EN",
	"EX",
	"GWs",
	"EMs"
];
var STUDIO_LAYERS = [
	"Private / SIGIL",
	"Public / MMD Privé",
	"Exclusive / Black Card Review"
];
var STUDIO_DECISIONS = [
	"Needs Review",
	"Approved Direction",
	"Revise Source",
	"Reject"
];
var BASE = "/studio/api";
async function post(path, body, headers = {}) {
	if (writesBlockedInPreview()) throw new PreviewWriteBlockedError();
	const res = await fetch(path, {
		method: "POST",
		credentials: "include",
		cache: "no-store",
		headers: {
			"content-type": "application/json",
			...headers
		},
		body: JSON.stringify(body ?? {})
	});
	const text = await res.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`${path} failed (${res.status})${text ? `: ${text.slice(0, 300)}` : ""}`);
	}
	if (!res.ok || data?.ok === false) {
		const detail = data?.error ?? `${res.status}`;
		throw new Error(`${path} rejected — ${detail}`);
	}
	return data;
}
/** Studio is a write surface: same-origin live only, blocked in preview. */
var studioApi = {
	validateIntake: (input) => post(`${BASE}/intake/validate`, input),
	commitIntake: (input) => post(`${BASE}/intake/commit`, input),
	validateReview: (input) => post(`${BASE}/review/validate`, input),
	commitReview: (input) => post(`${BASE}/review/commit`, input),
	publishPlan: (input) => post(`${BASE}/model-preview/publish-plan`, input),
	commitPublish: (input, confirmKey) => post(`${BASE}/model-preview/commit`, input, { "X-Confirm-Key": confirmKey })
};
function Panel({ title, intro, endpoints, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		role: "tabpanel",
		"aria-label": title,
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[15px] font-semibold",
					children: title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-[13px] text-muted-foreground",
					children: intro
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-1 border-t border-border pt-3",
					children: endpoints.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "font-mono text-[11px] text-muted-foreground",
						children: e
					}, e))
				})
			]
		}), children]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-[11px] uppercase tracking-wide text-muted-foreground",
			children: label
		}), children]
	});
}
var inputCls = "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-gold/70 focus:ring-1 focus:ring-gold/40";
function Btn({ children, onClick, disabled, tone = "quiet" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		disabled,
		className: cn("rounded-md px-3 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50", tone === "primary" ? "border border-gold/60 bg-gold-muted" : "border border-border hover:bg-surface-2"),
		children
	});
}
/** Backend answer, rendered verbatim. The UI never re-judges it. */
function Result({ result, error, pending }) {
	if (pending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mt-3 text-[12px] text-muted-foreground",
		children: "Waiting for backend…"
	});
	if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		role: "alert",
		className: "mt-3 text-[12px] text-destructive",
		children: error.message
	});
	if (!result) return null;
	const warnings = result.warnings ?? [];
	const blockers = result.blockers ?? [];
	const missing = result.missing_keys ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mt-3 space-y-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[12px] text-verified",
				children: [
					"Backend: ",
					result.status ?? "ok",
					result.safe_preview_only ? " · validation only, nothing written" : "",
					result.published === false ? " · not published" : ""
				]
			}),
			warnings.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[12px] text-warning",
				children: w
			}, w)),
			blockers.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[12px] text-warning",
				children: ["Blocked — ", b]
			}, b)),
			missing.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[12px] text-destructive",
				children: ["Missing asset key — ", m]
			}, m)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
				className: "max-h-64 overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] text-muted-foreground",
				children: JSON.stringify(result, null, 2)
			})
		]
	});
}
function Selects({ field, setField, layer, setLayer, runNumber, setRunNumber }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
			label: "Field",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				className: inputCls,
				value: field,
				onChange: (e) => setField(e.target.value),
				children: STUDIO_FIELDS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: f,
					children: f
				}, f))
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
			label: "Layer",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				className: inputCls,
				value: layer,
				onChange: (e) => setLayer(e.target.value),
				children: STUDIO_LAYERS.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: l,
					children: l
				}, l))
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
			label: "Run number (required for GWs / EMs)",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				className: inputCls,
				value: runNumber,
				onChange: (e) => setRunNumber(e.target.value),
				placeholder: "GWs001"
			})
		})
	] });
}
function IntakePanel() {
	const [modelName, setModelName] = (0, import_react.useState)("");
	const [field, setField] = (0, import_react.useState)("ST");
	const [layer, setLayer] = (0, import_react.useState)(STUDIO_LAYERS[1]);
	const [runNumber, setRunNumber] = (0, import_react.useState)("");
	const [templateHint, setTemplateHint] = (0, import_react.useState)("");
	const [sourceOwner, setSourceOwner] = (0, import_react.useState)("");
	const [categoryPath, setCategoryPath] = (0, import_react.useState)("");
	const input = {
		model_name: modelName,
		field,
		layer,
		run_number: runNumber,
		template_hint: templateHint,
		source_owner: sourceOwner,
		category_path: categoryPath
	};
	const validate = useMutation({ mutationFn: () => studioApi.validateIntake(input) });
	const commit = useMutation({ mutationFn: () => studioApi.commitIntake(input) });
	const busy = validate.isPending || commit.isPending;
	const validated = validate.data?.ok === true;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Intake",
		intro: "Register a model source into Studio. The backend normalises the field, layer and run number, and only a validated intake should be committed.",
		endpoints: ["POST /studio/api/intake/validate", "POST /studio/api/intake/commit"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Model name",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: modelName,
								onChange: (e) => setModelName(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Template hint",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: templateHint,
								onChange: (e) => setTemplateHint(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Selects, {
							field,
							setField,
							layer,
							setLayer,
							runNumber,
							setRunNumber
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Source owner",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: sourceOwner,
								onChange: (e) => setSourceOwner(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Category path",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: categoryPath,
								onChange: (e) => setCategoryPath(e.target.value)
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						onClick: () => validate.mutate(),
						disabled: busy || !modelName,
						children: validate.isPending ? "Validating…" : "Validate"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						tone: "primary",
						onClick: () => commit.mutate(),
						disabled: busy || !validated,
						children: commit.isPending ? "Committing…" : "Commit intake"
					})]
				}),
				!validated && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[12px] text-muted-foreground",
					children: "Commit unlocks after the backend validates this intake."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: validate.data,
					error: validate.error,
					pending: validate.isPending
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: commit.data,
					error: commit.error,
					pending: commit.isPending
				})
			]
		})
	});
}
function ReviewPanel() {
	const [intakeId, setIntakeId] = (0, import_react.useState)("");
	const [reviewId, setReviewId] = (0, import_react.useState)("");
	const [modelName, setModelName] = (0, import_react.useState)("");
	const [field, setField] = (0, import_react.useState)("ST");
	const [layer, setLayer] = (0, import_react.useState)(STUDIO_LAYERS[1]);
	const [runNumber, setRunNumber] = (0, import_react.useState)("");
	const [decision, setDecision] = (0, import_react.useState)(STUDIO_DECISIONS[0]);
	const [score, setScore] = (0, import_react.useState)("0");
	const [ewvonNote, setEwvonNote] = (0, import_react.useState)("");
	const [finalNote, setFinalNote] = (0, import_react.useState)("");
	const input = {
		studio_intake_id: intakeId,
		studio_review_id: reviewId,
		model_name: modelName,
		field,
		layer,
		run_number: runNumber,
		decision,
		checklist_score: Number(score) || 0,
		ewvon_note: ewvonNote,
		final_note: finalNote
	};
	const validate = useMutation({ mutationFn: () => studioApi.validateReview(input) });
	const commit = useMutation({ mutationFn: () => studioApi.commitReview(input) });
	const busy = validate.isPending || commit.isPending;
	const validated = validate.data?.ok === true;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Review",
		intro: "Record the EWVON review decision against an intake. Committing a review saves the decision; it never publishes anything.",
		endpoints: ["POST /studio/api/review/validate", "POST /studio/api/review/commit"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Studio intake id",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: intakeId,
								onChange: (e) => setIntakeId(e.target.value),
								placeholder: "rec…"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Studio review id (optional)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: reviewId,
								onChange: (e) => setReviewId(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Model name",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: modelName,
								onChange: (e) => setModelName(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Decision",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: inputCls,
								value: decision,
								onChange: (e) => setDecision(e.target.value),
								children: STUDIO_DECISIONS.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: d,
									children: d
								}, d))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Selects, {
							field,
							setField,
							layer,
							setLayer,
							runNumber,
							setRunNumber
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Checklist score (0–20)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								type: "number",
								min: 0,
								max: 20,
								value: score,
								onChange: (e) => setScore(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "EWVON note",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: inputCls,
								rows: 3,
								value: ewvonNote,
								onChange: (e) => setEwvonNote(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Final note / output",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: inputCls,
								rows: 3,
								value: finalNote,
								onChange: (e) => setFinalNote(e.target.value)
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						onClick: () => validate.mutate(),
						disabled: busy || !modelName,
						children: validate.isPending ? "Validating…" : "Validate"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						tone: "primary",
						onClick: () => commit.mutate(),
						disabled: busy || !validated,
						children: commit.isPending ? "Saving…" : "Commit review"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: validate.data,
					error: validate.error,
					pending: validate.isPending
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: commit.data,
					error: commit.error,
					pending: commit.isPending
				})
			]
		})
	});
}
function PublishPanel() {
	const [reviewId, setReviewId] = (0, import_react.useState)("");
	const [modelName, setModelName] = (0, import_react.useState)("");
	const [internalCode, setInternalCode] = (0, import_react.useState)("");
	const [field, setField] = (0, import_react.useState)("ST");
	const [layer, setLayer] = (0, import_react.useState)(STUDIO_LAYERS[1]);
	const [runNumber, setRunNumber] = (0, import_react.useState)("");
	const [template, setTemplate] = (0, import_react.useState)("");
	const [publishTarget, setPublishTarget] = (0, import_react.useState)("Internal Preview");
	const [routeTarget, setRouteTarget] = (0, import_react.useState)("");
	const [r2Keys, setR2Keys] = (0, import_react.useState)("");
	const [imageUrl, setImageUrl] = (0, import_react.useState)("");
	const [reviewNote, setReviewNote] = (0, import_react.useState)("");
	const [safe, setSafe] = (0, import_react.useState)(false);
	const [confirmKey, setConfirmKey] = (0, import_react.useState)("");
	const input = {
		studio_review_id: reviewId,
		model_name: modelName,
		internal_code: internalCode,
		field,
		layer,
		run_number: runNumber,
		template,
		publish_target: publishTarget,
		public_route_target: routeTarget,
		r2_required_keys: r2Keys.split(/[\n,]/).map((k) => k.trim()).filter(Boolean),
		image_url: imageUrl,
		review_note: reviewNote,
		checklist: { safe }
	};
	const plan = useMutation({ mutationFn: () => studioApi.publishPlan(input) });
	const commit = useMutation({ mutationFn: () => studioApi.commitPublish(input, confirmKey) });
	const busy = plan.isPending || commit.isPending;
	/** Backend authority: only its plan decides whether publish may proceed. */
	const canCommit = plan.data?.can_commit === true && confirmKey.trim().length > 0 && !busy;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "Model Preview Publish",
		intro: "Build the publish plan, then commit it. The Worker decides can_commit, verifies asset keys and requires a second confirmation key before anything is published.",
		endpoints: ["POST /studio/api/model-preview/publish-plan", "POST /studio/api/model-preview/commit"],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-lg border border-border bg-surface p-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Studio review id",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: reviewId,
								onChange: (e) => setReviewId(e.target.value),
								placeholder: "rec…"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Model name",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: modelName,
								onChange: (e) => setModelName(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Internal code",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: internalCode,
								onChange: (e) => setInternalCode(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Template",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: template,
								onChange: (e) => setTemplate(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Selects, {
							field,
							setField,
							layer,
							setLayer,
							runNumber,
							setRunNumber
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Publish target",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: publishTarget,
								onChange: (e) => setPublishTarget(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Public route target",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: routeTarget,
								onChange: (e) => setRouteTarget(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Image URL",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: inputCls,
								value: imageUrl,
								onChange: (e) => setImageUrl(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Required asset keys (one per line)",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: inputCls,
								rows: 3,
								value: r2Keys,
								onChange: (e) => setR2Keys(e.target.value)
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Review note",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
								className: inputCls,
								rows: 3,
								value: reviewNote,
								onChange: (e) => setReviewNote(e.target.value)
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-3 flex items-center gap-2 text-[12px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: safe,
						onChange: (e) => setSafe(e.target.checked)
					}), "Safety checklist confirmed"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 grid gap-3 sm:grid-cols-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Confirm key (second confirmation, not stored)",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: inputCls,
							type: "password",
							autoComplete: "off",
							value: confirmKey,
							onChange: (e) => setConfirmKey(e.target.value)
						})
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						onClick: () => plan.mutate(),
						disabled: busy,
						children: plan.isPending ? "Building plan…" : "Build publish plan"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Btn, {
						tone: "primary",
						onClick: () => commit.mutate(),
						disabled: !canCommit,
						children: commit.isPending ? "Publishing…" : "Commit publish"
					})]
				}),
				plan.data?.can_commit !== true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[12px] text-warning",
					children: "Publish stays locked until the backend plan returns can_commit and a confirm key is entered."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: plan.data,
					error: plan.error,
					pending: plan.isPending
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Result, {
					result: commit.data,
					error: commit.error,
					pending: commit.isPending
				})
			]
		})
	});
}
//#endregion
export { PublishPanel as n, ReviewPanel as r, IntakePanel as t };
