import { n as __require, r as __toESM, t as __commonJSMin } from "../../_runtime.mjs";
import processModule from "node:process";
import { Buffer } from "node:buffer";
//#region node_modules/@ai-sdk/provider/dist/index.js
/**
* Symbol used for identifying AI SDK Error instances.
* Enables checking if an error is an instance of AISDKError across package versions.
*/
var marker$16 = "vercel.ai.error";
var symbol$16 = Symbol.for(marker$16);
/**
* Custom error class for AI SDK related errors.
* @extends Error
*/
var AISDKError = class AISDKError extends Error {
	/**
	* Creates an AI SDK Error.
	*
	* @param {Object} params - The parameters for creating the error.
	* @param {string} params.name - The name of the error.
	* @param {string} params.message - The error message.
	* @param {unknown} [params.cause] - The underlying cause of the error.
	*/
	constructor({ name, message, cause }) {
		super(message);
		this[symbol$16] = true;
		this.name = name;
		this.cause = cause;
	}
	/**
	* Checks if the given error is an AI SDK Error.
	* @param {unknown} error - The error to check.
	* @returns {boolean} True if the error is an AI SDK Error, false otherwise.
	*/
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$16);
	}
	static hasMarker(error, marker) {
		const markerSymbol = Symbol.for(marker);
		return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
	}
};
var name$14 = "AI_APICallError";
var marker$14 = `vercel.ai.error.${name$14}`;
var symbol$14 = Symbol.for(marker$14);
var APICallError = class extends AISDKError {
	constructor({ message, url, requestBodyValues, statusCode, responseHeaders, responseBody, cause, isRetryable = statusCode != null && (statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500), data }) {
		super({
			name: name$14,
			message,
			cause
		});
		this[symbol$14] = true;
		this.url = url;
		this.requestBodyValues = requestBodyValues;
		this.statusCode = statusCode;
		this.responseHeaders = responseHeaders;
		this.responseBody = responseBody;
		this.isRetryable = isRetryable;
		this.data = data;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$14);
	}
};
var name$13 = "AI_EmptyResponseBodyError";
var marker$13 = `vercel.ai.error.${name$13}`;
var symbol$13 = Symbol.for(marker$13);
var EmptyResponseBodyError = class extends AISDKError {
	constructor({ message = "Empty response body" } = {}) {
		super({
			name: name$13,
			message
		});
		this[symbol$13] = true;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$13);
	}
};
function getErrorMessage(error) {
	if (error == null) return "unknown error";
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.toString();
	return JSON.stringify(error);
}
var name$11 = "AI_InvalidArgumentError";
var marker$11 = `vercel.ai.error.${name$11}`;
var symbol$11$1 = Symbol.for(marker$11);
/**
* A function argument is invalid.
*/
var InvalidArgumentError = class extends AISDKError {
	constructor({ message, cause, argument }) {
		super({
			name: name$11,
			message,
			cause
		});
		this[symbol$11$1] = true;
		this.argument = argument;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$11);
	}
};
var name$10$1 = "AI_InvalidPromptError";
var marker$10$1 = `vercel.ai.error.${name$10$1}`;
var symbol$10$2 = Symbol.for(marker$10$1);
/**
* A prompt is invalid. This error should be thrown by providers when they cannot
* process a prompt.
*/
var InvalidPromptError = class extends AISDKError {
	constructor({ prompt, message, cause }) {
		super({
			name: name$10$1,
			message: `Invalid prompt: ${message}`,
			cause
		});
		this[symbol$10$2] = true;
		this.prompt = prompt;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$10$1);
	}
};
var name$9$2 = "AI_InvalidResponseDataError";
var marker$9$3 = `vercel.ai.error.${name$9$2}`;
var symbol$9$2 = Symbol.for(marker$9$3);
/**
* Server returned a response with invalid data content.
* This should be thrown by providers when they cannot parse the response from the API.
*/
var InvalidResponseDataError = class extends AISDKError {
	constructor({ data, message = `Invalid response data: ${JSON.stringify(data)}.` }) {
		super({
			name: name$9$2,
			message
		});
		this[symbol$9$2] = true;
		this.data = data;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$9$3);
	}
};
var name$8$2 = "AI_JSONParseError";
var marker$8$3 = `vercel.ai.error.${name$8$2}`;
var symbol$8$2 = Symbol.for(marker$8$3);
var JSONParseError = class extends AISDKError {
	constructor({ text, cause }) {
		super({
			name: name$8$2,
			message: `JSON parsing failed: Text: ${text}.\nError message: ${getErrorMessage(cause)}`,
			cause
		});
		this[symbol$8$2] = true;
		this.text = text;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$8$3);
	}
};
var name$7$2 = "AI_LoadAPIKeyError";
var marker$7$3 = `vercel.ai.error.${name$7$2}`;
var symbol$7$2 = Symbol.for(marker$7$3);
var LoadAPIKeyError = class extends AISDKError {
	constructor({ message }) {
		super({
			name: name$7$2,
			message
		});
		this[symbol$7$2] = true;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$7$3);
	}
};
var name$3$2 = "AI_NoSuchProviderReferenceError";
var marker$3$3 = `vercel.ai.error.${name$3$2}`;
var symbol$3$2 = Symbol.for(marker$3$3);
/**
* Thrown when a provider reference cannot be resolved because the specified
* provider is not found in the provider reference mapping.
*/
var NoSuchProviderReferenceError = class extends AISDKError {
	constructor({ provider, reference, message = `No provider reference found for provider '${provider}'. Available providers: ${Object.keys(reference).join(", ")}` }) {
		super({
			name: name$3$2,
			message
		});
		this[symbol$3$2] = true;
		this.provider = provider;
		this.reference = reference;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$3$3);
	}
};
var name$2$2 = "AI_TooManyEmbeddingValuesForCallError";
var marker$2$11 = `vercel.ai.error.${name$2$2}`;
var symbol$2$2 = Symbol.for(marker$2$11);
var TooManyEmbeddingValuesForCallError = class extends AISDKError {
	constructor(options) {
		super({
			name: name$2$2,
			message: `Too many values for a single embedding call. The ${options.provider} model "${options.modelId}" can only embed up to ${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`
		});
		this[symbol$2$2] = true;
		this.provider = options.provider;
		this.modelId = options.modelId;
		this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
		this.values = options.values;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$2$11);
	}
};
var name$1$11 = "AI_TypeValidationError";
var marker$1$10 = `vercel.ai.error.${name$1$11}`;
var symbol$1$12 = Symbol.for(marker$1$10);
var TypeValidationError = class TypeValidationError extends AISDKError {
	constructor({ value, cause, context }) {
		let contextPrefix = "Type validation failed";
		if (context?.field) contextPrefix += ` for ${context.field}`;
		if (context?.entityName || context?.entityId) {
			contextPrefix += " (";
			const parts = [];
			if (context.entityName) parts.push(context.entityName);
			if (context.entityId) parts.push(`id: "${context.entityId}"`);
			contextPrefix += parts.join(", ");
			contextPrefix += ")";
		}
		super({
			name: name$1$11,
			message: `${contextPrefix}: Value: ${JSON.stringify(value)}.\nError message: ${getErrorMessage(cause)}`,
			cause
		});
		this[symbol$1$12] = true;
		this.value = value;
		this.context = context;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$1$10);
	}
	/**
	* Wraps an error into a TypeValidationError.
	* If the cause is already a TypeValidationError with the same value and context, it returns the cause.
	* Otherwise, it creates a new TypeValidationError.
	*
	* @param {Object} params - The parameters for wrapping the error.
	* @param {unknown} params.value - The value that failed validation.
	* @param {unknown} params.cause - The original error or cause of the validation failure.
	* @param {TypeValidationContext} params.context - Optional context about what is being validated.
	* @returns {TypeValidationError} A TypeValidationError instance.
	*/
	static wrap({ value, cause, context }) {
		if (TypeValidationError.isInstance(cause) && cause.value === value && cause.context?.field === context?.field && cause.context?.entityName === context?.entityName && cause.context?.entityId === context?.entityId) return cause;
		return new TypeValidationError({
			value,
			cause,
			context
		});
	}
};
var name$16 = "AI_UnsupportedFunctionalityError";
var marker$17 = `vercel.ai.error.${name$16}`;
var symbol$12 = Symbol.for(marker$17);
var UnsupportedFunctionalityError = class extends AISDKError {
	constructor({ functionality, message = `'${functionality}' functionality not supported.` }) {
		super({
			name: name$16,
			message
		});
		this[symbol$12] = true;
		this.functionality = functionality;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$17);
	}
};
function isJSONValue(value) {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
	if (Array.isArray(value)) return value.every(isJSONValue);
	if (typeof value === "object") return Object.entries(value).every(([key, val]) => typeof key === "string" && (val === void 0 || isJSONValue(val)));
	return false;
}
function isJSONObject(value) {
	return value != null && typeof value === "object" && Object.entries(value).every(([key, val]) => typeof key === "string" && (val === void 0 || isJSONValue(val)));
}
Object.freeze({ status: "aborted" });
function $constructor(name, initializer, params) {
	function init(inst, def) {
		var _a;
		Object.defineProperty(inst, "_zod", {
			value: inst._zod ?? {},
			enumerable: false
		});
		(_a = inst._zod).traits ?? (_a.traits = /* @__PURE__ */ new Set());
		inst._zod.traits.add(name);
		initializer(inst, def);
		for (const k in _.prototype) if (!(k in inst)) Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
		inst._zod.constr = _;
		inst._zod.def = def;
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		var _a;
		const inst = params?.Parent ? new Definition() : this;
		init(inst, def);
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		for (const fn of inst._zod.deferred) fn();
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var globalConfig = {};
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
function cached(getter) {
	return { get value() {
		{
			const value = getter();
			Object.defineProperty(this, "value", { value });
			return value;
		}
	} };
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const valDecCount = (val.toString().split(".")[1] || "").length;
	const stepDecCount = (step.toString().split(".")[1] || "").length;
	const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
	return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
}
function defineLazy(object, key, getter) {
	Object.defineProperty(object, key, {
		get() {
			{
				const value = getter();
				object[key] = value;
				return value;
			}
		},
		set(v) {
			Object.defineProperty(object, key, { value: v });
		},
		configurable: true
	});
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
function esc(str) {
	return JSON.stringify(str);
}
var captureStackTrace = Error.captureStackTrace ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = cached(() => {
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
var propertyKeyTypes = /* @__PURE__ */ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = {
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
	const newShape = {};
	const currDef = schema._zod.def;
	for (const key in mask) {
		if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
		if (!mask[key]) continue;
		newShape[key] = currDef.shape[key];
	}
	return clone(schema, {
		...schema._zod.def,
		shape: newShape,
		checks: []
	});
}
function omit(schema, mask) {
	const newShape = { ...schema._zod.def.shape };
	const currDef = schema._zod.def;
	for (const key in mask) {
		if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
		if (!mask[key]) continue;
		delete newShape[key];
	}
	return clone(schema, {
		...schema._zod.def,
		shape: newShape,
		checks: []
	});
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	return clone(schema, {
		...schema._zod.def,
		get shape() {
			const _shape = {
				...schema._zod.def.shape,
				...shape
			};
			assignProp(this, "shape", _shape);
			return _shape;
		},
		checks: []
	});
}
function merge(a, b) {
	return clone(a, {
		...a._zod.def,
		get shape() {
			const _shape = {
				...a._zod.def.shape,
				...b._zod.def.shape
			};
			assignProp(this, "shape", _shape);
			return _shape;
		},
		catchall: b._zod.def.catchall,
		checks: []
	});
}
function partial(Class, schema, mask) {
	const oldShape = schema._zod.def.shape;
	const shape = { ...oldShape };
	if (mask) for (const key in mask) {
		if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
		if (!mask[key]) continue;
		shape[key] = Class ? new Class({
			type: "optional",
			innerType: oldShape[key]
		}) : oldShape[key];
	}
	else for (const key in oldShape) shape[key] = Class ? new Class({
		type: "optional",
		innerType: oldShape[key]
	}) : oldShape[key];
	return clone(schema, {
		...schema._zod.def,
		shape,
		checks: []
	});
}
function required(Class, schema, mask) {
	const oldShape = schema._zod.def.shape;
	const shape = { ...oldShape };
	if (mask) for (const key in mask) {
		if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
		if (!mask[key]) continue;
		shape[key] = new Class({
			type: "nonoptional",
			innerType: oldShape[key]
		});
	}
	else for (const key in oldShape) shape[key] = new Class({
		type: "nonoptional",
		innerType: oldShape[key]
	});
	return clone(schema, {
		...schema._zod.def,
		shape,
		checks: []
	});
}
function aborted(x, startIndex = 0) {
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
	const full = {
		...iss,
		path: iss.path ?? []
	};
	if (!iss.message) full.message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	delete full.inst;
	delete full.continue;
	if (!ctx?.reportInput) delete full.input;
	return full;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
//#endregion
//#region node_modules/zod/v4/core/errors.js
var initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	Object.defineProperty(inst, "_zod", {
		value: inst._zod,
		enumerable: false
	});
	Object.defineProperty(inst, "issues", {
		value: def,
		enumerable: false
	});
	Object.defineProperty(inst, "message", {
		get() {
			return JSON.stringify(def, jsonStringifyReplacer, 2);
		},
		enumerable: true
	});
	Object.defineProperty(inst, "toString", {
		value: () => inst.message,
		enumerable: false
	});
};
var $ZodError = $constructor("$ZodError", initializer$1);
var $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) {
		fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
		fieldErrors[sub.path[0]].push(mapper(sub));
	} else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, _mapper) {
	const mapper = _mapper || function(issue) {
		return issue.message;
	};
	const fieldErrors = { _errors: [] };
	const processError = (error) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues });
		else if (issue.code === "invalid_element") processError({ issues: issue.issues });
		else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
		else {
			let curr = fieldErrors;
			let i = 0;
			while (i < issue.path.length) {
				const el = issue.path[i];
				if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
				else {
					curr[el] = curr[el] || { _errors: [] };
					curr[el]._errors.push(mapper(issue));
				}
				curr = curr[el];
				i++;
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region node_modules/zod/v4/core/parse.js
var _parse$1 = (_Err) => (schema, value, _ctx, _params) => {
	const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	if (result.issues.length) {
		const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, _params?.callee);
		throw e;
	}
	return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
	const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	if (result.issues.length) {
		const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, params?.callee);
		throw e;
	}
	return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? {
		success: false,
		error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? {
		success: false,
		error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
//#endregion
//#region node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][^\s-]{8,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
var duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
var uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
var e164 = /^\+(?:[0-9]){6,14}[0-9]$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time$1(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
	const time = timeSource({ precision: args.precision });
	const opts = ["Z"];
	if (args.local) opts.push("");
	if (args.offset) opts.push(`([+-]\\d{2}:\\d{2})`);
	const timeRegex = `${time}(?:${opts.join("|")})`;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string$1 = (params) => {
	const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
	return new RegExp(`^${regex}$`);
};
var integer = /^\d+$/;
var number$1 = /^-?\d+(?:\.\d+)?/i;
var boolean$1 = /true|false/i;
var _null$2 = /null/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
//#endregion
//#region node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
		if (def.value < curr) if (def.inclusive) bag.maximum = def.value;
		else bag.exclusiveMaximum = def.value;
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
		if (def.value > curr) if (def.inclusive) bag.minimum = def.value;
		else bag.exclusiveMinimum = def.value;
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		var _a;
		(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
	});
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		bag.minimum = minimum;
		bag.maximum = maximum;
		if (isInt) bag.pattern = integer;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inst
		});
	};
});
var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
		if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
		if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.minimum = def.length;
		bag.maximum = def.length;
		bag.length = def.length;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const length = input.length;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		if (def.pattern) {
			bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
			bag.patterns.add(def.pattern);
		}
	});
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
	def.pattern = pattern;
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = []) {
		this.content = [];
		this.indent = 0;
		if (this) this.args = args;
	}
	indented(fn) {
		this.indent += 1;
		fn(this);
		this.indent -= 1;
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const args = this?.args;
		const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
		return new F(...args, lines.join("\n"));
	}
};
//#endregion
//#region node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 0,
	patch: 0
};
//#endregion
//#region node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const checks = [...inst._zod.def.checks ?? []];
	if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		inst._zod.run = (payload, ctx) => {
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
	inst["~standard"] = {
		validate: (value) => {
			try {
				const r = safeParse$1(inst, value);
				return r.success ? { value: r.data } : { issues: r.error?.issues };
			} catch (_) {
				return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	};
});
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const orig = payload.value;
			const url = new URL(orig);
			const href = url.href;
			if (def.hostname) {
				def.hostname.lastIndex = 0;
				if (!def.hostname.test(url.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.protocol) {
				def.protocol.lastIndex = 0;
				if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (!orig.endsWith("/") && href.endsWith("/")) payload.value = href.slice(0, -1);
			else payload.value = href;
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	def.pattern ?? (def.pattern = nanoid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = `ipv4`;
	});
});
var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = `ipv6`;
	});
	inst._zod.check = (payload) => {
		try {
			new URL(`http://[${payload.value}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		const [address, prefix] = payload.value.split("/");
		try {
			if (!prefix) throw new Error();
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) throw new Error();
			if (prefixNum < 0 || prefixNum > 128) throw new Error();
			new URL(`http://[${address}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64);
	$ZodStringFormat.init(inst, def);
	inst._zod.onattach.push((inst) => {
		inst._zod.bag.contentEncoding = "base64";
	});
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64URL(data) {
	if (!base64url.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64url);
	$ZodStringFormat.init(inst, def);
	inst._zod.onattach.push((inst) => {
		inst._zod.bag.contentEncoding = "base64url";
	});
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodNull = /*@__PURE__*/ $constructor("$ZodNull", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = _null$2;
	inst._zod.values = /* @__PURE__ */ new Set([null]);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (input === null) return payload;
		payload.issues.push({
			expected: "null",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodAny = /*@__PURE__*/ $constructor("$ZodAny", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = Array(input.length);
		const proms = [];
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else handleArrayResult(result, payload, i);
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handleObjectResult(result, final, key) {
	if (result.issues.length) final.issues.push(...prefixIssues(key, result.issues));
	final.value[key] = result.value;
}
function handleOptionalObjectResult(result, final, key, input) {
	if (result.issues.length) if (input[key] === void 0) if (key in input) final.value[key] = void 0;
	else final.value[key] = result.value;
	else final.issues.push(...prefixIssues(key, result.issues));
	else if (result.value === void 0) {
		if (key in input) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	const _normalized = cached(() => {
		const keys = Object.keys(def.shape);
		for (const k of keys) if (!(def.shape[k] instanceof $ZodType)) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
		const okeys = optionalKeys(def.shape);
		return {
			shape: def.shape,
			keys,
			keySet: new Set(keys),
			numKeys: keys.length,
			optionalKeys: new Set(okeys)
		};
	});
	defineLazy(inst._zod, "propValues", () => {
		const shape = def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
			}
		}
		return propValues;
	});
	const generateFastpass = (shape) => {
		const doc = new Doc([
			"shape",
			"payload",
			"ctx"
		]);
		const normalized = _normalized.value;
		const parseStr = (key) => {
			const k = esc(key);
			return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		};
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.keys) ids[key] = `key_${counter++}`;
		doc.write(`const newResult = {}`);
		for (const key of normalized.keys) if (normalized.optionalKeys.has(key)) {
			const id = ids[key];
			doc.write(`const ${id} = ${parseStr(key)};`);
			const k = esc(key);
			doc.write(`
        if (${id}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id}.value;
        }
        `);
		} else {
			const id = ids[key];
			doc.write(`const ${id} = ${parseStr(key)};`);
			doc.write(`
          if (${id}.issues.length) payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${esc(key)}, ...iss.path] : [${esc(key)}]
          })));`);
			doc.write(`newResult[${esc(key)}] = ${id}.value`);
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		const fn = doc.compile();
		return (payload, ctx) => fn(shape, payload, ctx);
	};
	let fastpass;
	const isObject$1 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
		} else {
			payload.value = {};
			const shape = value.shape;
			for (const key of value.keys) {
				const el = shape[key];
				const r = el._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
				if (r instanceof Promise) proms.push(r.then((r) => isOptional ? handleOptionalObjectResult(r, payload, key, input) : handleObjectResult(r, payload, key)));
				else if (isOptional) handleOptionalObjectResult(r, payload, key, input);
				else handleObjectResult(r, payload, key);
			}
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		const unrecognized = [];
		const keySet = value.keySet;
		const _catchall = catchall._zod;
		const t = _catchall.def.type;
		for (const key of Object.keys(input)) {
			if (keySet.has(key)) continue;
			if (t === "never") {
				unrecognized.push(key);
				continue;
			}
			const r = _catchall.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handleObjectResult(r, payload, key)));
			else handleObjectResult(r, payload, key);
		}
		if (unrecognized.length) payload.issues.push({
			code: "unrecognized_keys",
			keys: unrecognized,
			input,
			inst
		});
		if (!proms.length) return payload;
		return Promise.all(proms).then(() => {
			return payload;
		});
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "values", () => {
		if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazy(inst._zod, "pattern", () => {
		if (def.options.every((o) => o._zod.pattern)) {
			const patterns = def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	inst._zod.parse = (payload, ctx) => {
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	const _super = inst._zod.parse;
	defineLazy(inst._zod, "propValues", () => {
		const propValues = {};
		for (const option of def.options) {
			const pv = option._zod.propValues;
			if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
			for (const [k, v] of Object.entries(pv)) {
				if (!propValues[k]) propValues[k] = /* @__PURE__ */ new Set();
				for (const val of v) propValues[k].add(val);
			}
		}
		return propValues;
	});
	const disc = cached(() => {
		const opts = def.options;
		const map = /* @__PURE__ */ new Map();
		for (const o of opts) {
			const values = o._zod.propValues[def.discriminator];
			if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
			for (const v of values) {
				if (map.has(v)) throw new Error(`Duplicate discriminator value "${String(v)}"`);
				map.set(v, o);
			}
		}
		return map;
	});
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isObject(input)) {
			payload.issues.push({
				code: "invalid_type",
				expected: "object",
				input,
				inst
			});
			return payload;
		}
		const opt = disc.value.get(input?.[def.discriminator]);
		if (opt) return opt._zod.run(payload, ctx);
		if (def.unionFallback) return _super(payload, ctx);
		payload.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			input,
			path: [def.discriminator],
			inst
		});
		return payload;
	};
});
var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	if (left.issues.length) result.issues.push(...left.issues);
	if (right.issues.length) result.issues.push(...right.issues);
	if (aborted(result)) return result;
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	result.value = merged.data;
	return result;
}
var $ZodTuple = /*@__PURE__*/ $constructor("$ZodTuple", (inst, def) => {
	$ZodType.init(inst, def);
	const items = def.items;
	const optStart = items.length - [...items].reverse().findIndex((item) => item._zod.optin !== "optional");
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				input,
				inst,
				expected: "tuple",
				code: "invalid_type"
			});
			return payload;
		}
		payload.value = [];
		const proms = [];
		if (!def.rest) {
			const tooBig = input.length > items.length;
			const tooSmall = input.length < optStart - 1;
			if (tooBig || tooSmall) {
				payload.issues.push({
					input,
					inst,
					origin: "array",
					...tooBig ? {
						code: "too_big",
						maximum: items.length
					} : {
						code: "too_small",
						minimum: items.length
					}
				});
				return payload;
			}
		}
		let i = -1;
		for (const item of items) {
			i++;
			if (i >= input.length) {
				if (i >= optStart) continue;
			}
			const result = item._zod.run({
				value: input[i],
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleTupleResult(result, payload, i)));
			else handleTupleResult(result, payload, i);
		}
		if (def.rest) {
			const rest = input.slice(items.length);
			for (const el of rest) {
				i++;
				const result = def.rest._zod.run({
					value: el,
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => handleTupleResult(result, payload, i)));
				else handleTupleResult(result, payload, i);
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handleTupleResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		if (def.keyType._zod.values) {
			const values = def.keyType._zod.values;
			payload.value = {};
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[key] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[key] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!values.has(key)) {
				unrecognized = unrecognized ?? [];
				unrecognized.push(key);
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized
			});
		} else {
			payload.value = {};
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						origin: "record",
						code: "invalid_key",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					payload.value[keyResult.value] = keyResult.value;
					continue;
				}
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	inst._zod.values = new Set(values);
	inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (inst._zod.values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.values = new Set(def.values);
	inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? o.toString() : String(o)).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (inst._zod.values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		const _out = def.transform(payload.value, payload);
		if (_ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		return payload;
	};
});
var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.optout = "optional";
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
	});
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (def.innerType._zod.optin === "optional") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault always returns the default value immediately.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => {
		const v = def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => {
			payload.value = result.value;
			if (result.issues.length) {
				payload.value = def.catchValue({
					...payload,
					error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
					input: payload.value
				});
				payload.issues = [];
			}
			return payload;
		});
		payload.value = result.value;
		if (result.issues.length) {
			payload.value = def.catchValue({
				...payload,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			payload.issues = [];
		}
		return payload;
	};
});
var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => def.in._zod.values);
	defineLazy(inst._zod, "optin", () => def.in._zod.optin);
	defineLazy(inst._zod, "optout", () => def.out._zod.optout);
	inst._zod.parse = (payload, ctx) => {
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def, ctx));
		return handlePipeResult(left, def, ctx);
	};
});
function handlePipeResult(left, def, ctx) {
	if (aborted(left)) return left;
	return def.out._zod.run({
		value: left.value,
		issues: left.issues
	}, ctx);
}
var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	payload.value = Object.freeze(payload.value);
	return payload;
}
var $ZodLazy = /*@__PURE__*/ $constructor("$ZodLazy", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "innerType", () => def.getter());
	defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
	defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
	defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout);
	inst._zod.parse = (payload, ctx) => {
		return inst._zod.innerType._zod.run(payload, ctx);
	};
});
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region node_modules/zod/v4/core/registries.js
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new Map();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) {
			if (this._idmap.has(meta.id)) throw new Error(`ID ${meta.id} already exists in the registry`);
			this._idmap.set(meta.id, schema);
		}
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new Map();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			return {
				...pm,
				...this._map.get(schema)
			};
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
var globalRegistry = /*@__PURE__*/ registry();
//#endregion
//#region node_modules/zod/v4/core/api.js
function _string(Class, params) {
	return new Class({
		type: "string",
		...normalizeParams(params)
	});
}
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
function _number(Class, params) {
	return new Class({
		type: "number",
		checks: [],
		...normalizeParams(params)
	});
}
function _coercedNumber(Class, params) {
	return new Class({
		type: "number",
		coerce: true,
		checks: [],
		...normalizeParams(params)
	});
}
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
function _null$1(Class, params) {
	return new Class({
		type: "null",
		...normalizeParams(params)
	});
}
function _any(Class) {
	return new Class({ type: "any" });
}
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
function _normalize(form) {
	return _overwrite((input) => input.normalize(form));
}
function _trim() {
	return _overwrite((input) => input.trim());
}
function _toLowerCase() {
	return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
	return _overwrite((input) => input.toUpperCase());
}
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
function _custom(Class, fn, _params) {
	const norm = normalizeParams(_params);
	norm.abort ?? (norm.abort = true);
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...norm
	});
}
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
//#endregion
//#region node_modules/zod/v4/core/to-json-schema.js
var JSONSchemaGenerator = class {
	constructor(params) {
		this.counter = 0;
		this.metadataRegistry = params?.metadata ?? globalRegistry;
		this.target = params?.target ?? "draft-2020-12";
		this.unrepresentable = params?.unrepresentable ?? "throw";
		this.override = params?.override ?? (() => {});
		this.io = params?.io ?? "output";
		this.seen = /* @__PURE__ */ new Map();
	}
	process(schema, _params = {
		path: [],
		schemaPath: []
	}) {
		var _a;
		const def = schema._zod.def;
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const seen = this.seen.get(schema);
		if (seen) {
			seen.count++;
			if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
			return seen.schema;
		}
		const result = {
			schema: {},
			count: 1,
			cycle: void 0,
			path: _params.path
		};
		this.seen.set(schema, result);
		const overrideSchema = schema._zod.toJSONSchema?.();
		if (overrideSchema) result.schema = overrideSchema;
		else {
			const params = {
				..._params,
				schemaPath: [..._params.schemaPath, schema],
				path: _params.path
			};
			const parent = schema._zod.parent;
			if (parent) {
				result.ref = parent;
				this.process(parent, params);
				this.seen.get(parent).isParent = true;
			} else {
				const _json = result.schema;
				switch (def.type) {
					case "string": {
						const json = _json;
						json.type = "string";
						const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
						if (typeof minimum === "number") json.minLength = minimum;
						if (typeof maximum === "number") json.maxLength = maximum;
						if (format) {
							json.format = formatMap[format] ?? format;
							if (json.format === "") delete json.format;
						}
						if (contentEncoding) json.contentEncoding = contentEncoding;
						if (patterns && patterns.size > 0) {
							const regexes = [...patterns];
							if (regexes.length === 1) json.pattern = regexes[0].source;
							else if (regexes.length > 1) result.schema.allOf = [...regexes.map((regex) => ({
								...this.target === "draft-7" ? { type: "string" } : {},
								pattern: regex.source
							}))];
						}
						break;
					}
					case "number": {
						const json = _json;
						const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
						if (typeof format === "string" && format.includes("int")) json.type = "integer";
						else json.type = "number";
						if (typeof exclusiveMinimum === "number") json.exclusiveMinimum = exclusiveMinimum;
						if (typeof minimum === "number") {
							json.minimum = minimum;
							if (typeof exclusiveMinimum === "number") if (exclusiveMinimum >= minimum) delete json.minimum;
							else delete json.exclusiveMinimum;
						}
						if (typeof exclusiveMaximum === "number") json.exclusiveMaximum = exclusiveMaximum;
						if (typeof maximum === "number") {
							json.maximum = maximum;
							if (typeof exclusiveMaximum === "number") if (exclusiveMaximum <= maximum) delete json.maximum;
							else delete json.exclusiveMaximum;
						}
						if (typeof multipleOf === "number") json.multipleOf = multipleOf;
						break;
					}
					case "boolean": {
						const json = _json;
						json.type = "boolean";
						break;
					}
					case "bigint":
						if (this.unrepresentable === "throw") throw new Error("BigInt cannot be represented in JSON Schema");
						break;
					case "symbol":
						if (this.unrepresentable === "throw") throw new Error("Symbols cannot be represented in JSON Schema");
						break;
					case "null":
						_json.type = "null";
						break;
					case "any": break;
					case "unknown": break;
					case "undefined":
						if (this.unrepresentable === "throw") throw new Error("Undefined cannot be represented in JSON Schema");
						break;
					case "void":
						if (this.unrepresentable === "throw") throw new Error("Void cannot be represented in JSON Schema");
						break;
					case "never":
						_json.not = {};
						break;
					case "date":
						if (this.unrepresentable === "throw") throw new Error("Date cannot be represented in JSON Schema");
						break;
					case "array": {
						const json = _json;
						const { minimum, maximum } = schema._zod.bag;
						if (typeof minimum === "number") json.minItems = minimum;
						if (typeof maximum === "number") json.maxItems = maximum;
						json.type = "array";
						json.items = this.process(def.element, {
							...params,
							path: [...params.path, "items"]
						});
						break;
					}
					case "object": {
						const json = _json;
						json.type = "object";
						json.properties = {};
						const shape = def.shape;
						for (const key in shape) json.properties[key] = this.process(shape[key], {
							...params,
							path: [
								...params.path,
								"properties",
								key
							]
						});
						const allKeys = new Set(Object.keys(shape));
						const requiredKeys = new Set([...allKeys].filter((key) => {
							const v = def.shape[key]._zod;
							if (this.io === "input") return v.optin === void 0;
							else return v.optout === void 0;
						}));
						if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
						if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
						else if (!def.catchall) {
							if (this.io === "output") json.additionalProperties = false;
						} else if (def.catchall) json.additionalProperties = this.process(def.catchall, {
							...params,
							path: [...params.path, "additionalProperties"]
						});
						break;
					}
					case "union": {
						const json = _json;
						json.anyOf = def.options.map((x, i) => this.process(x, {
							...params,
							path: [
								...params.path,
								"anyOf",
								i
							]
						}));
						break;
					}
					case "intersection": {
						const json = _json;
						const a = this.process(def.left, {
							...params,
							path: [
								...params.path,
								"allOf",
								0
							]
						});
						const b = this.process(def.right, {
							...params,
							path: [
								...params.path,
								"allOf",
								1
							]
						});
						const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
						json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
						break;
					}
					case "tuple": {
						const json = _json;
						json.type = "array";
						const prefixItems = def.items.map((x, i) => this.process(x, {
							...params,
							path: [
								...params.path,
								"prefixItems",
								i
							]
						}));
						if (this.target === "draft-2020-12") json.prefixItems = prefixItems;
						else json.items = prefixItems;
						if (def.rest) {
							const rest = this.process(def.rest, {
								...params,
								path: [...params.path, "items"]
							});
							if (this.target === "draft-2020-12") json.items = rest;
							else json.additionalItems = rest;
						}
						if (def.rest) json.items = this.process(def.rest, {
							...params,
							path: [...params.path, "items"]
						});
						const { minimum, maximum } = schema._zod.bag;
						if (typeof minimum === "number") json.minItems = minimum;
						if (typeof maximum === "number") json.maxItems = maximum;
						break;
					}
					case "record": {
						const json = _json;
						json.type = "object";
						json.propertyNames = this.process(def.keyType, {
							...params,
							path: [...params.path, "propertyNames"]
						});
						json.additionalProperties = this.process(def.valueType, {
							...params,
							path: [...params.path, "additionalProperties"]
						});
						break;
					}
					case "map":
						if (this.unrepresentable === "throw") throw new Error("Map cannot be represented in JSON Schema");
						break;
					case "set":
						if (this.unrepresentable === "throw") throw new Error("Set cannot be represented in JSON Schema");
						break;
					case "enum": {
						const json = _json;
						const values = getEnumValues(def.entries);
						if (values.every((v) => typeof v === "number")) json.type = "number";
						if (values.every((v) => typeof v === "string")) json.type = "string";
						json.enum = values;
						break;
					}
					case "literal": {
						const json = _json;
						const vals = [];
						for (const val of def.values) if (val === void 0) {
							if (this.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
						} else if (typeof val === "bigint") if (this.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
						else vals.push(Number(val));
						else vals.push(val);
						if (vals.length === 0) {} else if (vals.length === 1) {
							const val = vals[0];
							json.type = val === null ? "null" : typeof val;
							json.const = val;
						} else {
							if (vals.every((v) => typeof v === "number")) json.type = "number";
							if (vals.every((v) => typeof v === "string")) json.type = "string";
							if (vals.every((v) => typeof v === "boolean")) json.type = "string";
							if (vals.every((v) => v === null)) json.type = "null";
							json.enum = vals;
						}
						break;
					}
					case "file": {
						const json = _json;
						const file = {
							type: "string",
							format: "binary",
							contentEncoding: "binary"
						};
						const { minimum, maximum, mime } = schema._zod.bag;
						if (minimum !== void 0) file.minLength = minimum;
						if (maximum !== void 0) file.maxLength = maximum;
						if (mime) if (mime.length === 1) {
							file.contentMediaType = mime[0];
							Object.assign(json, file);
						} else json.anyOf = mime.map((m) => {
							return {
								...file,
								contentMediaType: m
							};
						});
						else Object.assign(json, file);
						break;
					}
					case "transform":
						if (this.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
						break;
					case "nullable":
						_json.anyOf = [this.process(def.innerType, params), { type: "null" }];
						break;
					case "nonoptional":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						break;
					case "success": {
						const json = _json;
						json.type = "boolean";
						break;
					}
					case "default":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						_json.default = JSON.parse(JSON.stringify(def.defaultValue));
						break;
					case "prefault":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						if (this.io === "input") _json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
						break;
					case "catch": {
						this.process(def.innerType, params);
						result.ref = def.innerType;
						let catchValue;
						try {
							catchValue = def.catchValue(void 0);
						} catch {
							throw new Error("Dynamic catch values are not supported in JSON Schema");
						}
						_json.default = catchValue;
						break;
					}
					case "nan":
						if (this.unrepresentable === "throw") throw new Error("NaN cannot be represented in JSON Schema");
						break;
					case "template_literal": {
						const json = _json;
						const pattern = schema._zod.pattern;
						if (!pattern) throw new Error("Pattern not found in template literal");
						json.type = "string";
						json.pattern = pattern.source;
						break;
					}
					case "pipe": {
						const innerType = this.io === "input" ? def.in._zod.def.type === "transform" ? def.out : def.in : def.out;
						this.process(innerType, params);
						result.ref = innerType;
						break;
					}
					case "readonly":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						_json.readOnly = true;
						break;
					case "promise":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						break;
					case "optional":
						this.process(def.innerType, params);
						result.ref = def.innerType;
						break;
					case "lazy": {
						const innerType = schema._zod.innerType;
						this.process(innerType, params);
						result.ref = innerType;
						break;
					}
					case "custom": if (this.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
				}
			}
		}
		const meta = this.metadataRegistry.get(schema);
		if (meta) Object.assign(result.schema, meta);
		if (this.io === "input" && isTransforming(schema)) {
			delete result.schema.examples;
			delete result.schema.default;
		}
		if (this.io === "input" && result.schema._prefault) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
		delete result.schema._prefault;
		return this.seen.get(schema).schema;
	}
	emit(schema, _params) {
		const params = {
			cycles: _params?.cycles ?? "ref",
			reused: _params?.reused ?? "inline",
			external: _params?.external ?? void 0
		};
		const root = this.seen.get(schema);
		if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
		const makeURI = (entry) => {
			const defsSegment = this.target === "draft-2020-12" ? "$defs" : "definitions";
			if (params.external) {
				const externalId = params.external.registry.get(entry[0])?.id;
				const uriGenerator = params.external.uri ?? ((id) => id);
				if (externalId) return { ref: uriGenerator(externalId) };
				const id = entry[1].defId ?? entry[1].schema.id ?? `schema${this.counter++}`;
				entry[1].defId = id;
				return {
					defId: id,
					ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
				};
			}
			if (entry[1] === root) return { ref: "#" };
			const defUriPrefix = `#/${defsSegment}/`;
			const defId = entry[1].schema.id ?? `__schema${this.counter++}`;
			return {
				defId,
				ref: defUriPrefix + defId
			};
		};
		const extractToDef = (entry) => {
			if (entry[1].schema.$ref) return;
			const seen = entry[1];
			const { ref, defId } = makeURI(entry);
			seen.def = { ...seen.schema };
			if (defId) seen.defId = defId;
			const schema = seen.schema;
			for (const key in schema) delete schema[key];
			schema.$ref = ref;
		};
		if (params.cycles === "throw") for (const entry of this.seen.entries()) {
			const seen = entry[1];
			if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
		}
		for (const entry of this.seen.entries()) {
			const seen = entry[1];
			if (schema === entry[0]) {
				extractToDef(entry);
				continue;
			}
			if (params.external) {
				const ext = params.external.registry.get(entry[0])?.id;
				if (schema !== entry[0] && ext) {
					extractToDef(entry);
					continue;
				}
			}
			if (this.metadataRegistry.get(entry[0])?.id) {
				extractToDef(entry);
				continue;
			}
			if (seen.cycle) {
				extractToDef(entry);
				continue;
			}
			if (seen.count > 1) {
				if (params.reused === "ref") {
					extractToDef(entry);
					continue;
				}
			}
		}
		const flattenRef = (zodSchema, params) => {
			const seen = this.seen.get(zodSchema);
			const schema = seen.def ?? seen.schema;
			const _cached = { ...schema };
			if (seen.ref === null) return;
			const ref = seen.ref;
			seen.ref = null;
			if (ref) {
				flattenRef(ref, params);
				const refSchema = this.seen.get(ref).schema;
				if (refSchema.$ref && params.target === "draft-7") {
					schema.allOf = schema.allOf ?? [];
					schema.allOf.push(refSchema);
				} else {
					Object.assign(schema, refSchema);
					Object.assign(schema, _cached);
				}
			}
			if (!seen.isParent) this.override({
				zodSchema,
				jsonSchema: schema,
				path: seen.path ?? []
			});
		};
		for (const entry of [...this.seen.entries()].reverse()) flattenRef(entry[0], { target: this.target });
		const result = {};
		if (this.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
		else if (this.target === "draft-7") result.$schema = "http://json-schema.org/draft-07/schema#";
		else console.warn(`Invalid target: ${this.target}`);
		if (params.external?.uri) {
			const id = params.external.registry.get(schema)?.id;
			if (!id) throw new Error("Schema is missing an `id` property");
			result.$id = params.external.uri(id);
		}
		Object.assign(result, root.def);
		const defs = params.external?.defs ?? {};
		for (const entry of this.seen.entries()) {
			const seen = entry[1];
			if (seen.def && seen.defId) defs[seen.defId] = seen.def;
		}
		if (params.external) {} else if (Object.keys(defs).length > 0) if (this.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
		try {
			return JSON.parse(JSON.stringify(result));
		} catch (_err) {
			throw new Error("Error converting schema to JSON.");
		}
	}
};
function toJSONSchema(input, _params) {
	if (input instanceof $ZodRegistry) {
		const gen = new JSONSchemaGenerator(_params);
		const defs = {};
		for (const entry of input._idmap.entries()) {
			const [_, schema] = entry;
			gen.process(schema);
		}
		const schemas = {};
		const external = {
			registry: input,
			uri: _params?.uri,
			defs
		};
		for (const entry of input._idmap.entries()) {
			const [key, schema] = entry;
			schemas[key] = gen.emit(schema, {
				..._params,
				external
			});
		}
		if (Object.keys(defs).length > 0) schemas.__shared = { [gen.target === "draft-2020-12" ? "$defs" : "definitions"]: defs };
		return { schemas };
	}
	const gen = new JSONSchemaGenerator(_params);
	gen.process(input);
	return gen.emit(input, _params);
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	switch (def.type) {
		case "string":
		case "number":
		case "bigint":
		case "boolean":
		case "date":
		case "symbol":
		case "undefined":
		case "null":
		case "any":
		case "unknown":
		case "never":
		case "void":
		case "literal":
		case "enum":
		case "nan":
		case "file":
		case "template_literal": return false;
		case "array": return isTransforming(def.element, ctx);
		case "object":
			for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
			return false;
		case "union":
			for (const option of def.options) if (isTransforming(option, ctx)) return true;
			return false;
		case "intersection": return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
		case "tuple":
			for (const item of def.items) if (isTransforming(item, ctx)) return true;
			if (def.rest && isTransforming(def.rest, ctx)) return true;
			return false;
		case "record": return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
		case "map": return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
		case "set": return isTransforming(def.valueType, ctx);
		case "promise":
		case "optional":
		case "nonoptional":
		case "nullable":
		case "readonly": return isTransforming(def.innerType, ctx);
		case "lazy": return isTransforming(def.getter(), ctx);
		case "default": return isTransforming(def.innerType, ctx);
		case "prefault": return isTransforming(def.innerType, ctx);
		case "custom": return false;
		case "transform": return true;
		case "pipe": return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
		case "success": return false;
		case "catch": return false;
	}
	throw new Error(`Unknown schema type: ${def.type}`);
}
//#endregion
//#region node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function datetime(params) {
	return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function date(params) {
	return _isoDate(ZodISODate, params);
}
var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function time(params) {
	return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function duration(params) {
	return _isoDuration(ZodISODuration, params);
}
//#endregion
//#region node_modules/zod/v4/classic/errors.js
var initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	Object.defineProperties(inst, {
		format: { value: (mapper) => formatError(inst, mapper) },
		flatten: { value: (mapper) => flattenError(inst, mapper) },
		addIssue: { value: (issue) => inst.issues.push(issue) },
		addIssues: { value: (issues) => inst.issues.push(...issues) },
		isEmpty: { get() {
			return inst.issues.length === 0;
		} }
	});
};
$constructor("ZodError", initializer);
var ZodRealError = $constructor("ZodError", initializer, { Parent: Error });
//#endregion
//#region node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse$1(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
//#endregion
//#region node_modules/zod/v4/classic/schemas.js
var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	$ZodType.init(inst, def);
	inst.def = def;
	Object.defineProperty(inst, "_def", { value: def });
	inst.check = (...checks) => {
		return inst.clone({
			...def,
			checks: [...def.checks ?? [], ...checks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)]
		});
	};
	inst.clone = (def, params) => clone(inst, def, params);
	inst.brand = () => inst;
	inst.register = ((reg, meta) => {
		reg.add(inst, meta);
		return inst;
	});
	inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
	inst.safeParse = (data, params) => safeParse(inst, data, params);
	inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
	inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
	inst.spa = inst.safeParseAsync;
	inst.refine = (check, params) => inst.check(refine(check, params));
	inst.superRefine = (refinement) => inst.check(superRefine(refinement));
	inst.overwrite = (fn) => inst.check(_overwrite(fn));
	inst.optional = () => optional(inst);
	inst.nullable = () => nullable(inst);
	inst.nullish = () => optional(nullable(inst));
	inst.nonoptional = (params) => nonoptional(inst, params);
	inst.array = () => array(inst);
	inst.or = (arg) => union([inst, arg]);
	inst.and = (arg) => intersection(inst, arg);
	inst.transform = (tx) => pipe(inst, transform(tx));
	inst.default = (def) => _default(inst, def);
	inst.prefault = (def) => prefault(inst, def);
	inst.catch = (params) => _catch(inst, params);
	inst.pipe = (target) => pipe(inst, target);
	inst.readonly = () => readonly(inst);
	inst.describe = (description) => {
		const cl = inst.clone();
		globalRegistry.add(cl, { description });
		return cl;
	};
	Object.defineProperty(inst, "description", {
		get() {
			return globalRegistry.get(inst)?.description;
		},
		configurable: true
	});
	inst.meta = (...args) => {
		if (args.length === 0) return globalRegistry.get(inst);
		const cl = inst.clone();
		globalRegistry.add(cl, args[0]);
		return cl;
	};
	inst.isOptional = () => inst.safeParse(void 0).success;
	inst.isNullable = () => inst.safeParse(null).success;
	return inst;
});
/** @internal */
var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	const bag = inst._zod.bag;
	inst.format = bag.format ?? null;
	inst.minLength = bag.minimum ?? null;
	inst.maxLength = bag.maximum ?? null;
	inst.regex = (...args) => inst.check(_regex(...args));
	inst.includes = (...args) => inst.check(_includes(...args));
	inst.startsWith = (...args) => inst.check(_startsWith(...args));
	inst.endsWith = (...args) => inst.check(_endsWith(...args));
	inst.min = (...args) => inst.check(_minLength(...args));
	inst.max = (...args) => inst.check(_maxLength(...args));
	inst.length = (...args) => inst.check(_length(...args));
	inst.nonempty = (...args) => inst.check(_minLength(1, ...args));
	inst.lowercase = (params) => inst.check(_lowercase(params));
	inst.uppercase = (params) => inst.check(_uppercase(params));
	inst.trim = () => inst.check(_trim());
	inst.normalize = (...args) => inst.check(_normalize(...args));
	inst.toLowerCase = () => inst.check(_toLowerCase());
	inst.toUpperCase = () => inst.check(_toUpperCase());
});
var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
	inst.email = (params) => inst.check(_email(ZodEmail, params));
	inst.url = (params) => inst.check(_url(ZodURL, params));
	inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
	inst.emoji = (params) => inst.check(_emoji(ZodEmoji, params));
	inst.guid = (params) => inst.check(_guid(ZodGUID, params));
	inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
	inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
	inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
	inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
	inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
	inst.guid = (params) => inst.check(_guid(ZodGUID, params));
	inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
	inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
	inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
	inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
	inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
	inst.xid = (params) => inst.check(_xid(ZodXID, params));
	inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
	inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
	inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
	inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
	inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
	inst.e164 = (params) => inst.check(_e164(ZodE164, params));
	inst.datetime = (params) => inst.check(datetime(params));
	inst.date = (params) => inst.check(date(params));
	inst.time = (params) => inst.check(time(params));
	inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
	return _string(ZodString, params);
}
var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst.gt = (value, params) => inst.check(_gt(value, params));
	inst.gte = (value, params) => inst.check(_gte(value, params));
	inst.min = (value, params) => inst.check(_gte(value, params));
	inst.lt = (value, params) => inst.check(_lt(value, params));
	inst.lte = (value, params) => inst.check(_lte(value, params));
	inst.max = (value, params) => inst.check(_lte(value, params));
	inst.int = (params) => inst.check(int(params));
	inst.safe = (params) => inst.check(int(params));
	inst.positive = (params) => inst.check(_gt(0, params));
	inst.nonnegative = (params) => inst.check(_gte(0, params));
	inst.negative = (params) => inst.check(_lt(0, params));
	inst.nonpositive = (params) => inst.check(_lte(0, params));
	inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
	inst.step = (value, params) => inst.check(_multipleOf(value, params));
	inst.finite = () => inst;
	const bag = inst._zod.bag;
	inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
	inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
	inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
	inst.isFinite = true;
	inst.format = bag.format ?? null;
});
function number(params) {
	return _number(ZodNumber, params);
}
var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return _int(ZodNumberFormat, params);
}
var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
});
function boolean(params) {
	return _boolean(ZodBoolean, params);
}
var ZodNull = /*@__PURE__*/ $constructor("ZodNull", (inst, def) => {
	$ZodNull.init(inst, def);
	ZodType.init(inst, def);
});
function _null(params) {
	return _null$1(ZodNull, params);
}
var ZodAny = /*@__PURE__*/ $constructor("ZodAny", (inst, def) => {
	$ZodAny.init(inst, def);
	ZodType.init(inst, def);
});
function any() {
	return _any(ZodAny);
}
var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
});
function unknown() {
	return _unknown(ZodUnknown);
}
var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
});
function never(params) {
	return _never(ZodNever, params);
}
var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst.element = def.element;
	inst.min = (minLength, params) => inst.check(_minLength(minLength, params));
	inst.nonempty = (params) => inst.check(_minLength(1, params));
	inst.max = (maxLength, params) => inst.check(_maxLength(maxLength, params));
	inst.length = (len, params) => inst.check(_length(len, params));
	inst.unwrap = () => inst.element;
});
function array(element, params) {
	return _array(ZodArray, element, params);
}
var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	$ZodObject.init(inst, def);
	ZodType.init(inst, def);
	defineLazy(inst, "shape", () => def.shape);
	inst.keyof = () => _enum(Object.keys(inst._zod.def.shape));
	inst.catchall = (catchall) => inst.clone({
		...inst._zod.def,
		catchall
	});
	inst.passthrough = () => inst.clone({
		...inst._zod.def,
		catchall: unknown()
	});
	inst.loose = () => inst.clone({
		...inst._zod.def,
		catchall: unknown()
	});
	inst.strict = () => inst.clone({
		...inst._zod.def,
		catchall: never()
	});
	inst.strip = () => inst.clone({
		...inst._zod.def,
		catchall: void 0
	});
	inst.extend = (incoming) => {
		return extend(inst, incoming);
	};
	inst.merge = (other) => merge(inst, other);
	inst.pick = (mask) => pick(inst, mask);
	inst.omit = (mask) => omit(inst, mask);
	inst.partial = (...args) => partial(ZodOptional, inst, args[0]);
	inst.required = (...args) => required(ZodNonOptional, inst, args[0]);
});
function object(shape, params) {
	return new ZodObject({
		type: "object",
		get shape() {
			assignProp(this, "shape", { ...shape });
			return this.shape;
		},
		...normalizeParams(params)
	});
}
function strictObject(shape, params) {
	return new ZodObject({
		type: "object",
		get shape() {
			assignProp(this, "shape", { ...shape });
			return this.shape;
		},
		catchall: never(),
		...normalizeParams(params)
	});
}
function looseObject(shape, params) {
	return new ZodObject({
		type: "object",
		get shape() {
			assignProp(this, "shape", { ...shape });
			return this.shape;
		},
		catchall: unknown(),
		...normalizeParams(params)
	});
}
var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
	ZodUnion.init(inst, def);
	$ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
	return new ZodDiscriminatedUnion({
		type: "union",
		options,
		discriminator,
		...normalizeParams(params)
	});
}
var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
var ZodTuple = /*@__PURE__*/ $constructor("ZodTuple", (inst, def) => {
	$ZodTuple.init(inst, def);
	ZodType.init(inst, def);
	inst.rest = (rest) => inst.clone({
		...inst._zod.def,
		rest
	});
});
function tuple(items, _paramsOrRest, _params) {
	const hasRest = _paramsOrRest instanceof $ZodType;
	return new ZodTuple({
		type: "tuple",
		items,
		rest: hasRest ? _paramsOrRest : null,
		...normalizeParams(hasRest ? _params : _paramsOrRest)
	});
}
var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst.enum = def.entries;
	inst.options = Object.values(def.entries);
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	return new ZodEnum({
		type: "enum",
		entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
		...normalizeParams(params)
	});
}
var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = inst);
				_issue.continue ?? (_issue.continue = true);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			return payload;
		});
		payload.value = output;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : defaultValue;
		}
	});
}
var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : defaultValue;
		}
	});
}
var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
	});
}
var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
var ZodLazy = /*@__PURE__*/ $constructor("ZodLazy", (inst, def) => {
	$ZodLazy.init(inst, def);
	ZodType.init(inst, def);
	inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
	return new ZodLazy({
		type: "lazy",
		getter
	});
}
var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
});
function check(fn) {
	const ch = new $ZodCheck({ check: "custom" });
	ch._zod.check = fn;
	return ch;
}
function custom(fn, _params) {
	return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
	return _refine(ZodCustom, fn, _params);
}
function superRefine(fn) {
	const ch = check((payload) => {
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, ch._zod.def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	});
	return ch;
}
function _instanceof(cls, params = { error: `Input not instance of ${cls.name}` }) {
	const inst = new ZodCustom({
		type: "custom",
		check: "custom",
		fn: (data) => data instanceof cls,
		abort: true,
		...normalizeParams(params)
	});
	inst._zod.bag.Class = cls;
	return inst;
}
function json(params) {
	const jsonSchema = lazy(() => {
		return union([
			string(params),
			number(),
			boolean(),
			_null(),
			array(jsonSchema),
			record(string(), jsonSchema)
		]);
	});
	return jsonSchema;
}
//#endregion
//#region node_modules/eventsource-parser/dist/index.js
var ParseError = class extends Error {
	constructor(message, options) {
		super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
	}
};
var LF = 10;
var CR = 13;
var SPACE = 32;
function noop(_arg) {}
function createParser(config) {
	if (typeof config == "function") throw new TypeError("`config` must be an object, got a function instead. Did you mean `createParser({onEvent: fn})`?");
	const { onEvent = noop, onError = noop, onRetry = noop, onComment, maxBufferSize } = config, pendingFragments = [];
	let pendingFragmentsLength = 0, isFirstChunk = !0, id, data = "", dataLines = 0, eventType, terminated = !1;
	function feed(chunk) {
		if (terminated) throw new Error("Cannot feed parser: it was terminated after exceeding the configured max buffer size. Call `reset()` to resume parsing.");
		if (isFirstChunk && (isFirstChunk = !1, chunk.charCodeAt(0) === 239 && chunk.charCodeAt(1) === 187 && chunk.charCodeAt(2) === 191 && (chunk = chunk.slice(3))), pendingFragments.length === 0) {
			const trailing2 = processLines(chunk);
			trailing2 !== "" && (pendingFragments.push(trailing2), pendingFragmentsLength = trailing2.length), checkBufferSize();
			return;
		}
		if (chunk.indexOf(`
`) === -1 && chunk.indexOf("\r") === -1) {
			pendingFragments.push(chunk), pendingFragmentsLength += chunk.length, checkBufferSize();
			return;
		}
		pendingFragments.push(chunk);
		const input = pendingFragments.join("");
		pendingFragments.length = 0, pendingFragmentsLength = 0;
		const trailing = processLines(input);
		trailing !== "" && (pendingFragments.push(trailing), pendingFragmentsLength = trailing.length), checkBufferSize();
	}
	function checkBufferSize() {
		maxBufferSize !== void 0 && (pendingFragmentsLength + data.length <= maxBufferSize || (terminated = !0, pendingFragments.length = 0, pendingFragmentsLength = 0, id = void 0, data = "", dataLines = 0, eventType = void 0, onError(new ParseError(`Buffered data exceeded max buffer size of ${maxBufferSize} characters`, { type: "max-buffer-size-exceeded" }))));
	}
	function processLines(chunk) {
		let searchIndex = 0;
		if (chunk.indexOf("\r") === -1) {
			let lfIndex = chunk.indexOf(`
`, searchIndex);
			for (; lfIndex !== -1;) {
				if (searchIndex === lfIndex) {
					dataLines > 0 && onEvent({
						id,
						event: eventType,
						data
					}), id = void 0, data = "", dataLines = 0, eventType = void 0, searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
					continue;
				}
				const firstCharCode = chunk.charCodeAt(searchIndex);
				if (isDataPrefix(chunk, searchIndex, firstCharCode)) {
					const valueStart = chunk.charCodeAt(searchIndex + 5) === SPACE ? searchIndex + 6 : searchIndex + 5, value = chunk.slice(valueStart, lfIndex);
					if (dataLines === 0 && chunk.charCodeAt(lfIndex + 1) === LF) {
						onEvent({
							id,
							event: eventType,
							data: value
						}), id = void 0, data = "", eventType = void 0, searchIndex = lfIndex + 2, lfIndex = chunk.indexOf(`
`, searchIndex);
						continue;
					}
					data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
				} else isEventPrefix(chunk, searchIndex, firstCharCode) ? eventType = chunk.slice(chunk.charCodeAt(searchIndex + 6) === SPACE ? searchIndex + 7 : searchIndex + 6, lfIndex) || void 0 : parseLine(chunk, searchIndex, lfIndex);
				searchIndex = lfIndex + 1, lfIndex = chunk.indexOf(`
`, searchIndex);
			}
			return chunk.slice(searchIndex);
		}
		for (; searchIndex < chunk.length;) {
			const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
			let lineEnd = -1;
			if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = crIndex < lfIndex ? crIndex : lfIndex : crIndex !== -1 ? crIndex === chunk.length - 1 ? lineEnd = -1 : lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1) break;
			parseLine(chunk, searchIndex, lineEnd), searchIndex = lineEnd + 1, chunk.charCodeAt(searchIndex - 1) === CR && chunk.charCodeAt(searchIndex) === LF && searchIndex++;
		}
		return chunk.slice(searchIndex);
	}
	function parseLine(chunk, start, end) {
		if (start === end) {
			dispatchEvent();
			return;
		}
		const firstCharCode = chunk.charCodeAt(start);
		if (isDataPrefix(chunk, start, firstCharCode)) {
			const valueStart = chunk.charCodeAt(start + 5) === SPACE ? start + 6 : start + 5, value2 = chunk.slice(valueStart, end);
			data = dataLines === 0 ? value2 : `${data}
${value2}`, dataLines++;
			return;
		}
		if (isEventPrefix(chunk, start, firstCharCode)) {
			eventType = chunk.slice(chunk.charCodeAt(start + 6) === SPACE ? start + 7 : start + 6, end) || void 0;
			return;
		}
		if (firstCharCode === 105 && chunk.charCodeAt(start + 1) === 100 && chunk.charCodeAt(start + 2) === 58) {
			const value2 = chunk.slice(chunk.charCodeAt(start + 3) === SPACE ? start + 4 : start + 3, end);
			value2.includes("\0") || (id = value2);
			return;
		}
		if (firstCharCode === 58) {
			if (onComment) {
				const line2 = chunk.slice(start, end);
				onComment(line2.slice(chunk.charCodeAt(start + 1) === SPACE ? 2 : 1));
			}
			return;
		}
		const line = chunk.slice(start, end), fieldSeparatorIndex = line.indexOf(":");
		if (fieldSeparatorIndex === -1) {
			processField(line, "", line);
			return;
		}
		const field = line.slice(0, fieldSeparatorIndex), offset = line.charCodeAt(fieldSeparatorIndex + 1) === SPACE ? 2 : 1;
		processField(field, line.slice(fieldSeparatorIndex + offset), line);
	}
	function processField(field, value, line) {
		switch (field) {
			case "event":
				eventType = value || void 0;
				break;
			case "data":
				data = dataLines === 0 ? value : `${data}
${value}`, dataLines++;
				break;
			case "id":
				value.includes("\0") || (id = value);
				break;
			case "retry":
				/^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(new ParseError(`Invalid \`retry\` value: "${value}"`, {
					type: "invalid-retry",
					value,
					line
				}));
				break;
			default: onError(new ParseError(`Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`, {
				type: "unknown-field",
				field,
				value,
				line
			}));
		}
	}
	function dispatchEvent() {
		dataLines > 0 && onEvent({
			id,
			event: eventType,
			data
		}), id = void 0, data = "", dataLines = 0, eventType = void 0;
	}
	function reset(options = {}) {
		if (options.consume && pendingFragments.length > 0) {
			const incompleteLine = pendingFragments.join("");
			parseLine(incompleteLine, 0, incompleteLine.length);
		}
		isFirstChunk = !0, id = void 0, data = "", dataLines = 0, eventType = void 0, pendingFragments.length = 0, pendingFragmentsLength = 0, terminated = !1;
	}
	return {
		feed,
		reset
	};
}
function isDataPrefix(chunk, i, firstCharCode) {
	return firstCharCode === 100 && chunk.charCodeAt(i + 1) === 97 && chunk.charCodeAt(i + 2) === 116 && chunk.charCodeAt(i + 3) === 97 && chunk.charCodeAt(i + 4) === 58;
}
function isEventPrefix(chunk, i, firstCharCode) {
	return firstCharCode === 101 && chunk.charCodeAt(i + 1) === 118 && chunk.charCodeAt(i + 2) === 101 && chunk.charCodeAt(i + 3) === 110 && chunk.charCodeAt(i + 4) === 116 && chunk.charCodeAt(i + 5) === 58;
}
//#endregion
//#region node_modules/eventsource-parser/dist/stream.js
var EventSourceParserStream = class extends TransformStream {
	constructor({ onError, onRetry, onComment, maxBufferSize } = {}) {
		let parser;
		super({
			start(controller) {
				parser = createParser({
					onEvent: (event) => {
						controller.enqueue(event);
					},
					onError(error) {
						typeof onError == "function" && onError(error), (onError === "terminate" || error.type === "max-buffer-size-exceeded") && controller.error(error);
					},
					onRetry,
					onComment,
					maxBufferSize
				});
			},
			transform(chunk) {
				parser.feed(chunk);
			}
		});
	}
};
//#endregion
//#region node_modules/@workflow/serde/dist/index.js
/**
* Symbol used to define custom serialization for user-defined class instances.
* The static method should accept an instance and return serializable data.
*
* @example
* ```ts
* import { WORKFLOW_SERIALIZE, WORKFLOW_DESERIALIZE } from '@workflow/serde';
*
* class MyClass {
*   constructor(public value: string) {}
*
*   static [WORKFLOW_SERIALIZE](instance: MyClass) {
*     return { value: instance.value };
*   }
*
*   static [WORKFLOW_DESERIALIZE](data: { value: string }) {
*     return new MyClass(data.value);
*   }
* }
* ```
*/
var WORKFLOW_SERIALIZE = Symbol.for("workflow-serialize");
/**
* Symbol used to define custom deserialization for user-defined class instances.
* The static method should accept serialized data and return a class instance.
*
* @see WORKFLOW_SERIALIZE for usage example
*/
var WORKFLOW_DESERIALIZE = Symbol.for("workflow-deserialize");
//#endregion
//#region node_modules/@ai-sdk/provider-utils/dist/index.js
/**
* Normalizes a possibly undefined or non-array value into an array.
*/
function asArray(value) {
	return value === void 0 ? [] : Array.isArray(value) ? value : [value];
}
function combineHeaders(...headers) {
	return headers.reduce((combinedHeaders, currentHeaders) => ({
		...combinedHeaders,
		...currentHeaders
	}), {});
}
/**
* Removes entries from a record where the value is null or undefined.
* @param record - The input object whose entries may be null or undefined.
* @returns A new object containing only entries with non-null and non-undefined values.
*/
function removeUndefinedEntries(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value != null));
}
/**
* Creates a Promise that resolves after a specified delay
* @param delayInMs - The delay duration in milliseconds. If null or undefined, resolves immediately.
* @param signal - Optional AbortSignal to cancel the delay
* @returns A Promise that resolves after the specified delay
* @throws {DOMException} When the signal is aborted
*/
async function delay(delayInMs, options) {
	if (delayInMs == null) return;
	const signal = options?.abortSignal;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}
		const timeoutId = setTimeout(() => {
			cleanup();
			resolve();
		}, delayInMs);
		const cleanup = () => {
			clearTimeout(timeoutId);
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			reject(createAbortError());
		};
		signal?.addEventListener("abort", onAbort);
	});
}
function createAbortError() {
	return new DOMException("Delay was aborted", "AbortError");
}
function getWebSocketConstructor(webSocket) {
	const WebSocketConstructor = webSocket ?? globalThis.WebSocket;
	if (WebSocketConstructor == null) throw new Error("No WebSocket implementation available.");
	return WebSocketConstructor;
}
/**
* Converts an http(s) URL to the corresponding ws(s) URL.
*/
function toWebSocketUrl(url) {
	const wsUrl = new URL(url);
	if (wsUrl.protocol === "http:") wsUrl.protocol = "ws:";
	else if (wsUrl.protocol === "https:") wsUrl.protocol = "wss:";
	return wsUrl;
}
var textDecoder$1 = new TextDecoder();
/**
* Reads WebSocket message data as text, handling string, binary,
* and Blob payloads.
*/
async function readWebSocketMessageText(data) {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return textDecoder$1.decode(data);
	if (ArrayBuffer.isView(data)) return textDecoder$1.decode(data);
	if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
	return String(data);
}
var WEBSOCKET_OPEN_STATE = 1;
/**
* Waits until the socket's send buffer drains below `highWaterMark` bytes.
* No-op for implementations that do not expose `bufferedAmount`. There is no
* portable drain event, so this polls. Returns as soon as the socket is no
* longer open or the signal aborts — `bufferedAmount` never drains on a
* closed socket, so waiting on would poll forever.
*/
async function waitForWebSocketBufferDrain(socket, { highWaterMark = 1048576, pollIntervalMs = 20, abortSignal } = {}) {
	while (socket.readyState === WEBSOCKET_OPEN_STATE && (socket.bufferedAmount ?? 0) > highWaterMark) {
		if (abortSignal?.aborted === true) return;
		await delay(pollIntervalMs);
	}
}
/**
* Opens a WebSocket for a provider model, owning the transport-generic layer
* (analogous to `postToApi` for HTTP): constructor resolution, header hygiene,
* abort wiring, and message decoding. Callers own the URL, the auth channel
* (subprotocols vs headers), and the wire protocol.
*/
function connectToWebSocket({ url, protocols, headers, webSocket, abortSignal, onOpen, onMessageText, onProcessingError, onSocketError, onClose, onAbort }) {
	let socket;
	let abortListener;
	const close = (code) => {
		if (abortListener != null) {
			abortSignal?.removeEventListener("abort", abortListener);
			abortListener = void 0;
		}
		try {
			socket?.close(code);
		} catch {}
	};
	if (abortSignal?.aborted) {
		onAbort?.(abortSignal.reason ?? /* @__PURE__ */ new Error("Aborted"));
		return {
			socket: void 0,
			close
		};
	}
	try {
		socket = new (getWebSocketConstructor(webSocket))(url, protocols, { headers: removeUndefinedEntries(headers ?? {}) });
	} catch (error) {
		onProcessingError(error);
		return {
			socket: void 0,
			close
		};
	}
	if (abortSignal != null && onAbort != null) {
		abortListener = () => onAbort(abortSignal.reason ?? /* @__PURE__ */ new Error("Aborted"));
		abortSignal.addEventListener("abort", abortListener, { once: true });
	}
	const openedSocket = socket;
	socket.onopen = () => {
		try {
			onOpen?.(openedSocket);
		} catch (error) {
			onProcessingError(error);
		}
	};
	let tail = Promise.resolve();
	socket.onmessage = (event) => {
		tail = tail.then(() => readWebSocketMessageText(event.data)).then((text) => onMessageText(text)).catch(onProcessingError);
	};
	socket.onerror = () => {
		tail = tail.then(() => onSocketError?.()).catch(onProcessingError);
	};
	socket.onclose = (event) => {
		const closeEvent = event;
		const code = typeof closeEvent?.code === "number" ? closeEvent.code : void 0;
		const reason = typeof closeEvent?.reason === "string" ? closeEvent.reason : void 0;
		tail = tail.then(() => onClose?.({
			code,
			reason
		})).catch(onProcessingError);
	};
	return {
		socket,
		close
	};
}
/**
* Converts an AsyncIterator to a ReadableStream.
*
* @template T - The type of elements produced by the AsyncIterator.
* @param { <T>} iterator - The AsyncIterator to convert.
* @returns {ReadableStream<T>} - A ReadableStream that provides the same data as the AsyncIterator.
*/
function convertAsyncIteratorToReadableStream(iterator) {
	let cancelled = false;
	return new ReadableStream({
		/**
		* Called when the consumer wants to pull more data from the stream.
		*
		* @param {ReadableStreamDefaultController<T>} controller - The controller to enqueue data into the stream.
		* @returns {Promise<void>}
		*/
		async pull(controller) {
			if (cancelled) return;
			try {
				const { value, done } = await iterator.next();
				if (done) controller.close();
				else controller.enqueue(value);
			} catch (error) {
				controller.error(error);
			}
		},
		/**
		* Called when the consumer cancels the stream.
		*/
		async cancel(reason) {
			cancelled = true;
			if (iterator.return) try {
				await iterator.return(reason);
			} catch {}
		}
	});
}
var { btoa: btoa$1, atob: atob$1 } = globalThis;
function convertBase64ToUint8Array(base64String) {
	const latin1string = atob$1(base64String.replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(latin1string, (byte) => byte.codePointAt(0));
}
function convertUint8ArrayToBase64(array) {
	const chunks = [];
	const chunkSize = 4096;
	for (let i = 0; i < array.length; i += chunkSize) chunks.push(String.fromCodePoint(...array.subarray(i, i + chunkSize)));
	return btoa$1(chunks.join(""));
}
function convertToBase64(value) {
	return value instanceof Uint8Array ? convertUint8ArrayToBase64(value) : value;
}
/**
* Converts inline file data (a tagged `data` or `text` shape) into raw bytes.
*
* - `{ type: 'text', text }` → UTF-8 encoded bytes
* - `{ type: 'data', data: Uint8Array | Buffer }` → returned as-is
* - `{ type: 'data', data: ArrayBuffer }` → wrapped in a `Uint8Array`
* - `{ type: 'data', data: string }` → decoded as base64
*
* `{ type: 'stream' }` data is rejected: providers without streaming upload
* support funnel here and surface a clear `UnsupportedFunctionalityError`.
*/
function convertInlineFileDataToUint8Array(data) {
	if (data.type === "stream") {
		const error = new UnsupportedFunctionalityError({ functionality: "streaming file upload" });
		data.stream.cancel(error).catch(() => {});
		throw error;
	}
	if (data.type === "text") return new TextEncoder().encode(data.text);
	if (data.data instanceof Uint8Array) return data.data;
	if (data.data instanceof ArrayBuffer) return new Uint8Array(data.data);
	return convertBase64ToUint8Array(data.data);
}
/**
* Converts an input object to FormData for multipart/form-data requests.
*
* Handles the following cases:
* - `null` or `undefined` values are skipped
* - Arrays with a single element are appended as a single value
* - Arrays with multiple elements are appended with `[]` suffix (e.g., `image[]`)
*   unless `useArrayBrackets` is set to `false`
* - All other values are appended directly
*
* @param input - The input object to convert. Use a generic type for type validation.
* @param options - Optional configuration object.
* @param options.useArrayBrackets - Whether to add `[]` suffix for multi-element arrays.
*   Defaults to `true`. Set to `false` for APIs that expect repeated keys without brackets.
* @returns A FormData object containing the input values.
*
* @example
* ```ts
* type MyInput = {
*   model: string;
*   prompt: string;
*   images: Blob[];
* };
*
* const formData = convertToFormData<MyInput>({
*   model: 'gpt-image-1',
*   prompt: 'A cat',
*   images: [blob1, blob2],
* });
* ```
*/
function convertToFormData(input, options = {}) {
	const { useArrayBrackets = true } = options;
	const formData = new FormData();
	for (const [key, value] of Object.entries(input)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			if (value.length === 1) {
				formData.append(key, value[0]);
				continue;
			}
			const arrayKey = useArrayBrackets ? `${key}[]` : key;
			for (const item of value) formData.append(arrayKey, item);
			continue;
		}
		formData.append(key, value);
	}
	return formData;
}
/**
* Converts common provider response fields into language model response
* metadata.
*/
function createLanguageModelResponseMetadata({ id, model, created }) {
	return {
		id: id ?? void 0,
		modelId: model ?? void 0,
		timestamp: created != null ? /* @__PURE__ */ new Date(created * 1e3) : void 0
	};
}
/**
* Creates an empty language model usage result for unavailable usage data.
*/
function createNullLanguageModelUsage() {
	return {
		inputTokens: {
			total: void 0,
			noCache: void 0,
			cacheRead: void 0,
			cacheWrite: void 0
		},
		outputTokens: {
			total: void 0,
			text: void 0,
			reasoning: void 0
		},
		raw: void 0
	};
}
/**
* @param tools - Tools that were passed to the language model.
* @param providerToolNames - Maps the provider tool ids to the provider tool names.
*/
function createToolNameMapping({ tools = [], providerToolNames }) {
	const customToolNameToProviderToolName = {};
	const providerToolNameToCustomToolName = {};
	for (const tool of tools) if (tool.type === "provider" && tool.id in providerToolNames) {
		const providerToolName = providerToolNames[tool.id];
		customToolNameToProviderToolName[tool.name] = providerToolName;
		providerToolNameToCustomToolName[providerToolName] = tool.name;
	}
	return {
		toProviderToolName: (customToolName) => customToolNameToProviderToolName[customToolName] ?? customToolName,
		toCustomToolName: (providerToolName) => providerToolNameToCustomToolName[providerToolName] ?? providerToolName
	};
}
var marker$2$1 = Symbol.for("vercel.ai.providerStreamError");
/**
* Adds provider-owned status and retry metadata to a stream error payload
* without requiring provider packages to depend on AI SDK Core.
*/
function createProviderStreamError({ message, type, code, statusCode, isRetryable, data }) {
	const error = {
		message,
		type,
		code,
		statusCode,
		isRetryable,
		data
	};
	Object.defineProperty(error, marker$2$1, { value: true });
	return error;
}
function isProviderStreamError(error) {
	return typeof error === "object" && error != null && error[marker$2$1] === true;
}
/**
* Delayed promise. It is only constructed once the value is accessed.
* This is useful to avoid unhandled promise rejections when the promise is created
* but not accessed.
*/
var DelayedPromise = class {
	constructor() {
		this.status = { type: "pending" };
		this._resolve = void 0;
		this._reject = void 0;
	}
	get promise() {
		if (this._promise) return this._promise;
		this._promise = new Promise((resolve, reject) => {
			if (this.status.type === "resolved") resolve(this.status.value);
			else if (this.status.type === "rejected") reject(this.status.error);
			this._resolve = resolve;
			this._reject = reject;
		});
		return this._promise;
	}
	resolve(value) {
		this.status = {
			type: "resolved",
			value
		};
		if (this._promise) this._resolve?.(value);
	}
	reject(error) {
		this.status = {
			type: "rejected",
			error
		};
		if (this._promise) this._reject?.(error);
	}
	isResolved() {
		return this.status.type === "resolved";
	}
	isRejected() {
		return this.status.type === "rejected";
	}
	isPending() {
		return this.status.type === "pending";
	}
};
/**
* Extracts the headers from a response object and returns them as a key-value object.
*
* @param response - The response object to extract headers from.
* @returns The headers as a key-value object.
*/
function extractResponseHeaders(response) {
	return Object.fromEntries([...response.headers]);
}
function getRuntimeEnvironmentUserAgent(globalThisAny = globalThis) {
	if (globalThisAny.navigator?.userAgent) return globalThisAny.navigator.userAgent.toLowerCase();
	if (globalThisAny.process?.versions?.node) return `node.js/${globalThisAny.process.version}`;
	if (globalThisAny.EdgeRuntime) return "vercel-edge";
	return "";
}
function isAbortError(error) {
	return (error instanceof Error || typeof DOMException === "function" && error instanceof DOMException) && (error.name === "AbortError" || error.name === "ResponseAborted" || error.name === "TimeoutError");
}
var FETCH_FAILED_ERROR_MESSAGES = ["fetch failed", "failed to fetch"];
var RETRYABLE_NETWORK_ERROR_CODES = /* @__PURE__ */ new Set([
	"ConnectionRefused",
	"ConnectionClosed",
	"FailedToOpenSocket",
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"EPIPE",
	"UND_ERR_SOCKET",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_CONNECT_TIMEOUT"
]);
function findNetworkError(error) {
	const visited = /* @__PURE__ */ new Set();
	let current = error;
	while (current instanceof Error && !visited.has(current)) {
		visited.add(current);
		const errorWithCode = current;
		if (typeof errorWithCode.code === "string" && RETRYABLE_NETWORK_ERROR_CODES.has(errorWithCode.code)) return errorWithCode;
		current = current.cause;
	}
}
function handleFetchError({ error, url, requestBodyValues }) {
	if (isAbortError(error)) return error;
	if (error instanceof TypeError && FETCH_FAILED_ERROR_MESSAGES.includes(error.message.toLowerCase())) {
		const cause = error.cause;
		if (cause != null) return new APICallError({
			message: `Cannot connect to API: ${cause.message}`,
			cause,
			url,
			requestBodyValues,
			isRetryable: true
		});
	}
	const networkError = findNetworkError(error);
	if (networkError != null) {
		if (APICallError.isInstance(error)) return new APICallError({
			message: error.message,
			cause: error.cause,
			url: error.url,
			requestBodyValues: error.requestBodyValues,
			statusCode: error.statusCode,
			responseHeaders: error.responseHeaders,
			responseBody: error.responseBody,
			data: error.data,
			isRetryable: true
		});
		return new APICallError({
			message: `Cannot connect to API: ${error instanceof Error ? error.message : networkError.message}`,
			cause: error,
			url,
			requestBodyValues,
			isRetryable: true
		});
	}
	return error;
}
var VERSION$1 = "5.0.67";
/**
* Normalizes different header inputs into a plain record with lower-case keys.
* Entries with `undefined` or `null` values are removed.
*
* @param headers - Input headers (`Headers`, tuples array, plain record) to normalize.
* @returns A record containing the normalized header entries.
*/
function normalizeHeaders(headers) {
	if (headers == null) return {};
	const normalized = {};
	if (headers instanceof Headers) headers.forEach((value, key) => {
		normalized[key.toLowerCase()] = value;
	});
	else {
		if (!Array.isArray(headers)) headers = Object.entries(headers);
		for (const [key, value] of headers) if (value != null) normalized[key.toLowerCase()] = value;
	}
	return normalized;
}
/**
* Appends suffix parts to the `user-agent` header.
* If a `user-agent` header already exists, the suffix parts are appended to it.
* If no `user-agent` header exists, a new one is created with the suffix parts.
* Automatically removes undefined entries from the headers.
*
* @param headers - The original headers.
* @param userAgentSuffixParts - The parts to append to the `user-agent` header.
* @returns The new headers with the `user-agent` header set or updated.
*/
function withUserAgentSuffix(headers, ...userAgentSuffixParts) {
	const normalizedHeaders = new Headers(normalizeHeaders(headers));
	const currentUserAgentHeader = normalizedHeaders.get("user-agent") || "";
	normalizedHeaders.set("user-agent", [currentUserAgentHeader, ...userAgentSuffixParts].filter(Boolean).join(" "));
	return Object.fromEntries(normalizedHeaders.entries());
}
var getOriginalFetch$3 = () => globalThis.fetch;
/**
* Sends a DELETE request. For URLs built from developer-configured endpoints
* only — there is no untrusted-URL validation path (use `getFromApi` with
* `validateUrl` for response-supplied URLs).
*/
var deleteFromApi = async ({ url, headers = {}, failedResponseHandler, successfulResponseHandler, abortSignal, fetch = getOriginalFetch$3() }) => {
	try {
		const response = await fetch(url, {
			method: "DELETE",
			headers: withUserAgentSuffix(headers, `ai-sdk-provider-utils/${VERSION$1}`, getRuntimeEnvironmentUserAgent()),
			signal: abortSignal
		});
		const responseHeaders = extractResponseHeaders(response);
		if (!response.ok) {
			let errorInformation;
			try {
				errorInformation = await failedResponseHandler({
					response,
					url,
					requestBodyValues: {}
				});
			} catch (error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
				throw new APICallError({
					message: "Failed to process error response",
					cause: error,
					statusCode: response.status,
					url,
					responseHeaders,
					requestBodyValues: {}
				});
			}
			throw errorInformation.value;
		}
		try {
			return await successfulResponseHandler({
				response,
				url,
				requestBodyValues: {}
			});
		} catch (error) {
			if (error instanceof Error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
			}
			throw new APICallError({
				message: "Failed to process successful response",
				cause: error,
				statusCode: response.status,
				url,
				responseHeaders,
				requestBodyValues: {}
			});
		}
	} catch (error) {
		throw handleFetchError({
			error,
			url,
			requestBodyValues: {}
		});
	}
};
var imageMediaTypeSignatures = [
	{
		mediaType: "image/gif",
		bytesPrefix: [
			71,
			73,
			70,
			56,
			55,
			97
		]
	},
	{
		mediaType: "image/gif",
		bytesPrefix: [
			71,
			73,
			70,
			56,
			57,
			97
		]
	},
	{
		mediaType: "image/png",
		bytesPrefix: [
			137,
			80,
			78,
			71
		]
	},
	{
		mediaType: "image/jpeg",
		bytesPrefix: [255, 216]
	},
	{
		mediaType: "image/webp",
		bytesPrefix: [
			82,
			73,
			70,
			70,
			null,
			null,
			null,
			null,
			87,
			69,
			66,
			80
		]
	},
	{
		mediaType: "image/bmp",
		bytesPrefix: [
			66,
			77,
			null,
			null,
			null,
			null,
			0,
			0,
			0,
			0
		]
	},
	{
		mediaType: "image/tiff",
		bytesPrefix: [
			73,
			73,
			42,
			0
		]
	},
	{
		mediaType: "image/tiff",
		bytesPrefix: [
			77,
			77,
			0,
			42
		]
	},
	{
		mediaType: "image/avif",
		bytesPrefix: [
			0,
			0,
			0,
			null,
			102,
			116,
			121,
			112,
			97,
			118,
			105,
			102
		]
	},
	{
		mediaType: "image/heic",
		bytesPrefix: [
			0,
			0,
			0,
			null,
			102,
			116,
			121,
			112,
			104,
			101,
			105,
			99
		]
	}
];
var documentMediaTypeSignatures = [{
	mediaType: "application/pdf",
	bytesPrefix: [
		37,
		80,
		68,
		70
	]
}];
var audioMediaTypeSignaturesWithoutMp4 = [
	{
		mediaType: "audio/aac",
		bytesPrefix: [255, 240]
	},
	{
		mediaType: "audio/aac",
		bytesPrefix: [255, 241]
	},
	{
		mediaType: "audio/aac",
		bytesPrefix: [255, 248]
	},
	{
		mediaType: "audio/aac",
		bytesPrefix: [255, 249]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 251]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 250]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 243]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 242]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 227]
	},
	{
		mediaType: "audio/mpeg",
		bytesPrefix: [255, 226]
	},
	{
		mediaType: "audio/wav",
		bytesPrefix: [
			82,
			73,
			70,
			70,
			null,
			null,
			null,
			null,
			87,
			65,
			86,
			69
		]
	},
	{
		mediaType: "audio/ogg",
		bytesPrefix: [
			79,
			103,
			103,
			83
		]
	},
	{
		mediaType: "audio/flac",
		bytesPrefix: [
			102,
			76,
			97,
			67
		]
	},
	{
		mediaType: "audio/aac",
		bytesPrefix: [
			64,
			21,
			0,
			0
		]
	},
	{
		mediaType: "audio/webm",
		bytesPrefix: [
			26,
			69,
			223,
			163
		]
	}
];
var audioMediaTypeSignatures = [...audioMediaTypeSignaturesWithoutMp4, {
	mediaType: "audio/mp4",
	bytesPrefix: [
		0,
		0,
		0,
		null,
		102,
		116,
		121,
		112
	]
}];
var videoMediaTypeSignatures = [
	{
		mediaType: "video/mp4",
		bytesPrefix: [
			0,
			0,
			0,
			null,
			102,
			116,
			121,
			112
		]
	},
	{
		mediaType: "video/webm",
		bytesPrefix: [
			26,
			69,
			223,
			163
		]
	},
	{
		mediaType: "video/quicktime",
		bytesPrefix: [
			0,
			0,
			0,
			20,
			102,
			116,
			121,
			112,
			113,
			116
		]
	},
	{
		mediaType: "video/x-msvideo",
		bytesPrefix: [
			82,
			73,
			70,
			70
		]
	}
];
var DEFAULT_SNIFF_BYTES = 18;
var ID3_SCAN_BYTES = 131084;
function decodePrefix(data, maxBytes) {
	if (typeof data !== "string") return data.length > maxBytes ? data.subarray(0, maxBytes) : data;
	const maxChars = Math.ceil(maxBytes / 3) * 4;
	const bytes = convertBase64ToUint8Array(data.substring(0, Math.min(data.length, maxChars)));
	return bytes.length > maxBytes ? bytes.subarray(0, maxBytes) : bytes;
}
function hasID3(bytes) {
	return bytes.length > 10 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51;
}
var stripID3 = (bytes) => {
	const id3Size = (bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127;
	return bytes.subarray(id3Size + 10);
};
function detectMediaTypeBySignatures({ data, signatures }) {
	let bytes = decodePrefix(data, DEFAULT_SNIFF_BYTES);
	if (hasID3(bytes)) bytes = stripID3(decodePrefix(data, ID3_SCAN_BYTES));
	for (const signature of signatures) if (bytes.length >= signature.bytesPrefix.length && signature.bytesPrefix.every((byte, index) => byte === null || bytes[index] === byte)) return signature.mediaType;
}
var topLevelSignatureTables = {
	image: imageMediaTypeSignatures,
	audio: audioMediaTypeSignatures,
	video: videoMediaTypeSignatures,
	application: documentMediaTypeSignatures
};
/**
* Detect the IANA media type of a file from its raw bytes or base64 string.
*
* - When `topLevelType` is omitted, every known signature is considered
*   (image, audio, video, and application). Returns `undefined` when the
*   bytes do not match any known signature.
* - When `topLevelType` is provided, only signatures for that top-level
*   segment are considered. Returns `undefined` for unsupported segments
*   (e.g. `"text"`) or when no signature matches.
*/
function detectMediaType({ data, topLevelType }) {
	if (topLevelType === void 0) return detectMediaTypeBySignatures({
		data,
		signatures: [
			...imageMediaTypeSignatures,
			...documentMediaTypeSignatures,
			...audioMediaTypeSignaturesWithoutMp4,
			...videoMediaTypeSignatures
		]
	});
	const signatures = topLevelSignatureTables[topLevelType];
	if (signatures === void 0) return;
	return detectMediaTypeBySignatures({
		data,
		signatures
	});
}
/**
* Returns the top-level segment of a media type (the portion before `/`).
*
* Examples:
*   - `"image/png"` -> `"image"`
*   - `"image/*"` -> `"image"`
*   - `"image"` -> `"image"`
*   - `"image/"` -> `"image"`
*   - `""` -> `""`
*   - `"/"` -> `""`
*/
function getTopLevelMediaType(mediaType) {
	const slashIndex = mediaType.indexOf("/");
	return slashIndex === -1 ? mediaType : mediaType.substring(0, slashIndex);
}
/**
* Returns `true` only when the given media type has a non-empty, non-wildcard
* subtype (i.e. matches the form `type/subtype`, and `subtype` is not `*`).
*
* Examples:
*   - `"image/png"` -> `true`
*   - `"image/*"` -> `false`
*   - `"image"` -> `false`
*   - `"image/"` -> `false`
*   - `""` -> `false`
*   - `"/"` -> `false`
*/
function isFullMediaType(mediaType) {
	const slashIndex = mediaType.indexOf("/");
	if (slashIndex === -1) return false;
	const subtype = mediaType.substring(slashIndex + 1);
	return subtype.length > 0 && subtype !== "*";
}
/**
* Cancels a response body to release the underlying connection.
*
* When a fetch Response is rejected without consuming its body (e.g. a failed
* status code, an open-redirect rejection, or a Content-Length that exceeds the
* size limit), the underlying TCP socket is not returned to the connection pool
* and may stay open until the process runs out of file descriptors. Cancelling
* the body avoids this leak.
*
* Errors thrown while cancelling are ignored: the body may already be locked,
* disturbed, or absent, none of which should mask the original rejection.
*/
async function cancelResponseBody(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
var name$1$1 = "AI_DownloadError";
var marker$1$1 = `vercel.ai.error.${name$1$1}`;
var symbol$1$1 = Symbol.for(marker$1$1);
var DownloadError = class extends AISDKError {
	constructor({ url, statusCode, statusText, cause, message = cause == null ? `Failed to download ${url}: ${statusCode} ${statusText}` : `Failed to download ${url}: ${cause}` }) {
		super({
			name: name$1$1,
			message,
			cause
		});
		this[symbol$1$1] = true;
		this.url = url;
		this.statusCode = statusCode;
		this.statusText = statusText;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$1$1);
	}
};
/**
* Returns `true` when running in a browser.
*
* Detection keys on the presence of a global `window`, matching the browser
* check used elsewhere in this package (see `getRuntimeEnvironmentUserAgent`)
* so the SDK has a single, consistent definition of "browser". Server runtimes
* (Node.js, Deno, Bun, edge/workers) do not define `window`.
*/
function isBrowserRuntime(globalThisAny = globalThis) {
	return globalThisAny.window != null;
}
/**
* Returns true when `url` has the same origin (scheme + host + port) as
* `baseUrl`.
*
* Used to decide whether provider credentials may be attached to a request to a
* URL taken from a provider response (e.g. a polling or media-download URL).
* Credentials must only be sent to the provider's own origin; a response that
* names a foreign host (a CDN, or an attacker-controlled host if the response
* is tampered with) must not receive the API key.
*
* Returns false if either value is not a valid absolute URL (fail-closed).
*/
function isSameOrigin(url, baseUrl) {
	try {
		return new URL(url).origin === new URL(baseUrl).origin;
	} catch {
		return false;
	}
}
/**
* Validates that a URL is safe to download from, blocking private/internal addresses
* to prevent SSRF attacks.
*
* Note: this function performs string/literal-IP checks only. The Node.js
* download fetch additionally validates and pins DNS results at connect time.
*
* @param url - The URL string to validate.
* @throws DownloadError if the URL is unsafe.
*/
function validateDownloadUrl(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new DownloadError({
			url,
			message: `Invalid URL: ${url}`
		});
	}
	if (parsed.protocol === "data:") return;
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new DownloadError({
		url,
		message: `URL scheme must be http, https, or data, got ${parsed.protocol}`
	});
	const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, "");
	if (!hostname) throw new DownloadError({
		url,
		message: `URL must have a hostname`
	});
	if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) throw new DownloadError({
		url,
		message: `URL with hostname ${hostname} is not allowed`
	});
	if (hostname.startsWith("[") && hostname.endsWith("]")) {
		if (isPrivateIPv6(hostname.slice(1, -1))) throw new DownloadError({
			url,
			message: `URL with IPv6 address ${hostname} is not allowed`
		});
		return;
	}
	if (isIPv4(hostname)) {
		if (isPrivateIPv4(hostname)) throw new DownloadError({
			url,
			message: `URL with IP address ${hostname} is not allowed`
		});
	}
}
/**
* Validates an address returned by DNS before it is used to open a socket.
* This is intentionally not exported from the package entry point.
*/
function validateDownloadAddress({ address, family, hostname }) {
	if (family === 4 ? !isIPv4(address) || isPrivateIPv4(address) : family === 6 ? isPrivateIPv6(address) : true) throw new DownloadError({
		url: hostname,
		message: `Hostname ${hostname} resolved to disallowed IP address ${address}`
	});
}
function isIPv4(hostname) {
	const parts = hostname.split(".");
	if (parts.length !== 4) return false;
	return parts.every((part) => {
		const num = Number(part);
		return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === part;
	});
}
function isPrivateIPv4(ip) {
	const [a, b, c] = ip.split(".").map(Number);
	if (a === 0) return true;
	if (a === 10) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	if (a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 0 && c === 0) return true;
	if (a === 192 && b === 0 && c === 2) return true;
	if (a === 192 && b === 168) return true;
	if (a === 198 && (b === 18 || b === 19)) return true;
	if (a === 198 && b === 51 && c === 100) return true;
	if (a === 203 && b === 0 && c === 113) return true;
	if (a >= 224) return true;
	return false;
}
/**
* Expands an IPv6 address string into its 8 16-bit groups, handling `::`
* compression and an optional dotted-decimal IPv4 tail (e.g. `::ffff:127.0.0.1`).
*
* @returns the 8 groups, or null if the input is not a parseable IPv6 address.
*/
function parseIPv6(ip) {
	let address = ip.toLowerCase();
	const zoneIndex = address.indexOf("%");
	if (zoneIndex !== -1) address = address.slice(0, zoneIndex);
	const halves = address.split("::");
	if (halves.length > 2) return null;
	const toGroups = (segment) => {
		if (segment === "") return [];
		const groups = [];
		const parts = segment.split(":");
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part.includes(".")) {
				if (i !== parts.length - 1 || !isIPv4(part)) return null;
				const [a, b, c, d] = part.split(".").map(Number);
				groups.push(a << 8 | b, c << 8 | d);
				continue;
			}
			if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
			groups.push(parseInt(part, 16));
		}
		return groups;
	};
	const head = toGroups(halves[0]);
	if (head === null) return null;
	if (halves.length === 2) {
		const tail = toGroups(halves[1]);
		if (tail === null) return null;
		const fill = 8 - head.length - tail.length;
		if (fill < 0) return null;
		return [
			...head,
			...new Array(fill).fill(0),
			...tail
		];
	}
	return head.length === 8 ? head : null;
}
function isPrivateIPv6(ip) {
	const groups = parseIPv6(ip);
	if (groups === null) return true;
	const topZero = (count) => groups.slice(0, count).every((group) => group === 0);
	if (topZero(7) && (groups[7] === 0 || groups[7] === 1)) return true;
	if ((groups[0] & 65024) === 64512) return true;
	if ((groups[0] & 65472) === 65152) return true;
	if ((groups[0] & 65472) === 65216) return true;
	if ((groups[0] & 65280) === 65280) return true;
	if (groups[0] === 8193 && groups[1] === 3512) return true;
	if (groups[0] === 16383 && (groups[1] & 61440) === 0) return true;
	if (topZero(6) || topZero(5) && groups[5] === 65535 || topZero(4) && groups[4] === 65535 && groups[5] === 0 || groups[0] === 100 && groups[1] === 65435 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0 || groups[0] === 100 && groups[1] === 65435 && groups[2] === 1) return isPrivateIPv4(`${groups[6] >> 8 & 255}.${groups[6] & 255}.${groups[7] >> 8 & 255}.${groups[7] & 255}`);
	return false;
}
/**
* Creates a DNS lookup hook that validates every returned address before
* returning the callback shape requested by the HTTP connector. Because
* resolution and validation happen inside the connector, the socket is pinned
* to the validated result and DNS rebinding cannot introduce a second lookup.
*/
function createSafeLookup(lookup) {
	return ((hostname, options, callback) => {
		lookup(hostname, {
			...options,
			all: true
		}, (error, addresses) => {
			if (error) {
				callback(error);
				return;
			}
			try {
				const [firstAddress] = addresses;
				if (firstAddress == null) throw new Error(`Hostname ${hostname} did not resolve to an address`);
				for (const { address, family } of addresses) validateDownloadAddress({
					address,
					family,
					hostname
				});
				if (options.all === true) callback(null, addresses);
				else callback(null, firstAddress.address, firstAddress.family);
			} catch (error) {
				callback(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});
}
var safeNodeFetchPromise;
function isNodeRuntime() {
	const runtimeProcess = globalThis.process;
	return runtimeProcess?.release?.name === "node" && runtimeProcess.versions?.bun == null && runtimeProcess.versions?.deno == null && runtimeProcess.title !== "workerd" && globalThis.EdgeRuntime == null;
}
async function getDefaultDownloadFetch() {
	if (!isNodeRuntime()) return globalThis.fetch;
	return safeNodeFetchPromise ??= Promise.resolve().then(createSafeNodeFetch);
}
function createSafeNodeFetch() {
	const module = loadBuiltinModule("node:module");
	const { lookup } = loadBuiltinModule("node:dns");
	const { Agent, fetch } = module.createRequire(getCurrentModulePath())("undici");
	const dispatcher = new Agent({ connect: { lookup: createSafeLookup(lookup) } });
	return ((input, init) => fetch(input, {
		...init,
		dispatcher
	}));
}
function loadBuiltinModule(id) {
	const builtinModule = globalThis.process?.getBuiltinModule?.(id);
	if (builtinModule == null) throw new Error(`Node.js built-in module ${id} is unavailable`);
	return builtinModule;
}
function getCurrentModulePath() {
	const originalPrepareStackTrace = Error.prepareStackTrace;
	try {
		Error.prepareStackTrace = (_error, callSites) => callSites;
		const error = /* @__PURE__ */ new Error("Capture current module path");
		Error.captureStackTrace(error, getCurrentModulePath);
		const [caller] = error.stack;
		const fileName = caller?.getFileName();
		if (fileName == null) throw new Error("Unable to determine the current module path");
		return fileName;
	} finally {
		Error.prepareStackTrace = originalPrepareStackTrace;
	}
}
/**
* Request headers stripped before fetching an untrusted URL: host/virtual-host
* routing, proxy/origin spoofing, cloud-metadata, cookies, and hop-by-hop
* transport headers (RFC 7230 §6.1).
*
* `Authorization` and other credential-bearing caller headers (e.g. `x-key`)
* are intentionally not listed because trusted provider requests may need
* them. `fetchUntrustedUrl` separately restricts an untrusted first hop to an
* explicit allowlist of non-credential request metadata. Both it and
* `fetchWithValidatedRedirects` drop all caller headers except the user-agent
* on a cross-origin redirect.
*/
var BLOCKED_REQUEST_HEADERS = [
	"connection",
	"keep-alive",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"forwarded",
	"proxy-authorization",
	"via",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-proto",
	"x-real-ip",
	"metadata",
	"metadata-flavor",
	"x-aws-ec2-metadata-token",
	"x-metadata-token",
	"cookie",
	"set-cookie"
];
/**
* Returns a fresh `Headers` built from `input` with {@link BLOCKED_REQUEST_HEADERS}
* removed. The input is never mutated.
*/
function sanitizeRequestHeaders(input) {
	const headers = new Headers(input);
	for (const name of BLOCKED_REQUEST_HEADERS) headers.delete(name);
	return headers;
}
var MAX_DOWNLOAD_REDIRECTS = 10;
var REDIRECT_STATUS_CODES = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
async function getValidatedFetch(customFetch) {
	return customFetch == null || customFetch === globalThis.fetch ? await getDefaultDownloadFetch() : customFetch;
}
/**
* Fetches a URL while enforcing the download guard on every hop.
*
* Redirects are followed manually (`redirect: 'manual'`) so each hop is
* validated with {@link validateDownloadUrl} *before* it is requested. Relying
* on the default `redirect: 'follow'` would issue the request to a redirect
* target (e.g. an internal address) before we ever see its URL, defeating the
* guard.
*
* Request headers are also protected: {@link sanitizeRequestHeaders} strips
* proxy/metadata/cookie/hop-by-hop headers before the first request, and all
* caller headers except `User-Agent` are dropped on a cross-origin redirect.
* Credentials and custom headers are preserved on the first hop for backwards
* compatibility. The caller must ensure that the initial URL may receive them.
* Use `fetchUntrustedUrl` for URLs that require first-hop credential isolation.
* The fetch spec only strips `Authorization` on cross-origin redirects because
* in a browser, CORS preflighting protects custom headers; there is no CORS on
* the server, so provider API keys carried in custom headers (e.g. `x-key`)
* must be dropped here as well.
*
* A `redirect: 'manual'` request yields an unreadable opaque response in the
* browser (and in other spec-compliant fetch implementations), so the redirect
* target cannot be validated here. In a real browser this is safe to follow
* natively because reaching an internal network is not possible (fetch is
* constrained by CORS and cannot reach a server's internal network or
* cloud-metadata). On any other runtime we cannot validate the hop, so we fail
* closed rather than follow it blindly and bypass the guard.
*
* A hop that is same-origin with `trustedOrigin` (the developer-configured
* provider endpoint) skips target validation: that origin is exactly what an
* unvalidated, config-derived request would fetch anyway, and validating it
* would break legitimate self-hosted / localhost deployments whose response
* URLs point back at the configured host. Hops on any other origin are always
* validated.
*
* The returned response is the final (non-redirect) response. The caller is
* responsible for checking `response.ok` and reading the body.
*
* On Node.js, the default fetch resolves every hostname through a validating
* lookup hook and passes those exact addresses to the connector, preventing
* hostname-to-private-IP and DNS-rebinding bypasses. An injected fetch is
* responsible for equivalent connect-time validation. Other runtimes should
* constrain egress at the network layer when handling untrusted URLs.
*
* @throws DownloadError if a hop is unsafe, the redirect limit is exceeded, or
* a redirect cannot be validated on a non-browser runtime.
*/
async function fetchWithValidatedRedirects({ url, headers, abortSignal, maxRedirects = MAX_DOWNLOAD_REDIRECTS, fetch: customFetch, trustedOrigin }) {
	let currentHeaders = headers === void 0 ? void 0 : sanitizeRequestHeaders(headers);
	const perHopInit = (redirect) => {
		const init = {
			signal: abortSignal,
			redirect
		};
		if (currentHeaders !== void 0) init.headers = new Headers(currentHeaders);
		return init;
	};
	let currentUrl = url;
	for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
		const isTrustedHop = trustedOrigin !== void 0 && isSameOrigin(currentUrl, trustedOrigin);
		if (!isTrustedHop) validateDownloadUrl(currentUrl);
		const fetch = isTrustedHop && customFetch != null ? customFetch : isTrustedHop ? globalThis.fetch : await getValidatedFetch(customFetch);
		const response = await fetch(currentUrl, perHopInit("manual"));
		if (response.type === "opaqueredirect") {
			if (!isBrowserRuntime()) throw new DownloadError({
				url,
				message: `Redirect from ${currentUrl} could not be validated and was blocked`
			});
			return await fetch(currentUrl, perHopInit("follow"));
		}
		const location = response.headers?.get("location");
		if (REDIRECT_STATUS_CODES.has(response.status) && location) {
			cancelResponseBody(response);
			const nextUrl = new URL(location, currentUrl).toString();
			if (currentHeaders !== void 0 && !isSameOrigin(nextUrl, currentUrl)) {
				const userAgent = currentHeaders.get("user-agent");
				currentHeaders = new Headers(userAgent == null ? void 0 : { "user-agent": userAgent });
			}
			currentUrl = nextUrl;
			continue;
		}
		return response;
	}
	throw new DownloadError({
		url,
		message: `Too many redirects (max ${maxRedirects})`
	});
}
var SAFE_UNTRUSTED_FIRST_HOP_HEADERS = /* @__PURE__ */ new Set([
	"accept",
	"accept-language",
	"baggage",
	"cache-control",
	"idempotency-key",
	"if-match",
	"if-modified-since",
	"if-none-match",
	"if-range",
	"if-unmodified-since",
	"pragma",
	"range",
	"traceparent",
	"tracestate",
	"user-agent",
	"x-correlation-id",
	"x-request-id"
]);
/**
* Fetches an untrusted URL with first-hop credential isolation and validated
* redirects. Uses the URL validation, DNS-pinned Node.js transport, redirect
* limits, and cross-origin header stripping of {@link fetchWithValidatedRedirects}.
* An injected fetch must provide equivalent connect-time DNS validation.
*
* Without a matching `credentialedOrigin` (or `trustedOrigin` when it is
* omitted), only allowlisted request metadata is sent on the first hop.
* Arbitrary caller headers require an explicit matching origin because vendor
* credential names cannot be inferred safely. Proxy, metadata, cookie, and
* hop-by-hop headers are sanitized even for a matching origin.
*
* `trustedOrigin` also exempts same-origin hops from URL validation, allowing
* developer-configured private endpoints. Both origin options must come from
* developer configuration, never from untrusted response data.
*
* This is an opt-in alternative to `fetchWithValidatedRedirects`, whose
* existing first-hop header behavior is preserved for compatibility.
*/
async function fetchUntrustedUrl({ headers, credentialedOrigin, untrustedFirstHopHeaders, ...options }) {
	let firstHopHeaders;
	if (headers !== void 0) {
		firstHopHeaders = sanitizeRequestHeaders(headers);
		const origin = credentialedOrigin ?? options.trustedOrigin;
		if (origin === void 0 || !isSameOrigin(options.url, origin)) {
			const allowedHeaders = /* @__PURE__ */ new Set([...SAFE_UNTRUSTED_FIRST_HOP_HEADERS, ...(untrustedFirstHopHeaders ?? []).map((name) => name.toLowerCase())]);
			firstHopHeaders = new Headers([...firstHopHeaders].filter(([name]) => allowedHeaders.has(name)));
		}
	}
	return fetchWithValidatedRedirects({
		...options,
		headers: firstHopHeaders
	});
}
/**
* Default maximum download size: 2 GiB.
*
* `fetch().arrayBuffer()` has ~2x peak memory overhead (undici buffers the
* body internally, then creates the JS ArrayBuffer), so very large downloads
* risk exceeding the default V8 heap limit on 64-bit systems and terminating
* the process with an out-of-memory error.
*
* Setting this limit converts an unrecoverable OOM crash into a catchable
* `DownloadError`.
*/
var DEFAULT_MAX_DOWNLOAD_SIZE = 2147483648;
/**
* Reads a fetch Response body with a size limit to prevent memory exhaustion.
*
* Checks the Content-Length header for early rejection, then reads the body
* incrementally via ReadableStream and aborts with a DownloadError when the
* limit is exceeded.
*
* @param response - The fetch Response to read.
* @param url - The URL being downloaded (used in error messages).
* @param maxBytes - Maximum allowed bytes. Defaults to DEFAULT_MAX_DOWNLOAD_SIZE.
* @returns A Uint8Array containing the response body.
* @throws DownloadError if the response exceeds maxBytes.
*/
async function readResponseWithSizeLimit({ response, url, maxBytes = DEFAULT_MAX_DOWNLOAD_SIZE }) {
	const contentLength = response.headers.get("content-length");
	if (contentLength != null) {
		const length = parseInt(contentLength, 10);
		if (!isNaN(length) && length > maxBytes) {
			await cancelResponseBody(response);
			throw new DownloadError({
				url,
				message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`
			});
		}
	}
	const body = response.body;
	if (body == null) return /* @__PURE__ */ new Uint8Array(0);
	const reader = body.getReader();
	const chunks = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.length;
			if (totalBytes > maxBytes) throw new DownloadError({
				url,
				message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`
			});
			chunks.push(value.byteLength < value.buffer.byteLength ? new Uint8Array(value) : value);
		}
	} finally {
		try {
			await reader.cancel();
		} catch {} finally {
			reader.releaseLock();
		}
	}
	const result = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}
/**
* Download a file from a URL and return it as a Blob.
*
* @param url - The URL to download from.
* @param options - Optional settings for the download.
* @param options.maxBytes - Maximum allowed download size in bytes. Defaults to 100 MiB.
* @param options.abortSignal - An optional abort signal to cancel the download.
* @returns A Promise that resolves to the downloaded Blob.
*
* @throws DownloadError if the download fails or exceeds maxBytes.
*/
async function downloadBlob(url, options) {
	try {
		const response = await fetchUntrustedUrl({
			url,
			abortSignal: options?.abortSignal
		});
		if (!response.ok) {
			await cancelResponseBody(response);
			throw new DownloadError({
				url,
				statusCode: response.status,
				statusText: response.statusText
			});
		}
		const data = await readResponseWithSizeLimit({
			response,
			url,
			maxBytes: options?.maxBytes ?? 2147483648
		});
		const contentType = response.headers.get("content-type") ?? void 0;
		return new Blob([data], contentType ? { type: contentType } : void 0);
	} catch (error) {
		if (DownloadError.isInstance(error)) throw error;
		throw new DownloadError({
			url,
			cause: error
		});
	}
}
/**
* Symbol for exposing the UTF-8 input byte budget of an embedding model.
*
* This capability is experimental and intentionally lives outside the versioned
* embedding model specification.
*/
var EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL = Symbol.for("vercel.ai.embeddingModel.maxInputBytesPerCall");
/**
* Encodes a raw identifier as one URL path segment, including standalone dot
* segments that URL parsers would otherwise normalize. Pass unencoded values;
* for resource paths with intentional slashes, encode each segment separately.
*/
function encodePathSegment(value) {
	const encodedValue = encodeURIComponent(value);
	return encodedValue === "." ? "%252E" : encodedValue === ".." ? "%252E%252E" : encodedValue;
}
/**
* Filters `null` and `undefined` values out of a list of values.
*
* @param values - The values to filter.
* @returns A new array containing only non-nullish values.
*/
function filterNullable(...values) {
	return values.filter((value) => value != null);
}
/**
* Creates an ID generator.
* The total length of the ID is the sum of the prefix, separator, and random part length.
* Not cryptographically secure.
*
* @param alphabet - The alphabet to use for the ID. Default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
* @param prefix - The prefix of the ID to generate. Optional.
* @param separator - The separator between the prefix and the random part of the ID. Default: '-'.
* @param size - The size of the random part of the ID to generate. Default: 16.
*/
var createIdGenerator = ({ prefix, size = 16, alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", separator = "-" } = {}) => {
	const generator = () => {
		const alphabetLength = alphabet.length;
		const chars = new Array(size);
		for (let i = 0; i < size; i++) chars[i] = alphabet[Math.random() * alphabetLength | 0];
		return chars.join("");
	};
	if (prefix == null) return generator;
	if (alphabet.includes(separator)) throw new InvalidArgumentError({
		argument: "separator",
		message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
	});
	return () => `${prefix}${separator}${generator()}`;
};
/**
* Generates a 16-character random string to use for IDs.
* Not cryptographically secure.
*/
var generateId = createIdGenerator();
var getOriginalFetch$2 = () => globalThis.fetch;
var getFromApi = async ({ url, headers = {}, successfulResponseHandler, failedResponseHandler, abortSignal, fetch, validateUrl, credentialedOrigin, trustedOrigin }) => {
	try {
		const requestFetch = fetch ?? getOriginalFetch$2();
		const requestHeaders = withUserAgentSuffix(credentialedOrigin !== void 0 && !isSameOrigin(url, credentialedOrigin) ? {} : headers, `ai-sdk-provider-utils/${VERSION$1}`, getRuntimeEnvironmentUserAgent());
		const response = validateUrl ? await fetchWithValidatedRedirects({
			url,
			headers: requestHeaders,
			abortSignal,
			fetch,
			trustedOrigin
		}) : await requestFetch(url, {
			method: "GET",
			headers: requestHeaders,
			signal: abortSignal
		});
		const responseHeaders = extractResponseHeaders(response);
		if (!response.ok) {
			let errorInformation;
			try {
				errorInformation = await failedResponseHandler({
					response,
					url,
					requestBodyValues: {}
				});
			} catch (error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
				throw new APICallError({
					message: "Failed to process error response",
					cause: error,
					statusCode: response.status,
					url,
					responseHeaders,
					requestBodyValues: {}
				});
			}
			throw errorInformation.value;
		}
		try {
			return await successfulResponseHandler({
				response,
				url,
				requestBodyValues: {}
			});
		} catch (error) {
			if (error instanceof Error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
			}
			throw new APICallError({
				message: "Failed to process successful response",
				cause: error,
				statusCode: response.status,
				url,
				responseHeaders,
				requestBodyValues: {}
			});
		}
	} catch (error) {
		throw handleFetchError({
			error,
			url,
			requestBodyValues: {}
		});
	}
};
/**
* Type-guard for Node.js `Buffer` instances.
*
* Uses optional chaining on `globalThis.Buffer` so it returns `false` in
* runtimes where `Buffer` is not available (e.g. CloudFlare Workers).
*/
function isBuffer(value) {
	return globalThis.Buffer?.isBuffer(value) ?? false;
}
/**
* Type guard that checks whether a value is not `null` or `undefined`.
*
* @template T - The type of the value to check.
* @param value - The value to check.
* @returns `true` if the value is neither `null` nor `undefined`, otherwise `false`.
*/
function isNonNullable(value) {
	return value != null;
}
/**
* Checks whether a value is a provider reference (a mapping of provider names
* to provider-specific identifiers) as opposed to raw bytes, a URL, or a
* tagged `{ type: ... }` object.
*/
function isProviderReference(data) {
	return typeof data === "object" && data !== null && !(data instanceof Uint8Array) && !(data instanceof URL) && !(data instanceof ArrayBuffer) && !isBuffer(data) && !("type" in data);
}
/**
* Checks whether a value is a non-null, non-array object.
*/
function isRecord(value) {
	return value != null && typeof value === "object" && !Array.isArray(value);
}
/**
* Checks if the given URL is supported natively by the model.
*
* @param mediaType - The media type of the URL. Case-insensitive. May be a full
*                    `type/subtype`, a wildcard `type/*`, or just the
*                    top-level segment (e.g. `image`).
* @param url - The URL to check.
* @param supportedUrls - A record where keys are case-insensitive media types (or '*')
*                        and values are arrays of RegExp patterns for URLs.
*
* @returns `true` if the URL matches a pattern under the specific media type
*          or the wildcard '*', `false` otherwise.
*/
function isUrlSupported({ mediaType, url, supportedUrls }) {
	mediaType = mediaType.toLowerCase();
	const isTopLevelOnly = !mediaType.includes("/");
	return Object.entries(supportedUrls).map(([key, value]) => {
		const mediaType = key.toLowerCase();
		return mediaType === "*" || mediaType === "*/*" ? {
			mediaTypePrefix: "",
			regexes: value
		} : {
			mediaTypePrefix: mediaType.replace(/\*/, ""),
			regexes: value
		};
	}).filter(({ mediaTypePrefix }) => {
		if (mediaTypePrefix === "") return true;
		if (isTopLevelOnly) return `${mediaType}/` === mediaTypePrefix;
		return mediaTypePrefix.endsWith("/") ? mediaType.startsWith(mediaTypePrefix) : mediaType === mediaTypePrefix;
	}).flatMap(({ regexes }) => regexes).some((pattern) => testRegExpFromStart(pattern, url));
}
function testRegExpFromStart(pattern, value) {
	if (!pattern.global && !pattern.sticky) return pattern.test(value);
	const lastIndex = pattern.lastIndex;
	pattern.lastIndex = 0;
	try {
		return pattern.test(value);
	} finally {
		pattern.lastIndex = lastIndex;
	}
}
function loadApiKey({ apiKey, environmentVariableName, apiKeyParameterName = "apiKey", description }) {
	if (typeof apiKey === "string") return apiKey;
	if (apiKey != null) throw new LoadAPIKeyError({ message: `${description} API key must be a string.` });
	if (typeof processModule === "undefined") throw new LoadAPIKeyError({ message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables are not supported in this environment.` });
	apiKey = processModule.env[environmentVariableName];
	if (apiKey == null) throw new LoadAPIKeyError({ message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.` });
	if (typeof apiKey !== "string") throw new LoadAPIKeyError({ message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.` });
	return apiKey;
}
/**
* Loads an optional `string` setting from the environment or a parameter.
*
* @param settingValue - The setting value.
* @param environmentVariableName - The environment variable name.
* @returns The setting value.
*/
function loadOptionalSetting({ settingValue, environmentVariableName }) {
	if (typeof settingValue === "string") return settingValue;
	if (settingValue != null || typeof processModule === "undefined") return;
	settingValue = processModule.env[environmentVariableName];
	if (settingValue == null || typeof settingValue !== "string") return;
	return settingValue;
}
function isCustomReasoning(reasoning) {
	return reasoning !== void 0 && reasoning !== "provider-default";
}
/**
* Maps a media type to its corresponding file extension.
* It was originally introduced to set a filename for audio file uploads
* in https://github.com/vercel/ai/pull/8159.
*
* @param mediaType The media type to map.
* @returns The corresponding file extension
* @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types
*/
function mediaTypeToExtension(mediaType) {
	const [_type, subtype = ""] = mediaType.toLowerCase().split("/");
	return {
		mpeg: "mp3",
		"x-wav": "wav",
		opus: "ogg",
		mp4: "m4a",
		"x-m4a": "m4a"
	}[subtype] ?? subtype;
}
/**
* Normalizes complete batch request counts.
*
* Returns `undefined` when any count is missing, is not a non-negative safe
* integer, or when the item counts do not add up to the total.
*/
function normalizeBatchRequestCounts({ total, pending, completed, failed }) {
	if (isNonNegativeSafeInteger(total) && isNonNegativeSafeInteger(pending) && isNonNegativeSafeInteger(completed) && isNonNegativeSafeInteger(failed) && pending + completed + failed === total) return {
		total,
		pending,
		completed,
		failed
	};
}
function isNonNegativeSafeInteger(value) {
	return value != null && Number.isSafeInteger(value) && value >= 0;
}
var suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
var suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
function _parse(text) {
	const obj = JSON.parse(text);
	if (obj === null || typeof obj !== "object") return obj;
	if (suspectProtoRx.test(text) === false && suspectConstructorRx.test(text) === false) return obj;
	return filter(obj);
}
function filter(obj) {
	let next = [obj];
	while (next.length) {
		const nodes = next;
		next = [];
		for (const node of nodes) {
			if (Object.prototype.hasOwnProperty.call(node, "__proto__")) throw new SyntaxError("Object contains forbidden prototype property");
			if (Object.prototype.hasOwnProperty.call(node, "constructor") && node.constructor !== null && typeof node.constructor === "object" && Object.prototype.hasOwnProperty.call(node.constructor, "prototype")) throw new SyntaxError("Object contains forbidden prototype property");
			for (const key in node) {
				const value = node[key];
				if (value && typeof value === "object") next.push(value);
			}
		}
	}
	return obj;
}
function secureJsonParse(text) {
	const { stackTraceLimit } = Error;
	try {
		Error.stackTraceLimit = 0;
	} catch {
		return _parse(text);
	}
	try {
		return _parse(text);
	} finally {
		Error.stackTraceLimit = stackTraceLimit;
	}
}
/**
* Recursively adds additionalProperties: false to object schemas that do not
* define a schema for their additional properties. This is necessary because
* some providers (e.g. OpenAI) do not support additionalProperties: true.
*/
function addAdditionalPropertiesToJsonSchema(jsonSchema) {
	if (jsonSchema.type === "object" || Array.isArray(jsonSchema.type) && jsonSchema.type.includes("object")) {
		const { additionalProperties } = jsonSchema;
		jsonSchema.additionalProperties = additionalProperties != null && typeof additionalProperties !== "boolean" ? visit(additionalProperties) : false;
		const { properties } = jsonSchema;
		if (properties != null) for (const key of Object.keys(properties)) properties[key] = visit(properties[key]);
	}
	if (jsonSchema.items != null) jsonSchema.items = Array.isArray(jsonSchema.items) ? jsonSchema.items.map(visit) : visit(jsonSchema.items);
	if (jsonSchema.anyOf != null) jsonSchema.anyOf = jsonSchema.anyOf.map(visit);
	if (jsonSchema.allOf != null) jsonSchema.allOf = jsonSchema.allOf.map(visit);
	if (jsonSchema.oneOf != null) jsonSchema.oneOf = jsonSchema.oneOf.map(visit);
	const { definitions } = jsonSchema;
	if (definitions != null) for (const key of Object.keys(definitions)) definitions[key] = visit(definitions[key]);
	return jsonSchema;
}
function visit(def) {
	if (typeof def === "boolean") return def;
	return addAdditionalPropertiesToJsonSchema(def);
}
var ignoreOverride = Symbol("Let zodToJsonSchema decide on which parser to use");
var defaultOptions = {
	name: void 0,
	$refStrategy: "root",
	basePath: ["#"],
	effectStrategy: "input",
	pipeStrategy: "all",
	dateStrategy: "format:date-time",
	mapStrategy: "entries",
	removeAdditionalStrategy: "passthrough",
	allowedAdditionalProperties: true,
	rejectedAdditionalProperties: false,
	definitionPath: "definitions",
	strictUnions: false,
	definitions: {},
	errorMessages: false,
	patternStrategy: "escape",
	applyRegexFlags: false,
	emailStrategy: "format:email",
	base64Strategy: "contentEncoding:base64",
	nameStrategy: "ref"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
	...defaultOptions,
	name: options
} : {
	...defaultOptions,
	...options
};
function parseAnyDef() {
	return {};
}
function parseArrayDef(def, refs) {
	const res = { type: "array" };
	if (def.type?._def && def.type?._def?.typeName !== "ZodAny") res.items = parseDef(def.type._def, {
		...refs,
		currentPath: [...refs.currentPath, "items"]
	});
	if (def.minLength) res.minItems = def.minLength.value;
	if (def.maxLength) res.maxItems = def.maxLength.value;
	if (def.exactLength) {
		res.minItems = def.exactLength.value;
		res.maxItems = def.exactLength.value;
	}
	return res;
}
function parseBigintDef(def) {
	const res = {
		type: "integer",
		format: "int64"
	};
	if (!def.checks) return res;
	for (const check of def.checks) switch (check.kind) {
		case "min":
			if (check.inclusive) res.minimum = check.value;
			else res.exclusiveMinimum = check.value;
			break;
		case "max":
			if (check.inclusive) res.maximum = check.value;
			else res.exclusiveMaximum = check.value;
			break;
		case "multipleOf": res.multipleOf = check.value;
	}
	return res;
}
function parseBooleanDef() {
	return { type: "boolean" };
}
function parseBrandedDef(_def, refs) {
	return parseDef(_def.type._def, refs);
}
var parseCatchDef = (def, refs) => {
	return parseDef(def.innerType._def, refs);
};
function parseDateDef(def, refs, overrideDateStrategy) {
	const strategy = overrideDateStrategy ?? refs.dateStrategy;
	if (Array.isArray(strategy)) return { anyOf: strategy.map((item) => parseDateDef(def, refs, item)) };
	switch (strategy) {
		case "string":
		case "format:date-time": return {
			type: "string",
			format: "date-time"
		};
		case "format:date": return {
			type: "string",
			format: "date"
		};
		case "integer": return integerDateParser(def);
	}
}
var integerDateParser = (def) => {
	const res = {
		type: "integer",
		format: "unix-time"
	};
	for (const check of def.checks) switch (check.kind) {
		case "min":
			res.minimum = check.value;
			break;
		case "max": res.maximum = check.value;
	}
	return res;
};
function parseDefaultDef(_def, refs) {
	return {
		...parseDef(_def.innerType._def, refs),
		default: _def.defaultValue()
	};
}
function parseEffectsDef(_def, refs) {
	return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef();
}
function parseEnumDef(def) {
	return {
		type: "string",
		enum: Array.from(def.values)
	};
}
var isJsonSchema7AllOfType = (type) => {
	if ("type" in type && type.type === "string") return false;
	return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
	const allOf = [parseDef(def.left._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"0"
		]
	}), parseDef(def.right._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"1"
		]
	})].filter((x) => !!x);
	const mergedAllOf = [];
	allOf.forEach((schema) => {
		if (isJsonSchema7AllOfType(schema)) mergedAllOf.push(...schema.allOf);
		else {
			let nestedSchema = schema;
			if ("additionalProperties" in schema && schema.additionalProperties === false) {
				const { additionalProperties: _additionalProperties, ...rest } = schema;
				nestedSchema = rest;
			}
			mergedAllOf.push(nestedSchema);
		}
	});
	return mergedAllOf.length ? { allOf: mergedAllOf } : void 0;
}
function parseLiteralDef(def) {
	const parsedType = typeof def.value;
	if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") return { type: Array.isArray(def.value) ? "array" : "object" };
	return {
		type: parsedType === "bigint" ? "integer" : parsedType,
		const: def.value
	};
}
var emojiRegex = void 0;
/**
* Generated from the regular expressions found here as of 2024-05-22:
* https://github.com/colinhacks/zod/blob/master/src/types.ts.
*
* Expressions with /i flag have been changed accordingly.
*/
var zodPatterns = {
	/**
	* `c` was changed to `[cC]` to replicate /i flag
	*/
	cuid: /^[cC][^\s-]{8,}$/,
	cuid2: /^[0-9a-z]+$/,
	ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
	/**
	* `a-z` was added to replicate /i flag
	*/
	email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/,
	/**
	* Constructed a valid Unicode RegExp
	*
	* Lazily instantiate since this type of regex isn't supported
	* in all envs (e.g. React Native).
	*
	* See:
	* https://github.com/colinhacks/zod/issues/2433
	* Fix in Zod:
	* https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
	*/
	emoji: () => {
		if (emojiRegex === void 0) emojiRegex = RegExp("^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$", "u");
		return emojiRegex;
	},
	/**
	* Unused
	*/
	uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
	/**
	* Unused
	*/
	ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
	ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
	/**
	* Unused
	*/
	ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
	ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
	base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
	base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
	nanoid: /^[a-zA-Z0-9_-]{21}$/,
	jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
	const res = { type: "string" };
	if (def.checks) for (const check of def.checks) switch (check.kind) {
		case "min":
			res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
			break;
		case "max":
			res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
			break;
		case "email":
			switch (refs.emailStrategy) {
				case "format:email":
					addFormat(res, "email", check.message, refs);
					break;
				case "format:idn-email":
					addFormat(res, "idn-email", check.message, refs);
					break;
				case "pattern:zod": addPattern(res, zodPatterns.email, check.message, refs);
			}
			break;
		case "url":
			addFormat(res, "uri", check.message, refs);
			break;
		case "uuid":
			addFormat(res, "uuid", check.message, refs);
			break;
		case "regex":
			addPattern(res, check.regex, check.message, refs);
			break;
		case "cuid":
			addPattern(res, zodPatterns.cuid, check.message, refs);
			break;
		case "cuid2":
			addPattern(res, zodPatterns.cuid2, check.message, refs);
			break;
		case "startsWith":
			addPattern(res, RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`), check.message, refs);
			break;
		case "endsWith":
			addPattern(res, RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`), check.message, refs);
			break;
		case "datetime":
			addFormat(res, "date-time", check.message, refs);
			break;
		case "date":
			addFormat(res, "date", check.message, refs);
			break;
		case "time":
			addFormat(res, "time", check.message, refs);
			break;
		case "duration":
			addFormat(res, "duration", check.message, refs);
			break;
		case "length":
			res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
			res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
			break;
		case "includes":
			addPattern(res, RegExp(escapeLiteralCheckValue(check.value, refs)), check.message, refs);
			break;
		case "ip":
			if (check.version !== "v6") addFormat(res, "ipv4", check.message, refs);
			if (check.version !== "v4") addFormat(res, "ipv6", check.message, refs);
			break;
		case "base64url":
			addPattern(res, zodPatterns.base64url, check.message, refs);
			break;
		case "jwt":
			addPattern(res, zodPatterns.jwt, check.message, refs);
			break;
		case "cidr":
			if (check.version !== "v6") addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
			if (check.version !== "v4") addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
			break;
		case "emoji":
			addPattern(res, zodPatterns.emoji(), check.message, refs);
			break;
		case "ulid":
			addPattern(res, zodPatterns.ulid, check.message, refs);
			break;
		case "base64":
			switch (refs.base64Strategy) {
				case "format:binary":
					addFormat(res, "binary", check.message, refs);
					break;
				case "contentEncoding:base64":
					res.contentEncoding = "base64";
					break;
				case "pattern:zod": addPattern(res, zodPatterns.base64, check.message, refs);
			}
			break;
		case "nanoid": addPattern(res, zodPatterns.nanoid, check.message, refs);
	}
	return res;
}
function escapeLiteralCheckValue(literal, refs) {
	return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal) : literal;
}
var ALPHA_NUMERIC = /* @__PURE__ */ new Set("ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789");
function escapeNonAlphaNumeric(source) {
	let result = "";
	for (let i = 0; i < source.length; i++) {
		if (!ALPHA_NUMERIC.has(source[i])) result += "\\";
		result += source[i];
	}
	return result;
}
function addFormat(schema, value, message, refs) {
	if (schema.format || schema.anyOf?.some((x) => x.format)) {
		if (!schema.anyOf) schema.anyOf = [];
		if (schema.format) {
			schema.anyOf.push({ format: schema.format });
			delete schema.format;
		}
		schema.anyOf.push({
			format: value,
			...message && refs.errorMessages && { errorMessage: { format: message } }
		});
	} else schema.format = value;
}
function addPattern(schema, regex, message, refs) {
	if (schema.pattern || schema.allOf?.some((x) => x.pattern)) {
		if (!schema.allOf) schema.allOf = [];
		if (schema.pattern) {
			schema.allOf.push({ pattern: schema.pattern });
			delete schema.pattern;
		}
		schema.allOf.push({
			pattern: stringifyRegExpWithFlags(regex, refs),
			...message && refs.errorMessages && { errorMessage: { pattern: message } }
		});
	} else schema.pattern = stringifyRegExpWithFlags(regex, refs);
}
function stringifyRegExpWithFlags(regex, refs) {
	if (!refs.applyRegexFlags || !regex.flags) return regex.source;
	const flags = {
		i: regex.flags.includes("i"),
		m: regex.flags.includes("m"),
		s: regex.flags.includes("s")
	};
	const source = flags.i ? regex.source.toLowerCase() : regex.source;
	let pattern = "";
	let isEscaped = false;
	let inCharGroup = false;
	let inCharRange = false;
	for (let i = 0; i < source.length; i++) {
		if (isEscaped) {
			pattern += source[i];
			isEscaped = false;
			continue;
		}
		if (flags.i) {
			if (inCharGroup) {
				if (source[i].match(/[a-z]/)) {
					if (inCharRange) {
						pattern += source[i];
						pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
						inCharRange = false;
					} else if (source[i + 1] === "-" && source[i + 2]?.match(/[a-z]/)) {
						pattern += source[i];
						inCharRange = true;
					} else pattern += `${source[i]}${source[i].toUpperCase()}`;
					continue;
				}
			} else if (source[i].match(/[a-z]/)) {
				pattern += `[${source[i]}${source[i].toUpperCase()}]`;
				continue;
			}
		}
		if (flags.m) {
			if (source[i] === "^") {
				pattern += `(^|(?<=[\r\n]))`;
				continue;
			} else if (source[i] === "$") {
				pattern += `($|(?=[\r\n]))`;
				continue;
			}
		}
		if (flags.s && source[i] === ".") {
			pattern += inCharGroup ? `${source[i]}\r\n` : `[${source[i]}\r\n]`;
			continue;
		}
		pattern += source[i];
		if (source[i] === "\\") isEscaped = true;
		else if (inCharGroup && source[i] === "]") inCharGroup = false;
		else if (!inCharGroup && source[i] === "[") inCharGroup = true;
	}
	try {
		new RegExp(pattern);
	} catch {
		console.warn(`Could not convert regex pattern at ${refs.currentPath.join("/")} to a flag-independent form! Falling back to the flag-ignorant source`);
		return regex.source;
	}
	return pattern;
}
function parseRecordDef(def, refs) {
	const schema = {
		type: "object",
		additionalProperties: parseDef(def.valueType._def, {
			...refs,
			currentPath: [...refs.currentPath, "additionalProperties"]
		}) ?? refs.allowedAdditionalProperties
	};
	if (def.keyType?._def.typeName === "ZodString" && def.keyType._def.checks?.length) {
		const { type: _type, ...keyType } = parseStringDef(def.keyType._def, refs);
		return {
			...schema,
			propertyNames: keyType
		};
	} else if (def.keyType?._def.typeName === "ZodEnum") return {
		...schema,
		propertyNames: { enum: def.keyType._def.values }
	};
	else if (def.keyType?._def.typeName === "ZodBranded" && def.keyType._def.type._def.typeName === "ZodString" && def.keyType._def.type._def.checks?.length) {
		const { type: _type, ...keyType } = parseBrandedDef(def.keyType._def, refs);
		return {
			...schema,
			propertyNames: keyType
		};
	}
	return schema;
}
function parseMapDef(def, refs) {
	if (refs.mapStrategy === "record") return parseRecordDef(def, refs);
	return {
		type: "array",
		maxItems: 125,
		items: {
			type: "array",
			items: [parseDef(def.keyType._def, {
				...refs,
				currentPath: [
					...refs.currentPath,
					"items",
					"items",
					"0"
				]
			}) || parseAnyDef(), parseDef(def.valueType._def, {
				...refs,
				currentPath: [
					...refs.currentPath,
					"items",
					"items",
					"1"
				]
			}) || parseAnyDef()],
			minItems: 2,
			maxItems: 2
		}
	};
}
function parseNativeEnumDef(def) {
	const object = def.values;
	const actualValues = Object.keys(def.values).filter((key) => {
		return typeof object[object[key]] !== "number";
	}).map((key) => object[key]);
	const parsedTypes = Array.from(new Set(actualValues.map((values) => typeof values)));
	return {
		type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
		enum: actualValues
	};
}
function parseNeverDef() {
	return { not: parseAnyDef() };
}
function parseNullDef() {
	return { type: "null" };
}
var primitiveMappings = {
	ZodString: "string",
	ZodNumber: "number",
	ZodBigInt: "integer",
	ZodBoolean: "boolean",
	ZodNull: "null"
};
function parseUnionDef(def, refs) {
	const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
	if (options.every((x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length))) {
		const types = options.reduce((types, x) => {
			const type = primitiveMappings[x._def.typeName];
			return type && !types.includes(type) ? [...types, type] : types;
		}, []);
		return { type: types.length > 1 ? types : types[0] };
	} else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
		const types = options.reduce((acc, x) => {
			const type = typeof x._def.value;
			switch (type) {
				case "string":
				case "number":
				case "boolean": return [...acc, type];
				case "bigint": return [...acc, "integer"];
				case "object": if (x._def.value === null) return [...acc, "null"];
				default: return acc;
			}
		}, []);
		if (types.length === options.length) {
			const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
			return {
				type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
				enum: options.reduce((acc, x) => {
					return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
				}, [])
			};
		}
	} else if (options.every((x) => x._def.typeName === "ZodEnum")) return {
		type: "string",
		enum: options.reduce((acc, x) => [...acc, ...x._def.values.filter((x) => !acc.includes(x))], [])
	};
	return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
	const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map((x, i) => parseDef(x._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			`${i}`
		]
	})).filter((x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0));
	return anyOf.length ? { anyOf } : void 0;
};
function parseNullableDef(def, refs) {
	if ([
		"ZodString",
		"ZodNumber",
		"ZodBigInt",
		"ZodBoolean",
		"ZodNull"
	].includes(def.innerType._def.typeName) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) return { type: [primitiveMappings[def.innerType._def.typeName], "null"] };
	const base = parseDef(def.innerType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			"0"
		]
	});
	return base && { anyOf: [base, { type: "null" }] };
}
function parseNumberDef(def) {
	const res = { type: "number" };
	if (!def.checks) return res;
	for (const check of def.checks) switch (check.kind) {
		case "int":
			res.type = "integer";
			break;
		case "min":
			if (check.inclusive) res.minimum = check.value;
			else res.exclusiveMinimum = check.value;
			break;
		case "max":
			if (check.inclusive) res.maximum = check.value;
			else res.exclusiveMaximum = check.value;
			break;
		case "multipleOf": res.multipleOf = check.value;
	}
	return res;
}
function parseObjectDef(def, refs) {
	const result = {
		type: "object",
		properties: {}
	};
	const required = [];
	const shape = def.shape();
	for (const propName in shape) {
		let propDef = shape[propName];
		if (propDef === void 0 || propDef._def === void 0) continue;
		const propOptional = safeIsOptional(propDef);
		const parsedDef = parseDef(propDef._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"properties",
				propName
			],
			propertyPath: [
				...refs.currentPath,
				"properties",
				propName
			]
		});
		if (parsedDef === void 0) continue;
		result.properties[propName] = parsedDef;
		if (!propOptional) required.push(propName);
	}
	if (required.length) result.required = required;
	const additionalProperties = decideAdditionalProperties(def, refs);
	if (additionalProperties !== void 0) result.additionalProperties = additionalProperties;
	return result;
}
function decideAdditionalProperties(def, refs) {
	if (def.catchall._def.typeName !== "ZodNever") return parseDef(def.catchall._def, {
		...refs,
		currentPath: [...refs.currentPath, "additionalProperties"]
	});
	switch (def.unknownKeys) {
		case "passthrough": return refs.allowedAdditionalProperties;
		case "strict": return refs.rejectedAdditionalProperties;
		case "strip": return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
	}
}
function safeIsOptional(schema) {
	try {
		return schema.isOptional();
	} catch {
		return true;
	}
}
var parseOptionalDef = (def, refs) => {
	if (refs.currentPath.toString() === refs.propertyPath?.toString()) return parseDef(def.innerType._def, refs);
	const innerSchema = parseDef(def.innerType._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"anyOf",
			"1"
		]
	});
	return innerSchema ? { anyOf: [{ not: parseAnyDef() }, innerSchema] } : parseAnyDef();
};
var parsePipelineDef = (def, refs) => {
	if (refs.pipeStrategy === "input") return parseDef(def.in._def, refs);
	else if (refs.pipeStrategy === "output") return parseDef(def.out._def, refs);
	const inputSchema = parseDef(def.in._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			"0"
		]
	});
	return { allOf: [inputSchema, parseDef(def.out._def, {
		...refs,
		currentPath: [
			...refs.currentPath,
			"allOf",
			inputSchema ? "1" : "0"
		]
	})].filter((schema) => schema !== void 0) };
};
function parsePromiseDef(def, refs) {
	return parseDef(def.type._def, refs);
}
function parseSetDef(def, refs) {
	const schema = {
		type: "array",
		uniqueItems: true,
		items: parseDef(def.valueType._def, {
			...refs,
			currentPath: [...refs.currentPath, "items"]
		})
	};
	if (def.minSize) schema.minItems = def.minSize.value;
	if (def.maxSize) schema.maxItems = def.maxSize.value;
	return schema;
}
function parseTupleDef(def, refs) {
	if (def.rest) return {
		type: "array",
		minItems: def.items.length,
		items: def.items.map((x, i) => parseDef(x._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"items",
				`${i}`
			]
		})).reduce((acc, x) => x === void 0 ? acc : [...acc, x], []),
		additionalItems: parseDef(def.rest._def, {
			...refs,
			currentPath: [...refs.currentPath, "additionalItems"]
		})
	};
	else return {
		type: "array",
		minItems: def.items.length,
		maxItems: def.items.length,
		items: def.items.map((x, i) => parseDef(x._def, {
			...refs,
			currentPath: [
				...refs.currentPath,
				"items",
				`${i}`
			]
		})).reduce((acc, x) => x === void 0 ? acc : [...acc, x], [])
	};
}
function parseUndefinedDef() {
	return { not: parseAnyDef() };
}
function parseUnknownDef() {
	return parseAnyDef();
}
var parseReadonlyDef = (def, refs) => {
	return parseDef(def.innerType._def, refs);
};
var selectParser = (def, typeName, refs) => {
	switch (typeName) {
		case "ZodString": return parseStringDef(def, refs);
		case "ZodNumber": return parseNumberDef(def);
		case "ZodObject": return parseObjectDef(def, refs);
		case "ZodBigInt": return parseBigintDef(def);
		case "ZodBoolean": return parseBooleanDef();
		case "ZodDate": return parseDateDef(def, refs);
		case "ZodUndefined": return parseUndefinedDef();
		case "ZodNull": return parseNullDef();
		case "ZodArray": return parseArrayDef(def, refs);
		case "ZodUnion":
		case "ZodDiscriminatedUnion": return parseUnionDef(def, refs);
		case "ZodIntersection": return parseIntersectionDef(def, refs);
		case "ZodTuple": return parseTupleDef(def, refs);
		case "ZodRecord": return parseRecordDef(def, refs);
		case "ZodLiteral": return parseLiteralDef(def);
		case "ZodEnum": return parseEnumDef(def);
		case "ZodNativeEnum": return parseNativeEnumDef(def);
		case "ZodNullable": return parseNullableDef(def, refs);
		case "ZodOptional": return parseOptionalDef(def, refs);
		case "ZodMap": return parseMapDef(def, refs);
		case "ZodSet": return parseSetDef(def, refs);
		case "ZodLazy": return () => def.getter()._def;
		case "ZodPromise": return parsePromiseDef(def, refs);
		case "ZodNaN":
		case "ZodNever": return parseNeverDef();
		case "ZodEffects": return parseEffectsDef(def, refs);
		case "ZodAny": return parseAnyDef();
		case "ZodUnknown": return parseUnknownDef();
		case "ZodDefault": return parseDefaultDef(def, refs);
		case "ZodBranded": return parseBrandedDef(def, refs);
		case "ZodReadonly": return parseReadonlyDef(def, refs);
		case "ZodCatch": return parseCatchDef(def, refs);
		case "ZodPipeline": return parsePipelineDef(def, refs);
		case "ZodFunction":
		case "ZodVoid":
		case "ZodSymbol": return;
		default:
 /* c8 ignore next */
		return ((_) => void 0)(typeName);
	}
};
var getRelativePath = (pathA, pathB) => {
	let i = 0;
	for (; i < pathA.length && i < pathB.length; i++) if (pathA[i] !== pathB[i]) break;
	return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};
function parseDef(def, refs, forceResolution = false) {
	const seenItem = refs.seen.get(def);
	if (refs.override) {
		const overrideResult = refs.override?.(def, refs, seenItem, forceResolution);
		if (overrideResult !== ignoreOverride) return overrideResult;
	}
	if (seenItem && !forceResolution) {
		const seenSchema = get$ref(seenItem, refs);
		if (seenSchema !== void 0) return seenSchema;
	}
	const newItem = {
		def,
		path: refs.currentPath,
		jsonSchema: void 0
	};
	refs.seen.set(def, newItem);
	const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
	const jsonSchema = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
	if (jsonSchema) addMeta(def, refs, jsonSchema);
	if (refs.postProcess) {
		const postProcessResult = refs.postProcess(jsonSchema, def, refs);
		newItem.jsonSchema = jsonSchema;
		return postProcessResult;
	}
	newItem.jsonSchema = jsonSchema;
	return jsonSchema;
}
var get$ref = (item, refs) => {
	switch (refs.$refStrategy) {
		case "root": return { $ref: item.path.join("/") };
		case "relative": return { $ref: getRelativePath(refs.currentPath, item.path) };
		case "none":
		case "seen":
			if (item.path.length < refs.currentPath.length && item.path.every((value, index) => refs.currentPath[index] === value)) {
				console.warn(`Recursive reference detected at ${refs.currentPath.join("/")}! Defaulting to any`);
				return parseAnyDef();
			}
			return refs.$refStrategy === "seen" ? parseAnyDef() : void 0;
	}
};
var addMeta = (def, refs, jsonSchema) => {
	if (def.description) jsonSchema.description = def.description;
	return jsonSchema;
};
var getRefs = (options) => {
	const _options = getDefaultOptions(options);
	const currentPath = _options.name !== void 0 ? [
		..._options.basePath,
		_options.definitionPath,
		_options.name
	] : _options.basePath;
	return {
		..._options,
		currentPath,
		propertyPath: void 0,
		seen: new Map(Object.entries(_options.definitions).map(([name, def]) => [def._def, {
			def: def._def,
			path: [
				..._options.basePath,
				_options.definitionPath,
				name
			],
			jsonSchema: void 0
		}]))
	};
};
var zod3ToJsonSchema = (schema, options) => {
	const refs = getRefs(options);
	let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce((acc, [name, schema]) => ({
		...acc,
		[name]: parseDef(schema._def, {
			...refs,
			currentPath: [
				...refs.basePath,
				refs.definitionPath,
				name
			]
		}, true) ?? parseAnyDef()
	}), {}) : void 0;
	const name = typeof options === "string" ? options : options?.nameStrategy === "title" ? void 0 : options?.name;
	const main = parseDef(schema._def, name === void 0 ? refs : {
		...refs,
		currentPath: [
			...refs.basePath,
			refs.definitionPath,
			name
		]
	}, false) ?? parseAnyDef();
	const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
	if (title !== void 0) main.title = title;
	const combined = name === void 0 ? definitions ? {
		...main,
		[refs.definitionPath]: definitions
	} : main : {
		$ref: [
			...refs.$refStrategy === "relative" ? [] : refs.basePath,
			refs.definitionPath,
			name
		].join("/"),
		[refs.definitionPath]: {
			...definitions,
			[name]: main
		}
	};
	combined.$schema = "http://json-schema.org/draft-07/schema#";
	return combined;
};
/**
* Used to mark schemas so we can support both Zod and custom schemas.
*/
var schemaSymbol = Symbol.for("vercel.ai.schema");
/**
* Creates a schema with deferred creation.
* This is important to reduce the startup time of the library
* and to avoid initializing unused validators.
*
* @param createValidator A function that creates a schema.
* @returns A function that returns a schema.
*/
function lazySchema(createSchema) {
	let schema;
	return () => {
		if (schema == null) schema = createSchema();
		return schema;
	};
}
/**
* Create a schema using a JSON Schema.
*
* @param jsonSchema The JSON Schema for the schema.
* @param options.validate Optional. A validation function for the schema.
*/
function jsonSchema(jsonSchema, { validate } = {}) {
	return {
		[schemaSymbol]: true,
		_type: void 0,
		get jsonSchema() {
			if (typeof jsonSchema === "function") jsonSchema = jsonSchema();
			return jsonSchema;
		},
		validate
	};
}
function isSchema(value) {
	return typeof value === "object" && value !== null && schemaSymbol in value && value[schemaSymbol] === true && "jsonSchema" in value && "validate" in value;
}
function asSchema(schema) {
	return schema == null ? jsonSchema({
		type: "object",
		properties: {},
		additionalProperties: false
	}) : isSchema(schema) ? schema : "~standard" in schema ? schema["~standard"].vendor === "zod" ? zodSchema(schema) : standardSchema(schema) : schema();
}
function standardSchema(standardSchema) {
	return jsonSchema(() => {
		if (!hasStandardJsonSchema(standardSchema)) throw new Error(`Standard schema vendor '${standardSchema["~standard"].vendor}' does not support JSON Schema conversion.`);
		return addAdditionalPropertiesToJsonSchema(standardSchema["~standard"].jsonSchema.input({ target: "draft-07" }));
	}, { validate: async (value) => {
		const result = await standardSchema["~standard"].validate(value);
		return "value" in result ? {
			success: true,
			value: result.value
		} : {
			success: false,
			error: new TypeValidationError({
				value,
				cause: result.issues
			})
		};
	} });
}
function hasStandardJsonSchema(schema) {
	return schema["~standard"].jsonSchema != null;
}
function zod3Schema(zodSchema, options) {
	const useReferences = options?.useReferences ?? false;
	return jsonSchema(() => zod3ToJsonSchema(zodSchema, { $refStrategy: useReferences ? "root" : "none" }), { validate: async (value) => {
		const result = await zodSchema.safeParseAsync(value);
		return result.success ? {
			success: true,
			value: result.data
		} : {
			success: false,
			error: result.error
		};
	} });
}
function zod4Schema(zodSchema, options) {
	const useReferences = options?.useReferences ?? false;
	return jsonSchema(() => addAdditionalPropertiesToJsonSchema(toJSONSchema(zodSchema, {
		target: "draft-7",
		io: "input",
		reused: useReferences ? "ref" : "inline"
	})), { validate: async (value) => {
		const result = await safeParseAsync(zodSchema, value);
		return result.success ? {
			success: true,
			value: result.data
		} : {
			success: false,
			error: result.error
		};
	} });
}
function isZod4Schema(zodSchema) {
	return "_zod" in zodSchema;
}
function zodSchema(zodSchema, options) {
	if (isZod4Schema(zodSchema)) return zod4Schema(zodSchema, options);
	else return zod3Schema(zodSchema, options);
}
/**
* Validates the types of an unknown object using a schema and
* return a strongly-typed object.
*
* @template T - The type of the object to validate.
* @param {string} options.value - The object to validate.
* @param {Validator<T>} options.schema - The schema to use for validating the JSON.
* @param {TypeValidationContext} options.context - Optional context about what is being validated.
* @returns {Promise<T>} - The typed object.
*/
async function validateTypes({ value, schema, context }) {
	const result = await safeValidateTypes({
		value,
		schema,
		context
	});
	if (!result.success) throw TypeValidationError.wrap({
		value,
		cause: result.error,
		context
	});
	return result.value;
}
/**
* Safely validates the types of an unknown object using a schema and
* return a strongly-typed object.
*
* @template T - The type of the object to validate.
* @param {string} options.value - The JSON object to validate.
* @param {Validator<T>} options.schema - The schema to use for validating the JSON.
* @param {TypeValidationContext} options.context - Optional context about what is being validated.
* @returns An object with either a `success` flag and the parsed and typed data, or a `success` flag and an error object.
*/
async function safeValidateTypes({ value, schema, context }) {
	const actualSchema = asSchema(schema);
	try {
		if (actualSchema.validate == null) return {
			success: true,
			value,
			rawValue: value
		};
		const result = await actualSchema.validate(value);
		if (result.success) return {
			success: true,
			value: result.value,
			rawValue: value
		};
		return {
			success: false,
			error: TypeValidationError.wrap({
				value,
				cause: result.error,
				context
			}),
			rawValue: value
		};
	} catch (error) {
		return {
			success: false,
			error: TypeValidationError.wrap({
				value,
				cause: error,
				context
			}),
			rawValue: value
		};
	}
}
async function parseJSON({ text, schema }) {
	try {
		const value = secureJsonParse(text);
		if (schema == null) return value;
		return await validateTypes({
			value,
			schema
		});
	} catch (error) {
		if (JSONParseError.isInstance(error) || TypeValidationError.isInstance(error)) throw error;
		throw new JSONParseError({
			text,
			cause: error
		});
	}
}
async function safeParseJSON({ text, schema }) {
	try {
		const value = secureJsonParse(text);
		if (schema == null) return {
			success: true,
			value,
			rawValue: value
		};
		return await safeValidateTypes({
			value,
			schema
		});
	} catch (error) {
		return {
			success: false,
			error: JSONParseError.isInstance(error) ? error : new JSONParseError({
				text,
				cause: error
			}),
			rawValue: void 0
		};
	}
}
/**
* Parses a JSON event stream into a stream of parsed JSON objects.
*/
function parseJsonEventStream({ stream, schema }) {
	return stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).pipeThrough(new TransformStream({ async transform({ data }, controller) {
		if (data === "[DONE]") return;
		controller.enqueue(await safeParseJSON({
			text: data,
			schema
		}));
	} }));
}
async function parseProviderOptions({ provider, providerOptions, schema }) {
	if (providerOptions?.[provider] == null) return;
	const parsedProviderOptions = await safeValidateTypes({
		value: providerOptions[provider],
		schema
	});
	if (!parsedProviderOptions.success) throw new InvalidArgumentError({
		argument: "providerOptions",
		message: `invalid ${provider} provider options`,
		cause: parsedProviderOptions.error
	});
	return parsedProviderOptions.value;
}
var getOriginalFetch$1 = () => globalThis.fetch;
function escapeMultipartHeaderValue(value) {
	return value.replace(/[\r\n]/g, "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
function createMultipartBody(parts, boundary) {
	const encoder = new TextEncoder();
	let disposed = false;
	let activeReader;
	const enteredStreams = /* @__PURE__ */ new Set();
	async function* emitParts() {
		for (const part of parts) {
			if (disposed) return;
			const disposition = `--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartHeaderValue(part.name)}"`;
			if (part.type === "field") {
				yield encoder.encode(`${disposition}\r\n\r\n${part.value}\r\n`);
				continue;
			}
			const filenameParameter = `; filename="${escapeMultipartHeaderValue(part.filename ?? "blob")}"`;
			const mediaType = (part.mediaType ?? "application/octet-stream").replace(/[\r\n]/g, "");
			yield encoder.encode(`${disposition}${filenameParameter}\r\nContent-Type: ${mediaType}\r\n\r\n`);
			if (part.content instanceof Uint8Array) yield part.content;
			else {
				const reader = part.content.getReader();
				activeReader = reader;
				enteredStreams.add(part.content);
				let finished = false;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done || disposed) {
							finished = done;
							break;
						}
						yield value;
					}
				} finally {
					activeReader = void 0;
					if (!finished) await reader.cancel().catch(() => {});
					reader.releaseLock();
				}
				if (disposed) return;
			}
			yield encoder.encode("\r\n");
		}
		yield encoder.encode(`--${boundary}--\r\n`);
	}
	return {
		stream: convertAsyncIteratorToReadableStream(emitParts()),
		async dispose(reason) {
			if (disposed) return;
			disposed = true;
			const reader = activeReader;
			if (reader != null) await reader.cancel(reason).catch(() => {});
			for (const part of parts) if (part.type === "file" && !(part.content instanceof Uint8Array) && !enteredStreams.has(part.content)) await part.content.cancel(reason).catch(() => {});
		}
	};
}
/**
* POSTs a multipart/form-data body as a request stream, so file parts backed
* by a `ReadableStream` are sent without buffering the full file in memory.
*
* Requires a fetch implementation that supports streaming request bodies
* (`duplex: 'half'`). Callers with fully buffered payloads can keep using
* `postFormDataToApi`.
*/
var postMultipartStreamToApi = async ({ url, headers = {}, parts, failedResponseHandler, successfulResponseHandler, abortSignal, fetch = getOriginalFetch$1() }) => {
	const boundary = `ai-sdk-multipart-${generateId()}`;
	const requestBodyValues = Object.fromEntries(parts.map((part) => [part.name, part.type === "field" ? part.value : `<file:${part.filename ?? part.name}>`]));
	const body = createMultipartBody(parts, boundary);
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: withUserAgentSuffix({
				...headers,
				"Content-Type": `multipart/form-data; boundary=${boundary}`
			}, `ai-sdk-provider-utils/${VERSION$1}`, getRuntimeEnvironmentUserAgent()),
			body: body.stream,
			duplex: "half",
			signal: abortSignal
		});
		const responseHeaders = extractResponseHeaders(response);
		if (!response.ok) {
			let errorInformation;
			try {
				errorInformation = await failedResponseHandler({
					response,
					url,
					requestBodyValues
				});
			} catch (error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
				throw new APICallError({
					message: "Failed to process error response",
					cause: error,
					statusCode: response.status,
					url,
					responseHeaders,
					requestBodyValues
				});
			}
			throw errorInformation.value;
		}
		try {
			return await successfulResponseHandler({
				response,
				url,
				requestBodyValues
			});
		} catch (error) {
			if (error instanceof Error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
			}
			throw new APICallError({
				message: "Failed to process successful response",
				cause: error,
				statusCode: response.status,
				url,
				responseHeaders,
				requestBodyValues
			});
		}
	} catch (error) {
		await body.dispose(error);
		throw handleFetchError({
			error,
			url,
			requestBodyValues
		});
	}
};
var getOriginalFetch = () => globalThis.fetch;
var postJsonToApi = async ({ url, headers, body, failedResponseHandler, successfulResponseHandler, abortSignal, fetch }) => await postToApi({
	url,
	headers: {
		"Content-Type": "application/json",
		...headers
	},
	body: {
		content: JSON.stringify(body),
		values: body
	},
	failedResponseHandler,
	successfulResponseHandler,
	abortSignal,
	fetch
});
var postFormDataToApi = async ({ url, headers, formData, failedResponseHandler, successfulResponseHandler, abortSignal, fetch }) => await postToApi({
	url,
	headers,
	body: {
		content: formData,
		values: Object.fromEntries(formData.entries())
	},
	failedResponseHandler,
	successfulResponseHandler,
	abortSignal,
	fetch
});
var postToApi = async ({ url, headers = {}, body, successfulResponseHandler, failedResponseHandler, abortSignal, fetch = getOriginalFetch() }) => {
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: withUserAgentSuffix(headers, `ai-sdk-provider-utils/${VERSION$1}`, getRuntimeEnvironmentUserAgent()),
			body: body.content,
			signal: abortSignal
		});
		const responseHeaders = extractResponseHeaders(response);
		if (!response.ok) {
			let errorInformation;
			try {
				errorInformation = await failedResponseHandler({
					response,
					url,
					requestBodyValues: body.values
				});
			} catch (error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
				throw new APICallError({
					message: "Failed to process error response",
					cause: error,
					statusCode: response.status,
					url,
					responseHeaders,
					requestBodyValues: body.values
				});
			}
			throw errorInformation.value;
		}
		try {
			return await successfulResponseHandler({
				response,
				url,
				requestBodyValues: body.values
			});
		} catch (error) {
			if (error instanceof Error) {
				if (isAbortError(error) || APICallError.isInstance(error)) throw error;
			}
			throw new APICallError({
				message: "Failed to process successful response",
				cause: error,
				statusCode: response.status,
				url,
				responseHeaders,
				requestBodyValues: body.values
			});
		}
	} catch (error) {
		throw handleFetchError({
			error,
			url,
			requestBodyValues: body.values
		});
	}
};
function tool(tool) {
	return tool;
}
function createProviderDefinedToolFactory({ id, inputSchema }) {
	return ({ execute, outputSchema, needsApproval, toModelOutput, onInputStart, onInputDelta, onInputAvailable, ...args }) => tool({
		type: "provider",
		isProviderExecuted: false,
		id,
		args,
		inputSchema,
		outputSchema,
		execute,
		needsApproval,
		toModelOutput,
		onInputStart,
		onInputDelta,
		onInputAvailable
	});
}
function createProviderDefinedToolFactoryWithOutputSchema({ id, inputSchema, outputSchema }) {
	return ({ execute, needsApproval, toModelOutput, onInputStart, onInputDelta, onInputAvailable, ...args }) => tool({
		type: "provider",
		isProviderExecuted: false,
		id,
		args,
		inputSchema,
		outputSchema,
		execute,
		needsApproval,
		toModelOutput,
		onInputStart,
		onInputDelta,
		onInputAvailable
	});
}
function createProviderExecutedToolFactory({ id, inputSchema, outputSchema, supportsDeferredResults }) {
	return ({ onInputStart, onInputDelta, onInputAvailable, ...args }) => tool({
		type: "provider",
		isProviderExecuted: true,
		id,
		args,
		inputSchema,
		outputSchema,
		onInputStart,
		onInputDelta,
		onInputAvailable,
		supportsDeferredResults
	});
}
/**
* Resolves a value that could be a raw value, a Promise, a function returning a value,
* or a function returning a Promise.
*/
async function resolve(value) {
	if (typeof value === "function") value = value();
	return value;
}
/**
* Resolves a file part's media type to a full `type/subtype` form required by
* providers whose API demands the full IANA media type.
*
* - If `part.mediaType` is already a full media type (e.g. `image/png`), it is
*   returned as-is.
* - Otherwise, when inline bytes are available (`part.data.type === 'data'`),
*   the subtype is sniffed from the bytes using the signature table that
*   corresponds to the top-level segment.
* - When neither applies (e.g. top-level-only with a URL source, or bytes that
*   cannot be detected), an `UnsupportedFunctionalityError` is thrown.
*/
function resolveFullMediaType({ part }) {
	if (isFullMediaType(part.mediaType)) return part.mediaType;
	if (part.data.type === "data") {
		const detected = detectMediaType({
			data: part.data.data,
			topLevelType: getTopLevelMediaType(part.mediaType)
		});
		if (detected) return detected;
		throw new UnsupportedFunctionalityError({ functionality: `file of media type "${part.mediaType}" must specify subtype since it could not be auto-detected` });
	}
	throw new UnsupportedFunctionalityError({ functionality: `file of media type "${part.mediaType}" must specify subtype since it is not passed as inline bytes` });
}
/**
* Resolves a provider reference to the provider-specific identifier for the
* given provider. Throws `NoSuchProviderReferenceError` if the provider is not
* found in the reference mapping.
*/
function resolveProviderReference({ reference, provider }) {
	const id = reference[provider];
	if (id != null) return id;
	throw new NoSuchProviderReferenceError({
		provider,
		reference
	});
}
/**
* Retries a failed operation with exponential backoff.
*/
var retryWithExponentialBackoff = ({ maxRetries = 2, initialDelayInMs = 2e3, backoffFactor = 2, abortSignal, shouldRetry, getDelayInMs = ({ exponentialBackoffDelay }) => exponentialBackoffDelay, createRetryError = ({ message }) => new Error(message) }) => async (f) => retryWithExponentialBackoffInternal(f, {
	maxRetries,
	delayInMs: initialDelayInMs,
	backoffFactor,
	abortSignal,
	shouldRetry,
	getDelayInMs,
	createRetryError
});
async function retryWithExponentialBackoffInternal(f, { maxRetries, delayInMs, backoffFactor, abortSignal, shouldRetry, getDelayInMs, createRetryError }, errors = []) {
	try {
		return await f();
	} catch (error) {
		if (isAbortError(error)) throw error;
		if (maxRetries === 0) throw error;
		const errorMessage = getErrorMessage(error);
		const newErrors = [...errors, error];
		const tryNumber = newErrors.length;
		if (tryNumber > maxRetries) throw createRetryError({
			message: `Failed after ${tryNumber} attempts. Last error: ${errorMessage}`,
			reason: "maxRetriesExceeded",
			errors: newErrors
		});
		if (await shouldRetry(error) && tryNumber <= maxRetries) {
			await delay(getDelayInMs({
				error,
				exponentialBackoffDelay: delayInMs
			}), { abortSignal });
			return retryWithExponentialBackoffInternal(f, {
				maxRetries,
				delayInMs: backoffFactor * delayInMs,
				backoffFactor,
				abortSignal,
				shouldRetry,
				getDelayInMs,
				createRetryError
			}, newErrors);
		}
		if (tryNumber === 1) throw error;
		throw createRetryError({
			message: `Failed after ${tryNumber} attempts with non-retryable error: '${errorMessage}'`,
			reason: "errorNotRetryable",
			errors: newErrors
		});
	}
}
var textDecoder = new TextDecoder();
var DEFAULT_MAX_JSON_LINE_BYTES = 67108864;
function wrapResponseBodyStream({ stream, url, requestBodyValues, statusCode, responseHeaders }) {
	const reader = stream.getReader();
	let readerReleased = false;
	const releaseReader = () => {
		if (!readerReleased) {
			reader.releaseLock();
			readerReleased = true;
		}
	};
	return new ReadableStream({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					releaseReader();
					controller.close();
				} else controller.enqueue(value);
			} catch (error) {
				releaseReader();
				if (isAbortError(error)) {
					controller.error(error);
					return;
				}
				controller.error(handleFetchError({
					error: new APICallError({
						message: "Failed to process successful response",
						cause: error,
						statusCode,
						url,
						responseHeaders,
						requestBodyValues
					}),
					url,
					requestBodyValues
				}));
			}
		},
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				releaseReader();
			}
		}
	});
}
async function readResponseBodyAsText({ response, url }) {
	return textDecoder.decode(await readResponseWithSizeLimit({
		response,
		url
	}));
}
var createJsonErrorResponseHandler = ({ errorSchema, errorToMessage, isRetryable }) => async ({ response, url, requestBodyValues }) => {
	const responseBody = await readResponseBodyAsText({
		response,
		url
	});
	const responseHeaders = extractResponseHeaders(response);
	if (responseBody.trim() === "") return {
		responseHeaders,
		value: new APICallError({
			message: response.statusText,
			url,
			requestBodyValues,
			statusCode: response.status,
			responseHeaders,
			responseBody,
			isRetryable: isRetryable?.(response)
		})
	};
	try {
		const parsedError = await parseJSON({
			text: responseBody,
			schema: errorSchema
		});
		return {
			responseHeaders,
			value: new APICallError({
				message: errorToMessage(parsedError),
				url,
				requestBodyValues,
				statusCode: response.status,
				responseHeaders,
				responseBody,
				data: parsedError,
				isRetryable: isRetryable?.(response, parsedError)
			})
		};
	} catch {
		return {
			responseHeaders,
			value: new APICallError({
				message: response.statusText,
				url,
				requestBodyValues,
				statusCode: response.status,
				responseHeaders,
				responseBody,
				isRetryable: isRetryable?.(response)
			})
		};
	}
};
var createEventSourceResponseHandler = (chunkSchema) => async ({ response, url, requestBodyValues }) => {
	const responseHeaders = extractResponseHeaders(response);
	if (response.body == null) throw new EmptyResponseBodyError({});
	return {
		responseHeaders,
		value: parseJsonEventStream({
			stream: wrapResponseBodyStream({
				stream: response.body,
				url,
				requestBodyValues,
				statusCode: response.status,
				responseHeaders
			}),
			schema: chunkSchema
		})
	};
};
var createJsonResponseHandler = (responseSchema) => async ({ response, url, requestBodyValues }) => {
	const responseBody = await readResponseBodyAsText({
		response,
		url
	});
	const parsedResult = await safeParseJSON({
		text: responseBody,
		schema: responseSchema
	});
	const responseHeaders = extractResponseHeaders(response);
	if (!parsedResult.success) throw new APICallError({
		message: "Invalid JSON response",
		cause: parsedResult.error,
		statusCode: response.status,
		responseHeaders,
		responseBody,
		url,
		requestBodyValues
	});
	return {
		responseHeaders,
		value: parsedResult.value,
		rawValue: parsedResult.rawValue
	};
};
var createJsonLinesResponseHandler = (responseSchema, { maxLineBytes = DEFAULT_MAX_JSON_LINE_BYTES } = {}) => {
	if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) throw new InvalidArgumentError({
		argument: "maxLineBytes",
		message: "maxLineBytes must be a positive safe integer."
	});
	return async ({ response, url }) => {
		const responseHeaders = extractResponseHeaders(response);
		if (response.body == null) throw new EmptyResponseBodyError({});
		return {
			responseHeaders,
			value: parseJsonLines({
				stream: response.body,
				schema: responseSchema,
				url,
				maxLineBytes
			})
		};
	};
};
async function* parseJsonLines({ stream, schema, url, maxLineBytes }) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let lineBytes = 0;
	let finished = false;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				finished = true;
				buffer += decoder.decode();
				break;
			}
			let offset = 0;
			while (offset < value.length) {
				const lineEnd = value.indexOf(10, offset);
				const segmentEnd = lineEnd === -1 ? value.length : lineEnd;
				lineBytes += segmentEnd - offset;
				if (lineBytes > maxLineBytes) throw new DownloadError({
					message: `JSON Lines response exceeded maximum line size of ${maxLineBytes} bytes.`,
					url
				});
				const decodeEnd = lineEnd === -1 ? segmentEnd : lineEnd + 1;
				buffer += decoder.decode(value.subarray(offset, decodeEnd), { stream: true });
				if (lineEnd === -1) break;
				const line = buffer.slice(0, -1).replace(/\r$/, "");
				buffer = "";
				lineBytes = 0;
				offset = decodeEnd;
				if (line.trim().length > 0) yield await parseJSON({
					text: line,
					schema
				});
			}
		}
		const finalLine = buffer.replace(/\r$/, "");
		if (finalLine.trim().length > 0) yield await parseJSON({
			text: finalLine,
			schema
		});
	} finally {
		if (!finished) await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
var createBinaryResponseHandler = () => async ({ response, url, requestBodyValues }) => {
	const responseHeaders = extractResponseHeaders(response);
	if (!response.body) throw new APICallError({
		message: "Response body is empty",
		url,
		requestBodyValues,
		statusCode: response.status,
		responseHeaders,
		responseBody: void 0
	});
	try {
		const buffer = await response.arrayBuffer();
		return {
			responseHeaders,
			value: new Uint8Array(buffer)
		};
	} catch (error) {
		throw new APICallError({
			message: "Failed to read response as array buffer",
			url,
			requestBodyValues,
			statusCode: response.status,
			responseHeaders,
			responseBody: void 0,
			cause: error
		});
	}
};
/**
* Passes the response body through as a `ReadableStream<Uint8Array>` without
* buffering it (unlike `createBinaryResponseHandler`). The consumer is
* responsible for draining or cancelling the stream.
*/
var createBinaryStreamResponseHandler = () => async ({ response, url, requestBodyValues }) => {
	const responseHeaders = extractResponseHeaders(response);
	if (response.body == null) throw new EmptyResponseBodyError({});
	return {
		responseHeaders,
		value: wrapResponseBodyStream({
			stream: response.body,
			url,
			requestBodyValues,
			statusCode: response.status,
			responseHeaders
		})
	};
};
/**
* Checks whether a value can cross a workflow serialization boundary.
*
* The check accepts JSON-like primitives, arrays, and plain objects whose
* nested values are also serializable. It rejects functions, symbols,
* bigints, and non-plain objects such as class instances, dates, and regexes.
*/
function isJSONSerializable(value) {
	if (value === null || value === void 0) return true;
	const type = typeof value;
	if (type === "string" || type === "number" || type === "boolean") return true;
	if (type === "function" || type === "symbol" || type === "bigint") return false;
	if (Array.isArray(value)) return value.every(isJSONSerializable);
	if (Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).every(isJSONSerializable);
	return false;
}
var name$10 = "AI_SerializationError";
var marker$10 = `vercel.ai.error.${name$10}`;
var symbol$11 = Symbol.for(marker$10);
var SerializationError = class extends AISDKError {
	constructor({ message = "Failed to serialize value.", cause } = {}) {
		super({
			name: name$10,
			message,
			cause
		});
		this[symbol$11] = true;
	}
	static isInstance(error) {
		return AISDKError.hasMarker(error, marker$10);
	}
};
/**
* Serializes a model instance for workflow step boundaries.
* Returns the `modelId` plus the JSON-serializable config properties.
*
* Non-serializable values are omitted. As a special case, a
* function-valued `headers` property is resolved during serialization
* and included if the returned value is JSON-serializable.
*
* Used as the body of `static [WORKFLOW_SERIALIZE]` in provider models.
*
* @example
* ```ts
* static [WORKFLOW_SERIALIZE](model: MyLanguageModel) {
*   return serializeModelOptions({
*     modelId: model.modelId,
*     config: model.config,
*   });
* }
* ```
*/
function serializeModelOptions(options) {
	const serializableConfig = {};
	for (const [key, value] of Object.entries(options.config)) if (key === "headers") {
		const resolvedHeaders = resolveSync(value);
		if (isJSONSerializable(resolvedHeaders)) serializableConfig[key] = resolvedHeaders;
	} else if (isJSONSerializable(value)) serializableConfig[key] = value;
	return {
		modelId: options.modelId,
		config: serializableConfig
	};
}
function resolveSync(value) {
	let next = value;
	if (typeof value === "function") next = value();
	if (next instanceof Promise) throw new SerializationError({ message: "Cannot serialize asynchronous model options." });
	return next;
}
/**
* Experimental speech-stream WebSocket envelope (v1): the standard
* serialization of `Experimental_StreamingSpeechModelV4.doStream` over a WebSocket. Clients (e.g.
* the `@ai-sdk/gateway` provider) encode with this module and servers (e.g.
* AI Gateway) decode with it, so the two sides cannot drift.
*
* Envelope rules:
*
* 1. The client sends exactly one `speech-stream.start` TEXT frame first.
* 2. Input text rides `speech-stream.text-delta` TEXT frames, in order. A
*    frame may carry its text part's `voice` and `providerOptions`. A long
*    part may span several frames: `voice` is repeated on each, and
*    `providerOptions` appear on the first only, so they must describe an
*    event at the start of the part (e.g. a turn break), not a setting. An
*    empty `delta` is valid and carries only part metadata; it does not end
*    the input.
* 3. The client signals the end of the input text with the
*    `speech-stream.text-done` TEXT frame; a plain close without it is an
*    abort.
* 4. Every server→client TEXT frame is one JSON-serialized
*    `SpeechModelV4StreamPart` (flattened, no wrapper). `audio` payloads are
*    base64 strings. `Date` values (`response-metadata.timestamp`) serialize
*    to ISO 8601 strings and are revived by `parseSpeechStreamPart`. `Error`
*    payloads in `error` parts serialize as `{ name, message }`; servers may
*    instead send `{ type, message }`, where `type` names an error class the
*    client can map to a typed error (e.g. `invalid_request_error`).
* 5. The server closes with code 1000 after the `finish` part. Over this
*    envelope an `error` part is terminal: the server sends it on failure and
*    then closes non-1000. A close without a prior `finish` is an error.
* 6. Unknown frame/part types are ignored in both directions (forward
*    compatibility).
* 7. Servers may enforce a maximum frame size (the AI Gateway rejects frames
*    over 256 KiB); clients should keep text-delta frames under 64 KiB.
* 8. Connection establishment (URL, auth) is transport-specific and out of
*    scope.
*
* The envelope validates frame shape only; server policy layers on top. Both
* parsers use `secureJsonParse`, so frames carrying `__proto__` /
* `constructor.prototype` keys are rejected rather than parsed.
*/
/** Type of the first client TEXT frame. */
var SPEECH_STREAM_START_FRAME_TYPE = "speech-stream.start";
/** Type of the client TEXT frame that carries one input text delta. */
var SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE = "speech-stream.text-delta";
/** Type of the client TEXT frame that signals the end of the input text. */
var SPEECH_STREAM_TEXT_DONE_FRAME_TYPE = "speech-stream.text-done";
/**
* Client-side: parse a server TEXT frame into a speech stream part. Returns
* `undefined` for malformed or unsafe JSON, unknown part types, and known
* part types whose fields are missing or mistyped. Revives
* `response-metadata.timestamp` to a `Date`.
*/
function parseSpeechStreamPart(text) {
	let value;
	try {
		value = secureJsonParse(text);
	} catch {
		return;
	}
	if (!isRecord(value)) return;
	const part = value;
	switch (part.type) {
		case "stream-start": {
			if (!Array.isArray(part.warnings)) return;
			const warnings = part.warnings.filter((warning) => !isUnknownWarningType(warning));
			return warnings.every(isWarning$1) ? {
				...part,
				warnings
			} : void 0;
		}
		case "audio": return isString$1(part.audio) && isAudioFormat(part.audioFormat) && isOptional$1(part.id, isString$1) && isOptional$1(part.providerMetadata, isRecord) ? part : void 0;
		case "finish": return isOptional$1(part.usage, isUsage) && isOptional$1(part.providerMetadata, isRecord) ? part : void 0;
		case "response-metadata": {
			if (!(isOptional$1(part.modelId, isString$1) && isOptional$1(part.headers, isRecord))) return;
			const timestamp = part.timestamp;
			if (timestamp == null) return {
				...part,
				timestamp: void 0
			};
			if (typeof timestamp !== "string") return;
			const revived = new Date(timestamp);
			return Number.isNaN(revived.getTime()) ? void 0 : {
				...part,
				timestamp: revived
			};
		}
		case "raw": return "rawValue" in part ? part : void 0;
		case "error": return "error" in part ? part : void 0;
		default: return;
	}
}
function isString$1(value) {
	return typeof value === "string";
}
function isOptional$1(value, check) {
	return value === void 0 || check(value);
}
var knownWarningTypes = /* @__PURE__ */ new Set([
	"compatibility",
	"deprecated",
	"other",
	"unsupported"
]);
function isUnknownWarningType(value) {
	return isRecord(value) && isString$1(value.type) && !knownWarningTypes.has(value.type);
}
function isWarning$1(value) {
	if (!isRecord(value)) return false;
	switch (value.type) {
		case "compatibility":
		case "unsupported": return isString$1(value.feature) && isOptional$1(value.details, isString$1);
		case "deprecated": return isString$1(value.setting) && isString$1(value.message);
		case "other": return isString$1(value.message);
		default: return false;
	}
}
function isAudioFormat(value) {
	return isRecord(value) && isString$1(value.type) && value.type.length > 0 && isOptional$1(value.rate, (rate) => typeof rate === "number" && Number.isFinite(rate) && rate > 0);
}
function isUsage(value) {
	return isRecord(value) && [
		"inputCharacters",
		"inputTokens",
		"outputTokens"
	].every((key) => isOptional$1(value[key], (count) => typeof count === "number"));
}
function startsWithStructuredValue(value) {
	if (typeof value !== "string") return false;
	const firstCharacter = value.trimStart()[0];
	return firstCharacter === "{" || firstCharacter === "[";
}
/**
* Incrementally tracks whether streamed tool-call arguments contain a complete
* structured JSON value. This is intentionally structural rather than a JSON
* parse: a currently parsable scalar can still be the prefix of a later value.
*/
var StreamingToolCallArgumentState = class {
	constructor(initialValue = "") {
		this.structure = { kind: "undetermined" };
		this.append(initialValue);
	}
	get hasCompleteStructuredValue() {
		return this.structure.kind === "structured" && this.structure.complete === true;
	}
	append(delta) {
		let nextStructure = this.structure;
		for (const character of delta) {
			if (nextStructure.kind === "undetermined") {
				if (/\s/.test(character)) continue;
				if (character !== "{" && character !== "[") {
					nextStructure = { kind: "other" };
					continue;
				}
				nextStructure = {
					kind: "structured",
					stack: [character],
					inString: false,
					escaped: false,
					complete: false
				};
				continue;
			}
			if (nextStructure.kind !== "structured" || nextStructure.complete) continue;
			if (nextStructure.inString) {
				if (nextStructure.escaped) nextStructure.escaped = false;
				else if (character === "\\") nextStructure.escaped = true;
				else if (character === "\"") nextStructure.inString = false;
				continue;
			}
			if (character === "\"") nextStructure.inString = true;
			else if (character === "{" || character === "[") nextStructure.stack.push(character);
			else if (character === "}" || character === "]") {
				const expectedOpening = character === "}" ? "{" : "[";
				if (nextStructure.stack.at(-1) !== expectedOpening) {
					nextStructure = { kind: "other" };
					continue;
				}
				nextStructure.stack.pop();
				if (nextStructure.stack.length === 0) nextStructure.complete = true;
			}
		}
		this.structure = nextStructure;
	}
};
/**
* Tracks streaming tool call state across multiple deltas from an
* OpenAI-compatible chat completion stream. Handles argument accumulation,
* emits tool-input-start/delta/end and tool-call events, and finalizes
* unfinished tool calls on flush.
*
* Used by openai, openai-compatible, groq, deepseek, alibaba, mistral, and
* moonshotai providers.
*/
var StreamingToolCallTracker = class {
	constructor(controller, options = {}) {
		this.toolCalls = [];
		this.toolCallsById = /* @__PURE__ */ new Map();
		this.toolCallsByIndex = /* @__PURE__ */ new Map();
		this.usedToolCallIds = /* @__PURE__ */ new Set();
		this.nextGeneratedIdSuffixes = /* @__PURE__ */ new Map();
		this.controller = controller;
		this._generateId = options.generateId ?? generateId;
		this.typeValidation = options.typeValidation ?? "none";
		this.extractMetadata = options.extractMetadata;
		this.buildToolCallProviderMetadata = options.buildToolCallProviderMetadata;
	}
	/**
	* Process a tool call delta from a streaming response chunk.
	* Emits tool-input-start, tool-input-delta, tool-input-end, and tool-call
	* events as appropriate.
	*/
	processDelta(toolCallDelta) {
		const wireName = toolCallDelta.function?.name;
		const hasBlankName = typeof wireName === "string" && wireName.trim().length === 0;
		const wireId = this.getNonBlankString(toolCallDelta.id);
		const name = this.getNonBlankString(wireName);
		const argumentsDelta = toolCallDelta.function?.arguments;
		const { index } = toolCallDelta;
		const resolution = this.resolveToolCall({
			wireId,
			index,
			name,
			hasExplicitCallStart: name != null && startsWithStructuredValue(argumentsDelta),
			hasEmptyArguments: argumentsDelta == null || argumentsDelta.trim().length === 0
		});
		if (resolution.kind === "ambiguous") return;
		let toolCall;
		if (resolution.kind === "new") {
			if (hasBlankName) return;
			toolCall = this.processNewToolCall(toolCallDelta, {
				wireId,
				index,
				name
			});
		} else {
			toolCall = resolution.toolCall;
			if (wireId != null) this.associateWireId(toolCall, wireId);
			this.processExistingToolCall(toolCall, toolCallDelta);
		}
		if (index != null) this.associateIndex(toolCall, index);
	}
	/**
	* Finalize any unfinished tool calls. Should be called during the stream's
	* flush handler to ensure all tool calls are properly completed.
	*/
	flush() {
		const toolCalls = this.toolCalls.every((toolCall) => toolCall.index != null) ? [...this.toolCalls].sort((a, b) => a.index - b.index || a.sequence - b.sequence) : this.toolCalls;
		for (const toolCall of toolCalls) if (!toolCall.hasFinished) this.finishToolCall(toolCall);
	}
	/**
	* Correlation precedence for streamed deltas:
	*
	* | ID evidence | index/name evidence | start evidence | resolution |
	* | --- | --- | --- | --- |
	* | known | matching | any | matching call, new call, or ambiguity |
	* | known | conflicting | named | new call |
	* | unseen | matching | structured start | new call |
	* | unseen | matching | named empty arguments | incomplete call, new call, or ambiguity |
	* | unseen | matching | continuation | matching call or ambiguity |
	* | absent | matching | any | matching call, new call, or ambiguity |
	* | absent | absent | named | new call |
	* | absent | absent | unnamed | sole unfinished call, new call, or ambiguity |
	*/
	resolveToolCall({ wireId, index, name, hasExplicitCallStart, hasEmptyArguments }) {
		const indexedToolCalls = index != null ? this.toolCallsByIndex.get(index) : void 0;
		const matchingIndexedToolCalls = this.filterToolCallsByName(indexedToolCalls, name);
		if (wireId != null) {
			const toolCallsWithId = this.toolCallsById.get(wireId);
			if (toolCallsWithId != null) {
				if (index != null) {
					const matchingToolCalls = matchingIndexedToolCalls.filter((toolCall) => toolCallsWithId.has(toolCall));
					const matchingToolCall = this.resolveMatchingToolCall(matchingToolCalls, hasExplicitCallStart);
					if (matchingToolCall.kind !== "new") return matchingToolCall;
					if (name != null) return { kind: "new" };
					if (indexedToolCalls != null) return { kind: "ambiguous" };
					return this.resolveMatchingToolCall([...toolCallsWithId], false);
				}
				if (name != null) {
					const matchingToolCalls = [...toolCallsWithId].filter((toolCall) => toolCall.function.name === name);
					return this.resolveMatchingToolCall(matchingToolCalls, hasExplicitCallStart);
				}
				return this.resolveMatchingToolCall([...toolCallsWithId], false);
			}
			if (matchingIndexedToolCalls.length > 0) return hasExplicitCallStart ? { kind: "new" } : this.resolveMatchingToolCall(matchingIndexedToolCalls, name != null && hasEmptyArguments);
			return { kind: "new" };
		}
		if (indexedToolCalls != null) return this.resolveMatchingToolCall(matchingIndexedToolCalls, hasExplicitCallStart);
		if (name != null) return { kind: "new" };
		const unfinishedToolCalls = this.toolCalls.filter((toolCall) => !toolCall.hasFinished);
		return this.resolveMatchingToolCall(unfinishedToolCalls, false);
	}
	filterToolCallsByName(toolCalls, name) {
		if (toolCalls == null) return [];
		return [...toolCalls].filter((toolCall) => name == null || toolCall.function.name === name);
	}
	resolveMatchingToolCall(toolCalls, hasExplicitCallStart) {
		if (toolCalls.length === 0) return { kind: "new" };
		const continuableToolCalls = toolCalls.filter((toolCall) => !toolCall.argumentState.hasCompleteStructuredValue);
		if (!hasExplicitCallStart && toolCalls.length === 1) return {
			kind: "existing",
			toolCall: toolCalls[0]
		};
		if (continuableToolCalls.length === 1) return {
			kind: "existing",
			toolCall: continuableToolCalls[0]
		};
		if (continuableToolCalls.length > 1 || !hasExplicitCallStart) return { kind: "ambiguous" };
		return { kind: "new" };
	}
	processNewToolCall(toolCallDelta, { wireId, index, name }) {
		if (this.typeValidation === "required") {
			if (toolCallDelta.type !== "function") throw new InvalidResponseDataError({
				data: toolCallDelta,
				message: `Expected 'function' type.`
			});
		} else if (this.typeValidation === "if-present") {
			if (toolCallDelta.type != null && toolCallDelta.type !== "function") throw new InvalidResponseDataError({
				data: toolCallDelta,
				message: `Expected 'function' type.`
			});
		}
		if (name == null) throw new InvalidResponseDataError({
			data: toolCallDelta,
			message: `Expected 'function.name' to be a string.`
		});
		const id = this.createToolCallId(wireId);
		this.controller.enqueue({
			type: "tool-input-start",
			id,
			toolName: name
		});
		const metadata = this.extractMetadata?.(toolCallDelta);
		const initialArguments = toolCallDelta.function?.arguments ?? "";
		const toolCall = {
			id,
			index: index ?? void 0,
			sequence: this.toolCalls.length,
			type: "function",
			function: {
				name,
				arguments: initialArguments
			},
			argumentState: new StreamingToolCallArgumentState(initialArguments),
			hasFinished: false,
			metadata
		};
		this.toolCalls.push(toolCall);
		if (wireId != null) this.associateWireId(toolCall, wireId);
		if (toolCall.function.arguments.length > 0) this.controller.enqueue({
			type: "tool-input-delta",
			id: toolCall.id,
			delta: toolCall.function.arguments
		});
		return toolCall;
	}
	associateWireId(toolCall, wireId) {
		let toolCallsWithId = this.toolCallsById.get(wireId);
		if (toolCallsWithId == null) {
			toolCallsWithId = /* @__PURE__ */ new Set();
			this.toolCallsById.set(wireId, toolCallsWithId);
		}
		toolCallsWithId.add(toolCall);
	}
	associateIndex(toolCall, index) {
		let toolCallsWithIndex = this.toolCallsByIndex.get(index);
		if (toolCallsWithIndex == null) {
			toolCallsWithIndex = /* @__PURE__ */ new Set();
			this.toolCallsByIndex.set(index, toolCallsWithIndex);
		}
		toolCallsWithIndex.add(toolCall);
	}
	createToolCallId(wireId) {
		if (wireId != null && !this.usedToolCallIds.has(wireId)) {
			this.usedToolCallIds.add(wireId);
			return wireId;
		}
		const generatedId = this.getNonBlankString(this._generateId()) ?? "tool-call";
		if (!this.usedToolCallIds.has(generatedId)) {
			this.usedToolCallIds.add(generatedId);
			return generatedId;
		}
		const initialSuffix = this.nextGeneratedIdSuffixes.get(generatedId) ?? 1;
		const maximumSuffix = initialSuffix + this.usedToolCallIds.size;
		for (let suffix = initialSuffix; suffix <= maximumSuffix; suffix++) {
			const suffixedId = `${generatedId}-${suffix}`;
			if (!this.usedToolCallIds.has(suffixedId)) {
				this.usedToolCallIds.add(suffixedId);
				this.nextGeneratedIdSuffixes.set(generatedId, suffix + 1);
				return suffixedId;
			}
		}
		throw new Error("Failed to create a unique tool call ID.");
	}
	getNonBlankString(value) {
		return value != null && value.trim().length > 0 ? value : void 0;
	}
	processExistingToolCall(toolCall, toolCallDelta) {
		if (toolCall.hasFinished) return;
		if (toolCallDelta.function?.arguments != null) {
			toolCall.argumentState.append(toolCallDelta.function.arguments);
			toolCall.function.arguments += toolCallDelta.function.arguments;
			this.controller.enqueue({
				type: "tool-input-delta",
				id: toolCall.id,
				delta: toolCallDelta.function.arguments
			});
		}
	}
	finishToolCall(toolCall) {
		this.controller.enqueue({
			type: "tool-input-end",
			id: toolCall.id
		});
		const providerMetadata = this.buildToolCallProviderMetadata?.(toolCall.metadata);
		this.controller.enqueue({
			type: "tool-call",
			toolCallId: toolCall.id,
			toolName: toolCall.function.name,
			input: toolCall.function.arguments,
			...providerMetadata ? { providerMetadata } : {}
		});
		toolCall.hasFinished = true;
	}
};
/**
* Experimental transcription-stream WebSocket envelope (v1): the standard
* serialization of `TranscriptionModelV4.doStream` over a WebSocket. Clients
* (e.g. the `@ai-sdk/gateway` provider) encode with this module and servers
* (e.g. AI Gateway) decode with it, so the two sides cannot drift.
*
* Envelope rules:
*
* 1. The client sends exactly one `transcription-stream.start` TEXT frame
*    first.
* 2. Audio rides BINARY frames containing raw bytes in the declared
*    `inputAudioFormat` (base64 string chunks are decoded before sending).
* 3. The client signals end of audio with the
*    `transcription-stream.audio-done` TEXT frame; a plain close without it
*    is an abort.
* 4. Every server→client TEXT frame is one JSON-serialized
*    `TranscriptionModelV4StreamPart` (flattened, no wrapper). Payloads must
*    be JSON-serializable. `Date` values (`response-metadata.timestamp`)
*    serialize to ISO 8601 strings and are revived by
*    `parseTranscriptionStreamPart`. `Error` payloads in `error` parts
*    serialize as `{ name, message }`.
* 5. The server closes with code 1000 after the `finish` part; on failure it
*    sends an `error` part and closes non-1000. A close without a prior
*    `finish` is an error.
* 6. Unknown frame/part types are ignored in both directions (forward
*    compatibility).
* 7. Servers may enforce a maximum frame size (the AI Gateway rejects frames
*    over 256 KiB); clients should split audio into frames of at most
*    64 KiB.
* 8. Connection establishment (URL, auth) is transport-specific and out of
*    scope.
*
* The envelope validates frame shape only; server policy (accepted audio
* formats, required `rate`, size limits) layers on top. Both parsers use
* `secureJsonParse`, so frames carrying `__proto__` / `constructor.prototype`
* keys are rejected (prototype-pollution protection) rather than parsed.
*/
/** Type of the first client TEXT frame. */
var TRANSCRIPTION_STREAM_START_FRAME_TYPE = "transcription-stream.start";
/** Type of the client TEXT frame that signals the end of the audio input. */
var TRANSCRIPTION_STREAM_AUDIO_DONE_FRAME_TYPE = "transcription-stream.audio-done";
/**
* Client-side: parse a server TEXT frame into a transcription stream part.
* Returns `undefined` for malformed or unsafe (prototype-polluting) JSON
* (parsed with `secureJsonParse`), unknown part types, and known part types
* whose required or optional fields are missing or mistyped (including
* warning and segment elements) — downstream SDK code dereferences those
* fields, so a drifted server must not crash or pollute the stream.
* Revives `response-metadata.timestamp` to a `Date`.
*/
function parseTranscriptionStreamPart(text) {
	let value;
	try {
		value = secureJsonParse(text);
	} catch {
		return;
	}
	if (value == null || typeof value !== "object" || Array.isArray(value)) return;
	const part = value;
	switch (part.type) {
		case "stream-start": return Array.isArray(part.warnings) && part.warnings.every(isWarning) ? part : void 0;
		case "transcript-delta": return isString(part.delta) && isOptional(part.id, isString) && isOptional(part.providerMetadata, isRecord) ? part : void 0;
		case "transcript-partial": return isString(part.text) && isOptional(part.id, isString) && isOptional(part.startSecond, isNumber) && isOptional(part.durationInSeconds, isNumber) && isOptional(part.channelIndex, isNumber) && isOptional(part.providerMetadata, isRecord) ? part : void 0;
		case "transcript-final": return isString(part.text) && isOptional(part.id, isString) && isOptional(part.startSecond, isNumber) && isOptional(part.endSecond, isNumber) && isOptional(part.channelIndex, isNumber) && isOptional(part.providerMetadata, isRecord) ? part : void 0;
		case "finish": return isString(part.text) && Array.isArray(part.segments) && part.segments.every(isSegment) && isOptional(part.language, isString) && isOptional(part.durationInSeconds, isNumber) && isOptional(part.usage, isRecord) && isOptional(part.providerMetadata, isRecord) ? part : void 0;
		case "response-metadata": {
			if (!(isOptional(part.modelId, isString) && isOptional(part.headers, isRecord))) return;
			const timestamp = part.timestamp;
			if (timestamp == null) return {
				...part,
				timestamp: void 0
			};
			if (typeof timestamp !== "string") return;
			const revived = new Date(timestamp);
			return Number.isNaN(revived.getTime()) ? void 0 : {
				...part,
				timestamp: revived
			};
		}
		case "raw": return "rawValue" in part ? part : void 0;
		case "error": return "error" in part ? part : void 0;
		default: return;
	}
}
function isString(value) {
	return typeof value === "string";
}
function isNumber(value) {
	return typeof value === "number";
}
function isOptional(value, check) {
	return value === void 0 || check(value);
}
function isWarning(value) {
	return isRecord(value) && isString(value.type);
}
function isSegment(value) {
	return isRecord(value) && isString(value.text) && isNumber(value.startSecond) && isNumber(value.endSecond);
}
function validateBaseURL(baseURL) {
	if (baseURL?.trim() === "") throw new InvalidArgumentError({
		argument: "baseURL",
		message: "baseURL must be a non-empty string."
	});
	return baseURL;
}
function withoutTrailingSlash(url) {
	return url?.replace(/\/$/, "");
}
/**
* Checks whether a tool exposes an execute function.
*/
function isExecutableTool(tool) {
	return tool != null && typeof tool.execute === "function";
}
function isAsyncIterable(obj) {
	return obj != null && typeof obj[Symbol.asyncIterator] === "function";
}
/**
* Executes a tool function and normalizes its results into a stream of outputs.
*
* - If the tool's `execute` function returns an `AsyncIterable`, each yielded value is emitted as
*   `{ type: "preliminary", output }`. After iteration completes, the last yielded value is emitted
*   again as `{ type: "final", output }`.
* - If the tool returns a direct value or Promise, a single `{ type: "final", output }` is yielded.
*
* @param params.tool The tool whose `execute` function should be invoked.
* @param params.input The input value to pass to the tool.
* @param params.options Additional options for tool execution.
* @yields A preliminary output for each streamed value, followed by a final output, or a single final
* output for non-streaming tools.
*/
async function* executeTool({ tool, input, options }) {
	const result = tool.execute(input, options);
	if (isAsyncIterable(result)) {
		let lastOutput;
		for await (const output of result) {
			lastOutput = output;
			yield {
				type: "preliminary",
				output
			};
		}
		yield {
			type: "final",
			output: lastOutput
		};
	} else yield {
		type: "final",
		output: await result
	};
}
function toolCaller(tool, definition) {
	return Object.defineProperty({ ...tool }, "experimental_toolCaller", { value: definition });
}
function getToolCaller(tool) {
	return tool?.experimental_toolCaller;
}
//#endregion
//#region node_modules/@vercel/oidc/dist/get-context.js
var require_get_context = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var get_context_exports = {};
	__export(get_context_exports, {
		SYMBOL_FOR_REQ_CONTEXT: () => SYMBOL_FOR_REQ_CONTEXT,
		getContext: () => getContext
	});
	module.exports = __toCommonJS(get_context_exports);
	var SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
	function getContext() {
		return globalThis[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
	}
	0 && (module.exports = {
		SYMBOL_FOR_REQ_CONTEXT,
		getContext
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/token-error.js
var require_token_error = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var token_error_exports = {};
	__export(token_error_exports, { VercelOidcTokenError: () => VercelOidcTokenError });
	module.exports = __toCommonJS(token_error_exports);
	var VercelOidcTokenError = class extends Error {
		constructor(message, cause) {
			super(message);
			this.name = "VercelOidcTokenError";
			this.cause = cause;
		}
		toString() {
			if (this.cause) return `${this.name}: ${this.message}: ${this.cause}`;
			return `${this.name}: ${this.message}`;
		}
	};
	0 && (module.exports = { VercelOidcTokenError });
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/get-vercel-oidc-token.js
var require_get_vercel_oidc_token = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var get_vercel_oidc_token_exports = {};
	__export(get_vercel_oidc_token_exports, {
		getVercelOidcToken: () => getVercelOidcToken,
		getVercelOidcTokenSync: () => getVercelOidcTokenSync
	});
	module.exports = __toCommonJS(get_vercel_oidc_token_exports);
	var import_get_context = require_get_context();
	var import_token_error = require_token_error();
	async function getVercelOidcToken(options) {
		let token = "";
		let err;
		try {
			token = getVercelOidcTokenSync();
		} catch (error) {
			err = error;
		}
		try {
			const [{ getTokenPayload, isExpired }, { refreshToken }] = await Promise.all([await Promise.resolve().then(() => /* @__PURE__ */ __toESM(require_token_util())), await import("../vercel__oidc.mjs").then((n) => /* @__PURE__ */ __toESM(n.t()))]);
			if (!token || isExpired(getTokenPayload(token), options?.expirationBufferMs)) {
				await refreshToken(options);
				token = getVercelOidcTokenSync();
			}
		} catch (error) {
			let message = err instanceof Error ? err.message : "";
			if (error instanceof Error) message = `${message}
${error.message}`;
			if (message) throw new import_token_error.VercelOidcTokenError(message);
			throw error;
		}
		return token;
	}
	function getVercelOidcTokenSync() {
		const token = (0, import_get_context.getContext)().headers?.["x-vercel-oidc-token"] ?? processModule.env.VERCEL_OIDC_TOKEN;
		if (!token) throw new Error(`The 'x-vercel-oidc-token' header is missing from the request. Do you have the OIDC option enabled in the Vercel project settings?`);
		return token;
	}
	0 && (module.exports = {
		getVercelOidcToken,
		getVercelOidcTokenSync
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/auth-errors.js
var require_auth_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var auth_errors_exports = {};
	__export(auth_errors_exports, {
		AccessTokenMissingError: () => AccessTokenMissingError,
		RefreshAccessTokenFailedError: () => RefreshAccessTokenFailedError
	});
	module.exports = __toCommonJS(auth_errors_exports);
	var AccessTokenMissingError = class extends Error {
		constructor() {
			super("No authentication found. Please log in with the Vercel CLI (vercel login).");
			this.name = "AccessTokenMissingError";
		}
	};
	var RefreshAccessTokenFailedError = class extends Error {
		constructor(cause) {
			super("Failed to refresh authentication token.", { cause });
			this.name = "RefreshAccessTokenFailedError";
		}
	};
	0 && (module.exports = {
		AccessTokenMissingError,
		RefreshAccessTokenFailedError
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/token-io.js
var require_token_io = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var token_io_exports = {};
	__export(token_io_exports, {
		findRootDir: () => findRootDir,
		getUserDataDir: () => getUserDataDir
	});
	module.exports = __toCommonJS(token_io_exports);
	var import_path = __toESM(__require("node:path"));
	var import_fs = __toESM(__require("node:fs"));
	var import_os$1 = __toESM(__require("node:os"));
	var import_token_error = require_token_error();
	function findRootDir() {
		try {
			let dir = processModule.cwd();
			while (dir !== import_path.default.dirname(dir)) {
				const pkgPath = import_path.default.join(dir, ".vercel");
				if (import_fs.default.existsSync(pkgPath)) return dir;
				dir = import_path.default.dirname(dir);
			}
		} catch (e) {
			throw new import_token_error.VercelOidcTokenError("Token refresh only supported in node server environments");
		}
		return null;
	}
	function getUserDataDir() {
		if (processModule.env.XDG_DATA_HOME) return processModule.env.XDG_DATA_HOME;
		switch (import_os$1.default.platform()) {
			case "darwin": return import_path.default.join(import_os$1.default.homedir(), "Library/Application Support");
			case "linux": return import_path.default.join(import_os$1.default.homedir(), ".local/share");
			case "win32":
				if (processModule.env.LOCALAPPDATA) return processModule.env.LOCALAPPDATA;
				return null;
			default: return null;
		}
	}
	0 && (module.exports = {
		findRootDir,
		getUserDataDir
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/auth-config.js
var require_auth_config = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var auth_config_exports = {};
	__export(auth_config_exports, {
		isValidAccessToken: () => isValidAccessToken,
		readAuthConfig: () => readAuthConfig,
		writeAuthConfig: () => writeAuthConfig
	});
	module.exports = __toCommonJS(auth_config_exports);
	var fs$1 = __toESM(__require("node:fs"));
	var path$1 = __toESM(__require("node:path"));
	var import_token_util = require_token_util();
	function getAuthConfigPath() {
		const dataDir = (0, import_token_util.getVercelDataDir)();
		if (!dataDir) throw new Error(`Unable to find Vercel CLI data directory. Your platform: ${processModule.platform}. Supported: darwin, linux, win32.`);
		return path$1.join(dataDir, "auth.json");
	}
	function readAuthConfig() {
		try {
			const authPath = getAuthConfigPath();
			if (!fs$1.existsSync(authPath)) return null;
			const content = fs$1.readFileSync(authPath, "utf8");
			if (!content) return null;
			return JSON.parse(content);
		} catch (error) {
			return null;
		}
	}
	function writeAuthConfig(config) {
		const authPath = getAuthConfigPath();
		const authDir = path$1.dirname(authPath);
		if (!fs$1.existsSync(authDir)) fs$1.mkdirSync(authDir, {
			mode: 504,
			recursive: true
		});
		fs$1.writeFileSync(authPath, JSON.stringify(config, null, 2), { mode: 384 });
	}
	function isValidAccessToken(authConfig, expirationBufferMs = 0) {
		if (!authConfig.token) return false;
		if (typeof authConfig.expiresAt !== "number") return true;
		const nowInSeconds = Math.floor(Date.now() / 1e3);
		const bufferInSeconds = expirationBufferMs / 1e3;
		return authConfig.expiresAt >= nowInSeconds + bufferInSeconds;
	}
	0 && (module.exports = {
		isValidAccessToken,
		readAuthConfig,
		writeAuthConfig
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/oauth.js
var require_oauth = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var oauth_exports = {};
	__export(oauth_exports, {
		processTokenResponse: () => processTokenResponse,
		refreshTokenRequest: () => refreshTokenRequest
	});
	module.exports = __toCommonJS(oauth_exports);
	var import_os = __require("node:os");
	var VERCEL_ISSUER = "https://vercel.com";
	var VERCEL_CLI_CLIENT_ID = "cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp";
	var userAgent = `@vercel/oidc node-${processModule.version} ${(0, import_os.platform)()} (${(0, import_os.arch)()}) ${(0, import_os.hostname)()}`;
	var _tokenEndpoint = null;
	async function getTokenEndpoint() {
		if (_tokenEndpoint) return _tokenEndpoint;
		const response = await fetch(`${VERCEL_ISSUER}/.well-known/openid-configuration`, { headers: { "user-agent": userAgent } });
		if (!response.ok) throw new Error("Failed to discover OAuth endpoints");
		const metadata = await response.json();
		if (!metadata || typeof metadata.token_endpoint !== "string") throw new Error("Invalid OAuth discovery response");
		const endpoint = metadata.token_endpoint;
		_tokenEndpoint = endpoint;
		return endpoint;
	}
	async function refreshTokenRequest(options) {
		const tokenEndpoint = await getTokenEndpoint();
		return await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"user-agent": userAgent
			},
			body: new URLSearchParams({
				client_id: VERCEL_CLI_CLIENT_ID,
				grant_type: "refresh_token",
				...options
			})
		});
	}
	async function processTokenResponse(response) {
		const json = await response.json();
		if (!response.ok) {
			const errorMsg = typeof json === "object" && json && "error" in json ? String(json.error) : "Token refresh failed";
			return [new Error(errorMsg)];
		}
		if (typeof json !== "object" || json === null) return [/* @__PURE__ */ new Error("Invalid token response")];
		if (typeof json.access_token !== "string") return [/* @__PURE__ */ new Error("Missing access_token in response")];
		if (json.token_type !== "Bearer") return [/* @__PURE__ */ new Error("Invalid token_type in response")];
		if (typeof json.expires_in !== "number") return [/* @__PURE__ */ new Error("Missing expires_in in response")];
		return [null, json];
	}
	0 && (module.exports = {
		processTokenResponse,
		refreshTokenRequest
	});
}));
//#endregion
//#region node_modules/@vercel/oidc/dist/token-util.js
var require_token_util = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var token_util_exports = {};
	__export(token_util_exports, {
		assertVercelOidcTokenResponse: () => assertVercelOidcTokenResponse,
		findProjectInfo: () => findProjectInfo,
		getTokenPayload: () => getTokenPayload,
		getVercelDataDir: () => getVercelDataDir,
		getVercelOidcToken: () => getVercelOidcToken,
		getVercelToken: () => getVercelToken,
		isExpired: () => isExpired,
		loadToken: () => loadToken,
		saveToken: () => saveToken
	});
	module.exports = __toCommonJS(token_util_exports);
	var path = __toESM(__require("node:path"));
	var fs = __toESM(__require("node:fs"));
	var import_token_error = require_token_error();
	var import_token_io = require_token_io();
	var import_auth_config = require_auth_config();
	var import_oauth = require_oauth();
	var import_auth_errors = require_auth_errors();
	function getVercelDataDir() {
		const vercelFolder = "com.vercel.cli";
		const dataDir = (0, import_token_io.getUserDataDir)();
		if (!dataDir) return null;
		return path.join(dataDir, vercelFolder);
	}
	async function getVercelToken(options) {
		const authConfig = (0, import_auth_config.readAuthConfig)();
		if (!authConfig?.token) throw new import_auth_errors.AccessTokenMissingError();
		if ((0, import_auth_config.isValidAccessToken)(authConfig, options?.expirationBufferMs)) return authConfig.token;
		if (!authConfig.refreshToken) {
			(0, import_auth_config.writeAuthConfig)({});
			throw new import_auth_errors.RefreshAccessTokenFailedError("No refresh token available");
		}
		try {
			const tokenResponse = await (0, import_oauth.refreshTokenRequest)({ refresh_token: authConfig.refreshToken });
			const [tokensError, tokens] = await (0, import_oauth.processTokenResponse)(tokenResponse);
			if (tokensError || !tokens) {
				(0, import_auth_config.writeAuthConfig)({});
				throw new import_auth_errors.RefreshAccessTokenFailedError(tokensError);
			}
			const updatedConfig = {
				token: tokens.access_token,
				expiresAt: Math.floor(Date.now() / 1e3) + tokens.expires_in
			};
			if (tokens.refresh_token) updatedConfig.refreshToken = tokens.refresh_token;
			(0, import_auth_config.writeAuthConfig)(updatedConfig);
			return updatedConfig.token;
		} catch (error) {
			(0, import_auth_config.writeAuthConfig)({});
			if (error instanceof import_auth_errors.AccessTokenMissingError || error instanceof import_auth_errors.RefreshAccessTokenFailedError) throw error;
			throw new import_auth_errors.RefreshAccessTokenFailedError(error);
		}
	}
	async function getVercelOidcToken(authToken, projectId, teamId) {
		const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ""}`;
		const res = await fetch(url, {
			method: "POST",
			headers: { Authorization: `Bearer ${authToken}` }
		});
		if (!res.ok) throw new import_token_error.VercelOidcTokenError(`Failed to refresh OIDC token: ${res.statusText}`);
		const tokenRes = await res.json();
		assertVercelOidcTokenResponse(tokenRes);
		return tokenRes;
	}
	function assertVercelOidcTokenResponse(res) {
		if (!res || typeof res !== "object") throw new TypeError("Vercel OIDC token is malformed. Expected an object. Please run `vc env pull` and try again");
		if (!("token" in res) || typeof res.token !== "string") throw new TypeError("Vercel OIDC token is malformed. Expected a string-valued token property. Please run `vc env pull` and try again");
	}
	function findProjectInfo() {
		const dir = (0, import_token_io.findRootDir)();
		if (!dir) throw new import_token_error.VercelOidcTokenError("Unable to find project root directory. Have you linked your project with `vc link?`");
		const prjPath = path.join(dir, ".vercel", "project.json");
		if (!fs.existsSync(prjPath)) throw new import_token_error.VercelOidcTokenError("project.json not found, have you linked your project with `vc link?`");
		const prj = JSON.parse(fs.readFileSync(prjPath, "utf8"));
		if (typeof prj.projectId !== "string" && typeof prj.orgId !== "string") throw new TypeError("Expected a string-valued projectId property. Try running `vc link` to re-link your project.");
		return {
			projectId: prj.projectId,
			teamId: prj.orgId
		};
	}
	function saveToken(token, projectId) {
		const dir = (0, import_token_io.getUserDataDir)();
		if (!dir) throw new import_token_error.VercelOidcTokenError("Unable to find user data directory. Please reach out to Vercel support.");
		const tokenPath = path.join(dir, "com.vercel.token", `${projectId}.json`);
		const tokenJson = JSON.stringify(token);
		fs.mkdirSync(path.dirname(tokenPath), {
			mode: 504,
			recursive: true
		});
		fs.writeFileSync(tokenPath, tokenJson);
		fs.chmodSync(tokenPath, 432);
	}
	function loadToken(projectId) {
		const dir = (0, import_token_io.getUserDataDir)();
		if (!dir) throw new import_token_error.VercelOidcTokenError("Unable to find user data directory. Please reach out to Vercel support.");
		const tokenPath = path.join(dir, "com.vercel.token", `${projectId}.json`);
		if (!fs.existsSync(tokenPath)) return null;
		const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
		assertVercelOidcTokenResponse(token);
		return token;
	}
	function getTokenPayload(token) {
		const tokenParts = token.split(".");
		if (tokenParts.length !== 3) throw new import_token_error.VercelOidcTokenError("Invalid token. Please run `vc env pull` and try again");
		const base64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
		return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
	}
	function isExpired(token, bufferMs = 0) {
		return token.exp * 1e3 < Date.now() + bufferMs;
	}
	0 && (module.exports = {
		assertVercelOidcTokenResponse,
		findProjectInfo,
		getTokenPayload,
		getVercelDataDir,
		getVercelOidcToken,
		getVercelToken,
		isExpired,
		loadToken,
		saveToken
	});
}));
//#endregion
//#region node_modules/@ai-sdk/gateway/dist/index.js
var import_dist = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __export = (target, all) => {
		for (var name in all) __defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	};
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") {
			for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: () => from[key],
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
	var src_exports = {};
	__export(src_exports, {
		AccessTokenMissingError: () => import_auth_errors.AccessTokenMissingError,
		RefreshAccessTokenFailedError: () => import_auth_errors.RefreshAccessTokenFailedError,
		getContext: () => import_get_context.getContext,
		getVercelOidcToken: () => import_get_vercel_oidc_token.getVercelOidcToken,
		getVercelOidcTokenSync: () => import_get_vercel_oidc_token.getVercelOidcTokenSync,
		getVercelToken: () => import_token_util.getVercelToken
	});
	module.exports = __toCommonJS(src_exports);
	var import_get_vercel_oidc_token = require_get_vercel_oidc_token();
	var import_get_context = require_get_context();
	var import_auth_errors = require_auth_errors();
	var import_token_util = require_token_util();
	0 && (module.exports = {
		AccessTokenMissingError,
		RefreshAccessTokenFailedError,
		getContext,
		getVercelOidcToken,
		getVercelOidcTokenSync,
		getVercelToken
	});
})))();
/**
* Shared WebSocket subprotocol contract for AI Gateway realtime, streaming
* transcription, and streaming speech auth.
*
* The browser `WebSocket` API cannot set request headers, so the Gateway auth
* (bearer) token is carried through the `Sec-WebSocket-Protocol` handshake
* instead of an `Authorization` header — the same workaround OpenAI uses for
* `openai-insecure-api-key.<token>`.
*
* This module is the single source of truth for that contract so the client and
* the Gateway server can't drift: the client encodes values with
* `getGatewayRealtimeProtocols` / `getGatewayTranscriptionProtocols` /
* `getGatewaySpeechProtocols`, and the
* Gateway server decodes them with `getGatewayRealtimeAuthToken` /
* `getGatewayRealtimeTeamIdOrSlug`.
*
* WebSocket subprotocol values must fit the RFC token grammar. The auth token is
* sent as-is, so callers must use tokens that are valid subprotocol tokens; the
* optional team scope is base64url-encoded by this module. Keep the complete
* `Sec-WebSocket-Protocol` header compact (target under an 8 KiB safe header
* budget) because intermediaries may reject large upgrade headers.
*/
/**
* Marker subprotocol offered on every realtime handshake so the Gateway can
* echo a negotiated subprotocol on the 101 response (some clients require the
* server to select one of the offered subprotocols).
*/
var GATEWAY_REALTIME_SUBPROTOCOL = "ai-gateway-realtime.v1";
/**
* Marker subprotocol for streaming transcription handshakes (same negotiation
* purpose as `GATEWAY_REALTIME_SUBPROTOCOL`).
*/
var GATEWAY_TRANSCRIPTION_SUBPROTOCOL = "ai-gateway-transcription.v1";
/**
* Marker subprotocol for streaming speech handshakes (same negotiation
* purpose as `GATEWAY_REALTIME_SUBPROTOCOL`).
*/
var GATEWAY_SPEECH_SUBPROTOCOL = "ai-gateway-speech.v1";
/** Subprotocol prefix that carries the Gateway auth (bearer) token. */
var GATEWAY_AUTH_SUBPROTOCOL_PREFIX = "ai-gateway-auth.";
/** Subprotocol prefix that carries optional Vercel team scoping. */
var GATEWAY_TEAM_SUBPROTOCOL_PREFIX = "ai-gateway-team.";
/**
* Client-side: build the WebSocket subprotocols that carry `token` to the
* Gateway. Pass the result as the second argument to `new WebSocket(url, ...)`.
*/
function getGatewayRealtimeProtocols(token, options) {
	return buildGatewayProtocols(GATEWAY_REALTIME_SUBPROTOCOL, token, options);
}
/**
* Client-side: `getGatewayRealtimeProtocols`, but with the streaming
* transcription marker subprotocol.
*/
function getGatewayTranscriptionProtocols(token, options) {
	return buildGatewayProtocols(GATEWAY_TRANSCRIPTION_SUBPROTOCOL, token, options);
}
/**
* Client-side: `getGatewayRealtimeProtocols`, but with the streaming speech
* marker subprotocol.
*/
function getGatewaySpeechProtocols(token, options) {
	return buildGatewayProtocols(GATEWAY_SPEECH_SUBPROTOCOL, token, options);
}
function buildGatewayProtocols(marker, token, options) {
	const protocols = [marker, `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}${token}`];
	if (options?.teamIdOrSlug) protocols.push(`${GATEWAY_TEAM_SUBPROTOCOL_PREFIX}${encodeSubprotocolValue(options.teamIdOrSlug)}`);
	return protocols;
}
function encodeSubprotocolValue(value) {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
var z = {
	any,
	array,
	boolean,
	discriminatedUnion,
	enum: _enum,
	literal,
	json,
	number,
	object,
	record,
	string,
	union,
	unknown
};
var symbol$10 = Symbol.for("vercel.ai.gateway.error");
var GatewayError = class GatewayError extends Error {
	constructor({ message, statusCode = 500, cause, generationId, isRetryable = statusCode != null && (statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500) }) {
		super(generationId ? `${message} [${generationId}]` : message);
		this[symbol$10] = true;
		this.statusCode = statusCode;
		this.cause = cause;
		this.generationId = generationId;
		this.isRetryable = isRetryable;
	}
	/**
	* Checks if the given error is a Gateway Error.
	* @param {unknown} error - The error to check.
	* @returns {boolean} True if the error is a Gateway Error, false otherwise.
	*/
	static isInstance(error) {
		return GatewayError.hasMarker(error);
	}
	static hasMarker(error) {
		return typeof error === "object" && error !== null && symbol$10 in error && error[symbol$10] === true;
	}
};
var name$9 = "GatewayAuthenticationError";
var marker$9 = `vercel.ai.gateway.error.${name$9}`;
var symbol$9 = Symbol.for(marker$9);
/**
* Authentication failed - invalid API key or OIDC token
*/
var GatewayAuthenticationError = class GatewayAuthenticationError extends GatewayError {
	constructor({ message = "Authentication failed", statusCode = 401, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$9] = true;
		this.name = name$9;
		this.type = "authentication_error";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$9 in error;
	}
	/**
	* Creates a contextual error message when authentication fails
	*/
	static createContextualError({ apiKeyProvided, oidcTokenProvided, statusCode = 401, cause, generationId }) {
		let contextualMessage;
		if (apiKeyProvided) contextualMessage = `AI Gateway authentication failed: Invalid API key or token.

Create a new API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys

Provide an API key or Vercel access token via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.`;
		else if (oidcTokenProvided) contextualMessage = `AI Gateway authentication failed: Invalid OIDC token.

Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.

Alternatively, use an API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys
or pass a Vercel access token via the 'apiKey' option.`;
		else contextualMessage = `AI Gateway authentication failed: No authentication provided.

Option 1 - API key:
Create an API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys
Provide via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.

Option 2 - Vercel access token:
Pass a Vercel personal access token or Vercel app access token via the 'apiKey' option.

Option 3 - OIDC token:
Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.`;
		return new GatewayAuthenticationError({
			message: contextualMessage,
			statusCode,
			cause,
			generationId
		});
	}
};
var name$8 = "GatewayInvalidRequestError";
var marker$8 = `vercel.ai.gateway.error.${name$8}`;
var symbol$8 = Symbol.for(marker$8);
/**
* Invalid request - missing headers, malformed data, etc.
*/
var GatewayInvalidRequestError = class extends GatewayError {
	constructor({ message = "Invalid request", statusCode = 400, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$8] = true;
		this.name = name$8;
		this.type = "invalid_request_error";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$8 in error;
	}
};
var name$7 = "GatewayRateLimitError";
var marker$7 = `vercel.ai.gateway.error.${name$7}`;
var symbol$7 = Symbol.for(marker$7);
/**
* Rate limit exceeded.
*/
var GatewayRateLimitError = class extends GatewayError {
	constructor({ message = "Rate limit exceeded", statusCode = 429, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$7] = true;
		this.name = name$7;
		this.type = "rate_limit_exceeded";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$7 in error;
	}
};
var name$6 = "GatewayModelNotFoundError";
var marker$6 = `vercel.ai.gateway.error.${name$6}`;
var symbol$6 = Symbol.for(marker$6);
var modelNotFoundParamSchema = lazySchema(() => zodSchema(z.object({ modelId: z.string() })));
/**
* Model not found or not available
*/
var GatewayModelNotFoundError = class extends GatewayError {
	constructor({ message = "Model not found", statusCode = 404, modelId, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$6] = true;
		this.name = name$6;
		this.type = "model_not_found";
		this.modelId = modelId;
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$6 in error;
	}
};
var name$5 = "GatewayNotFoundError";
var marker$5 = `vercel.ai.gateway.error.${name$5}`;
var symbol$5 = Symbol.for(marker$5);
/**
* Not found - the requested Gateway resource does not exist or is not
* visible to the caller (e.g. an unknown async batch/video job id).
* Distinct from `GatewayModelNotFoundError`, which is model-specific.
*/
var GatewayNotFoundError = class extends GatewayError {
	constructor({ message = "Resource not found", statusCode = 404, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$5] = true;
		this.name = name$5;
		this.type = "not_found";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$5 in error;
	}
};
var name$4 = "GatewayInternalServerError";
var marker$4 = `vercel.ai.gateway.error.${name$4}`;
var symbol$4 = Symbol.for(marker$4);
/**
* Internal server error from the Gateway
*/
var GatewayInternalServerError = class extends GatewayError {
	constructor({ message = "Internal server error", statusCode = 500, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$4] = true;
		this.name = name$4;
		this.type = "internal_server_error";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$4 in error;
	}
};
var name$3 = "GatewayFailedDependencyError";
var marker$3 = `vercel.ai.gateway.error.${name$3}`;
var symbol$3 = Symbol.for(marker$3);
/**
* The request could not be fulfilled because a dependency it relied on was not
* available on the credentials or provider used to serve it (HTTP 424). Not
* retryable — the caller must change the request.
*/
var GatewayFailedDependencyError = class extends GatewayError {
	constructor({ message = "Failed dependency", statusCode = 424, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$3] = true;
		this.name = name$3;
		this.type = "failed_dependency";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$3 in error;
	}
};
var name$2 = "GatewayForbiddenError";
var marker$2 = `vercel.ai.gateway.error.${name$2}`;
var symbol$2 = Symbol.for(marker$2);
var forbiddenParamSchema = lazySchema(() => zodSchema(z.object({ ruleId: z.string() })));
/**
* Forbidden - the request was rejected by policy (e.g. a routing rule),
* not an authentication failure.
*/
var GatewayForbiddenError = class extends GatewayError {
	constructor({ message = "Forbidden", statusCode = 403, cause, generationId, ruleId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol$2] = true;
		this.name = name$2;
		this.type = "forbidden";
		this.ruleId = ruleId;
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$2 in error;
	}
};
var name$1 = "GatewayResponseError";
var marker$1 = `vercel.ai.gateway.error.${name$1}`;
var symbol$1 = Symbol.for(marker$1);
/**
* Gateway response parsing error
*/
var GatewayResponseError = class extends GatewayError {
	constructor({ message = "Invalid response from Gateway", statusCode = 502, response, validationError, cause, generationId, isRetryable } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId,
			isRetryable
		});
		this[symbol$1] = true;
		this.name = name$1;
		this.type = "response_error";
		this.response = response;
		this.validationError = validationError;
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol$1 in error;
	}
};
async function createGatewayErrorFromResponse({ response, statusCode, defaultMessage = "Gateway request failed", cause, authMethod, isRetryable }) {
	const parseResult = await safeValidateTypes({
		value: response,
		schema: gatewayErrorResponseSchema
	});
	if (!parseResult.success) {
		const rawGenerationId = typeof response === "object" && response !== null && "generationId" in response ? response.generationId : void 0;
		return new GatewayResponseError({
			message: `Invalid error response format: ${defaultMessage}`,
			statusCode,
			response,
			validationError: parseResult.error,
			cause,
			generationId: rawGenerationId,
			isRetryable
		});
	}
	const validatedResponse = parseResult.value;
	const errorType = validatedResponse.error.type;
	const message = validatedResponse.error.message;
	const generationId = validatedResponse.generationId ?? void 0;
	switch (errorType) {
		case "authentication_error": return GatewayAuthenticationError.createContextualError({
			apiKeyProvided: authMethod === "api-key",
			oidcTokenProvided: authMethod === "oidc",
			statusCode,
			cause,
			generationId
		});
		case "invalid_request_error": return new GatewayInvalidRequestError({
			message,
			statusCode,
			cause,
			generationId
		});
		case "rate_limit_exceeded": return new GatewayRateLimitError({
			message,
			statusCode,
			cause,
			generationId
		});
		case "model_not_found": {
			const modelResult = await safeValidateTypes({
				value: validatedResponse.error.param,
				schema: modelNotFoundParamSchema
			});
			return new GatewayModelNotFoundError({
				message,
				statusCode,
				modelId: modelResult.success ? modelResult.value.modelId : void 0,
				cause,
				generationId
			});
		}
		case "not_found": return new GatewayNotFoundError({
			message,
			statusCode,
			cause,
			generationId
		});
		case "internal_server_error": return new GatewayInternalServerError({
			message,
			statusCode,
			cause,
			generationId
		});
		case "failed_dependency": return new GatewayFailedDependencyError({
			message,
			statusCode,
			cause,
			generationId
		});
		case "forbidden": {
			const ruleResult = await safeValidateTypes({
				value: validatedResponse.error.param,
				schema: forbiddenParamSchema
			});
			return new GatewayForbiddenError({
				message,
				statusCode,
				cause,
				generationId,
				ruleId: ruleResult.success ? ruleResult.value.ruleId : void 0
			});
		}
		default: return new GatewayInternalServerError({
			message,
			statusCode,
			cause,
			generationId
		});
	}
}
var gatewayErrorResponseSchema = lazySchema(() => zodSchema(z.object({
	error: z.object({
		message: z.string(),
		type: z.string().nullish(),
		param: z.unknown().nullish(),
		code: z.union([z.string(), z.number()]).nullish()
	}),
	generationId: z.string().nullish()
})));
function extractApiCallResponse(error) {
	if (error.data !== void 0) return error.data;
	if (error.responseBody != null) try {
		return secureJsonParse(error.responseBody);
	} catch {
		return error.responseBody;
	}
	return {};
}
var name = "GatewayTimeoutError";
var marker = `vercel.ai.gateway.error.${name}`;
var symbol = Symbol.for(marker);
/**
* Client request timed out before receiving a response.
*/
var GatewayTimeoutError = class GatewayTimeoutError extends GatewayError {
	constructor({ message = "Request timed out", statusCode = 408, cause, generationId } = {}) {
		super({
			message,
			statusCode,
			cause,
			generationId
		});
		this[symbol] = true;
		this.name = name;
		this.type = "timeout_error";
	}
	static isInstance(error) {
		return GatewayError.hasMarker(error) && symbol in error;
	}
	/**
	* Creates a helpful timeout error message with troubleshooting guidance
	*/
	static createTimeoutError({ originalMessage, statusCode = 408, cause, generationId }) {
		const message = `Gateway request timed out: ${originalMessage}

    This is a client-side timeout. To resolve this, increase your timeout configuration: https://vercel.com/docs/ai-gateway/capabilities/video-generation#extending-timeouts-for-node.js`;
		return new GatewayTimeoutError({
			message,
			statusCode,
			cause,
			generationId
		});
	}
};
/**
* Checks if an error is a timeout error from undici.
* Only checks undici-specific error codes to avoid false positives.
*/
function isTimeoutError(error) {
	if (!(error instanceof Error)) return false;
	const errorCode = error.code;
	if (typeof errorCode === "string") return [
		"UND_ERR_HEADERS_TIMEOUT",
		"UND_ERR_BODY_TIMEOUT",
		"UND_ERR_CONNECT_TIMEOUT"
	].includes(errorCode);
	return false;
}
async function asGatewayError(error, authMethod) {
	if (GatewayError.isInstance(error)) return error;
	if (isTimeoutError(error)) return GatewayTimeoutError.createTimeoutError({
		originalMessage: error instanceof Error ? error.message : "Unknown error",
		cause: error
	});
	if (APICallError.isInstance(error)) {
		if (error.cause && isTimeoutError(error.cause)) return GatewayTimeoutError.createTimeoutError({
			originalMessage: error.message,
			cause: error
		});
		return await createGatewayErrorFromResponse({
			response: extractApiCallResponse(error),
			statusCode: error.statusCode ?? 500,
			defaultMessage: "Gateway request failed",
			cause: error,
			authMethod,
			isRetryable: error.isRetryable && (error.statusCode == null || error.statusCode < 400) ? true : void 0
		});
	}
	return await createGatewayErrorFromResponse({
		response: {},
		statusCode: 500,
		defaultMessage: error instanceof Error ? `Gateway request failed: ${error.message}` : "Unknown Gateway error",
		cause: error,
		authMethod
	});
}
var GATEWAY_AUTH_METHOD_HEADER = "ai-gateway-auth-method";
var VERCEL_AI_GATEWAY_TEAM_HEADER = "x-vercel-ai-gateway-team";
async function parseAuthMethod(headers) {
	const result = await safeValidateTypes({
		value: headers[GATEWAY_AUTH_METHOD_HEADER],
		schema: gatewayAuthMethodSchema
	});
	return result.success ? result.value : void 0;
}
var gatewayAuthMethodSchema = lazySchema(() => zodSchema(z.union([z.literal("api-key"), z.literal("oidc")])));
var KNOWN_MODEL_TYPES = [
	"embedding",
	"decision",
	"evaluation",
	"image",
	"language",
	"realtime",
	"reranking",
	"speech",
	"transcription",
	"video"
];
var GatewayFetchMetadata = class {
	constructor(config) {
		this.config = config;
	}
	async getAvailableModels() {
		try {
			const { value } = await getFromApi({
				url: `${this.config.baseURL}/config`,
				validateUrl: false,
				headers: this.config.headers ? await resolve(this.config.headers) : void 0,
				successfulResponseHandler: createJsonResponseHandler(gatewayAvailableModelsResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				fetch: this.config.fetch
			});
			return value;
		} catch (error) {
			throw await asGatewayError(error);
		}
	}
	async getCredits() {
		try {
			const baseUrl = new URL(this.config.baseURL);
			const headers = this.config.headers ? await resolve(this.config.headers) : void 0;
			const url = new URL("/v1/credits", baseUrl.origin);
			const teamIdOrSlug = getTeamIdOrSlug(headers);
			if (teamIdOrSlug) url.searchParams.set(teamIdOrSlug.startsWith("team_") ? "teamId" : "slug", teamIdOrSlug);
			const { value } = await getFromApi({
				url: url.toString(),
				validateUrl: false,
				headers,
				successfulResponseHandler: createJsonResponseHandler(gatewayCreditsResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				fetch: this.config.fetch
			});
			return value;
		} catch (error) {
			throw await asGatewayError(error);
		}
	}
};
function getTeamIdOrSlug(headers) {
	if (!headers) return void 0;
	for (const [name, value] of Object.entries(headers)) if (name.toLowerCase() === "x-vercel-ai-gateway-team") return value?.trim() || void 0;
}
var gatewayAvailableModelsResponseSchema = lazySchema(() => zodSchema(z.object({ models: z.array(z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullish(),
	pricing: z.object({
		input: z.string(),
		output: z.string(),
		input_cache_read: z.string().nullish(),
		input_cache_write: z.string().nullish()
	}).transform(({ input, output, input_cache_read, input_cache_write }) => ({
		input,
		output,
		...input_cache_read ? { cachedInputTokens: input_cache_read } : {},
		...input_cache_write ? { cacheCreationInputTokens: input_cache_write } : {}
	})).nullish(),
	specification: z.object({
		specificationVersion: z.literal("v4"),
		provider: z.string(),
		modelId: z.string()
	}),
	modelType: z.string().nullish()
})).transform((models) => models.filter((m) => m.modelType == null || KNOWN_MODEL_TYPES.includes(m.modelType))) })));
var gatewayCreditsResponseSchema = lazySchema(() => zodSchema(z.object({
	balance: z.string(),
	total_used: z.string()
}).transform(({ balance, total_used }) => ({
	balance,
	totalUsed: total_used
}))));
var GatewaySpendReport = class {
	constructor(config) {
		this.config = config;
	}
	async getSpendReport(params) {
		try {
			const baseUrl = new URL(this.config.baseURL);
			const searchParams = new URLSearchParams();
			searchParams.set("start_date", params.startDate);
			searchParams.set("end_date", params.endDate);
			if (params.groupBy) searchParams.set("group_by", params.groupBy);
			if (params.datePart) searchParams.set("date_part", params.datePart);
			if (params.userId) searchParams.set("user_id", params.userId);
			if (params.model) searchParams.set("model", params.model);
			if (params.provider) searchParams.set("provider", params.provider);
			if (params.credentialType) searchParams.set("credential_type", params.credentialType);
			if (params.tags && params.tags.length > 0) searchParams.set("tags", params.tags.join(","));
			const { value } = await getFromApi({
				url: `${baseUrl.origin}/v1/report?${searchParams.toString()}`,
				validateUrl: false,
				headers: this.config.headers ? await resolve(this.config.headers) : void 0,
				successfulResponseHandler: createJsonResponseHandler(gatewaySpendReportResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				fetch: this.config.fetch
			});
			return value;
		} catch (error) {
			throw await asGatewayError(error);
		}
	}
};
var gatewaySpendReportResponseSchema = lazySchema(() => zodSchema(z.object({ results: z.array(z.object({
	day: z.string().optional(),
	hour: z.string().optional(),
	user: z.string().optional(),
	model: z.string().optional(),
	tag: z.string().optional(),
	provider: z.string().optional(),
	credential_type: z.enum(["byok", "system"]).optional(),
	total_cost: z.number(),
	market_cost: z.number().optional(),
	input_tokens: z.number().optional(),
	output_tokens: z.number().optional(),
	cached_input_tokens: z.number().optional(),
	cache_creation_input_tokens: z.number().optional(),
	reasoning_tokens: z.number().optional(),
	request_count: z.number().optional()
}).transform(({ credential_type, total_cost, market_cost, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens, reasoning_tokens, request_count, ...rest }) => ({
	...rest,
	...credential_type !== void 0 ? { credentialType: credential_type } : {},
	totalCost: total_cost,
	...market_cost !== void 0 ? { marketCost: market_cost } : {},
	...input_tokens !== void 0 ? { inputTokens: input_tokens } : {},
	...output_tokens !== void 0 ? { outputTokens: output_tokens } : {},
	...cached_input_tokens !== void 0 ? { cachedInputTokens: cached_input_tokens } : {},
	...cache_creation_input_tokens !== void 0 ? { cacheCreationInputTokens: cache_creation_input_tokens } : {},
	...reasoning_tokens !== void 0 ? { reasoningTokens: reasoning_tokens } : {},
	...request_count !== void 0 ? { requestCount: request_count } : {}
}))) })));
var GatewayGenerationInfoFetcher = class {
	constructor(config) {
		this.config = config;
	}
	async getGenerationInfo(params) {
		try {
			const { value } = await getFromApi({
				url: `${new URL(this.config.baseURL).origin}/v1/generation?id=${encodeURIComponent(params.id)}`,
				validateUrl: false,
				headers: this.config.headers ? await resolve(this.config.headers) : void 0,
				successfulResponseHandler: createJsonResponseHandler(gatewayGenerationInfoResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				fetch: this.config.fetch
			});
			return value;
		} catch (error) {
			throw await asGatewayError(error);
		}
	}
};
var gatewayGenerationInfoResponseSchema = lazySchema(() => zodSchema(z.object({ data: z.object({
	id: z.string(),
	total_cost: z.number(),
	upstream_inference_cost: z.number(),
	usage: z.number(),
	created_at: z.string(),
	model: z.string(),
	is_byok: z.boolean(),
	provider_name: z.string(),
	streamed: z.boolean(),
	finish_reason: z.string(),
	latency: z.number(),
	generation_time: z.number(),
	native_tokens_prompt: z.number(),
	native_tokens_completion: z.number(),
	native_tokens_reasoning: z.number(),
	native_tokens_cached: z.number(),
	native_tokens_cache_creation: z.number(),
	billable_web_search_calls: z.number()
}).transform(({ total_cost, upstream_inference_cost, created_at, is_byok, provider_name, finish_reason, generation_time, native_tokens_prompt, native_tokens_completion, native_tokens_reasoning, native_tokens_cached, native_tokens_cache_creation, billable_web_search_calls, ...rest }) => ({
	...rest,
	totalCost: total_cost,
	upstreamInferenceCost: upstream_inference_cost,
	createdAt: created_at,
	isByok: is_byok,
	providerName: provider_name,
	finishReason: finish_reason,
	generationTime: generation_time,
	promptTokens: native_tokens_prompt,
	completionTokens: native_tokens_completion,
	reasoningTokens: native_tokens_reasoning,
	cachedTokens: native_tokens_cached,
	cacheCreationTokens: native_tokens_cache_creation,
	billableWebSearchCalls: billable_web_search_calls
})) }).transform(({ data }) => data)));
var GatewayBatch = class {
	constructor(config) {
		this.config = config;
		this.specificationVersion = "v4";
		this.supportedUrls = { "*/*": [/.*/] };
		this.provider = `${config.provider}.batch`;
	}
	/**
	* Starts a durable batch of text-generation requests through the Gateway's
	* async batch surface (`POST {baseURL}/batch/start`). The returned
	* `batchId` is the Gateway job id — provider-native batch ids stay
	* server-side, so status and results always route back through the
	* Gateway job.
	*/
	async doStartBatch({ requests, providerOptions, headers, abortSignal, webhookUrl }) {
		assertTextBatchRequests(requests);
		const modelId = validateSingleModel(requests);
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		const idempotencyKey = getGatewayBatchIdempotencyKey(providerOptions);
		const forwardedProviderOptions = omitGatewayIdempotencyKey(providerOptions);
		try {
			const { value: responseBody } = await postJsonToApi({
				url: this.getBatchUrl("start"),
				headers: combineHeaders(resolvedHeaders, headers, { "ai-model-id": modelId }, await resolve(this.config.o11yHeaders), idempotencyKey != null ? { "idempotency-key": idempotencyKey } : void 0),
				body: {
					...webhookUrl != null && { callbackUrl: webhookUrl },
					requests: requests.map((request) => ({
						id: request.id,
						type: request.type,
						modelId: request.modelId,
						options: maybeEncodeBatchFileParts(request.options)
					})),
					...forwardedProviderOptions != null && { providerOptions: forwardedProviderOptions }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayBatchStartResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				batchId: responseBody.batchId,
				...convertGatewayBatchStatus(responseBody),
				warnings: responseBody.warnings ?? []
			};
		} catch (error) {
			if (isAbortOrTimeoutError(error)) throw error;
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	/**
	* Retrieves the lifecycle status of a Gateway batch job
	* (`POST {baseURL}/batch/status`).
	*/
	async doGetBatchStatus({ batchId, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { value: responseBody } = await postJsonToApi({
				url: this.getBatchUrl("status"),
				headers: combineHeaders(resolvedHeaders, headers, await resolve(this.config.o11yHeaders)),
				body: { batchId },
				successfulResponseHandler: createJsonResponseHandler(gatewayBatchStatusResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return convertGatewayBatchStatus(responseBody);
		} catch (error) {
			if (isAbortOrTimeoutError(error)) throw error;
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	/**
	* Streams the per-request results of a terminal Gateway batch job
	* (`POST {baseURL}/batch/results`, `application/x-ndjson`: one
	* `BatchV4ItemResult` JSON object per line). Items are validated minimally
	* (id + status) and passed through — the Gateway sanitizes them
	* server-side. The route responds 400 while the batch is non-terminal.
	*/
	async doGetBatchResults({ batchId, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { value: lines } = await postJsonToApi({
				url: this.getBatchUrl("results"),
				headers: combineHeaders(resolvedHeaders, headers, await resolve(this.config.o11yHeaders)),
				body: { batchId },
				successfulResponseHandler: createJsonLinesResponseHandler(gatewayBatchItemResultLineSchema, { maxLineBytes: this.config.maxLineBytes }),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return convertAsyncIteratorToReadableStream(convertGatewayBatchResultLines(lines));
		} catch (error) {
			if (isAbortOrTimeoutError(error)) throw error;
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	/** Requests cancellation; status and partial results remain separate reads. */
	async doCancelBatch({ batchId, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { value: responseBody } = await postJsonToApi({
				url: this.getBatchUrl("cancel"),
				headers: combineHeaders(resolvedHeaders, headers, await resolve(this.config.o11yHeaders)),
				body: { batchId },
				successfulResponseHandler: createJsonResponseHandler(gatewayBatchStatusResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return { ...responseBody.providerMetadata != null && { providerMetadata: responseBody.providerMetadata } };
		} catch (error) {
			if (isAbortOrTimeoutError(error)) throw error;
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	getBatchUrl(path) {
		return `${this.config.baseURL}/batch/${path}`;
	}
};
function maybeEncodeBatchFileParts(options) {
	for (const message of options.prompt) {
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) if (part.type === "file" || part.type === "reasoning-file") part.data = maybeBase64EncodeFileData$1(part.data);
		else if (part.type === "tool-result" && part.output.type === "content") {
			for (const contentPart of part.output.value) if (contentPart.type === "file") contentPart.data = maybeBase64EncodeFileData$1(contentPart.data);
		}
	}
	return options;
}
function maybeBase64EncodeFileData$1(data) {
	if (data.type === "data") {
		const bytes = data.data;
		if (bytes instanceof Uint8Array) return {
			...data,
			data: Buffer.from(bytes).toString("base64")
		};
	}
	return data;
}
function validateSingleModel(requests) {
	const modelId = requests[0]?.modelId;
	if (modelId == null) throw new InvalidArgumentError({
		argument: "requests",
		message: "The AI Gateway Batch API requires at least one request."
	});
	for (const request of requests) if (request.modelId !== modelId) throw new InvalidArgumentError({
		argument: "requests",
		message: `The AI Gateway Batch API requires all requests in a batch to use the same model. Found "${modelId}" and "${request.modelId}".`
	});
	return modelId;
}
function assertTextBatchRequests(requests) {
	for (const request of requests) {
		const requestType = request.type;
		if (requestType !== "text") throw new UnsupportedFunctionalityError({
			functionality: `batch request type: ${requestType}`,
			message: `The AI Gateway Batch API does not support batch requests with type "${requestType}".`
		});
	}
}
/**
* Extracts the optional Gateway idempotency key from
* `providerOptions.gateway.idempotencyKey`. It is sent as the
* `idempotency-key` request header — the Gateway's replay contract for batch
* starts — and stripped from the forwarded body by
* `omitGatewayIdempotencyKey`.
*/
function getGatewayBatchIdempotencyKey(providerOptions) {
	const gatewayOptions = providerOptions?.gateway;
	if (gatewayOptions == null || typeof gatewayOptions !== "object" || Array.isArray(gatewayOptions)) return;
	const key = gatewayOptions.idempotencyKey;
	return typeof key === "string" && key.length > 0 ? key : void 0;
}
/**
* Removes `gateway.idempotencyKey` from the providerOptions forwarded in the
* request body. The key is transport metadata (it rides the `idempotency-key`
* header); the Gateway hashes the raw body for replay payload identity but
* normalizes the header separately, so keeping it out of the payload prevents
* equivalent retries from producing different digests (a false 422).
*/
function omitGatewayIdempotencyKey(providerOptions) {
	const gatewayOptions = providerOptions?.gateway;
	if (gatewayOptions == null || typeof gatewayOptions !== "object" || Array.isArray(gatewayOptions) || !("idempotencyKey" in gatewayOptions)) return providerOptions;
	const { idempotencyKey: _idempotencyKey, ...restGatewayOptions } = gatewayOptions;
	const restProviderOptions = { ...providerOptions };
	if (Object.keys(restGatewayOptions).length === 0) delete restProviderOptions.gateway;
	else restProviderOptions.gateway = restGatewayOptions;
	if (Object.keys(restProviderOptions).length === 0) return;
	return restProviderOptions;
}
/**
* Matches cancellation errors (`AbortError`/`TimeoutError`), which
* `asGatewayError` would otherwise wrap into a retryable Gateway 500. Kept
* local because `isAbortError` is not exported from `@ai-sdk/provider-utils`;
* `DOMException` does not extend `Error`, so both must be checked.
*/
function isAbortOrTimeoutError(error) {
	if (!(error instanceof Error || error instanceof DOMException)) return false;
	return error.name === "AbortError" || error.name === "TimeoutError";
}
function convertGatewayBatchStatus(body) {
	const requestCounts = normalizeBatchRequestCounts({
		total: body.requestCounts?.total,
		pending: body.requestCounts?.pending,
		completed: body.requestCounts?.completed,
		failed: body.requestCounts?.failed
	});
	return {
		status: body.status,
		...body.rawStatus != null && { rawStatus: body.rawStatus },
		...requestCounts != null && { requestCounts },
		...body.error != null && { error: {
			message: body.error.message,
			...body.error.type != null && { type: body.error.type },
			...body.error.code != null && { code: body.error.code },
			...body.error.statusCode != null && { statusCode: body.error.statusCode }
		} },
		...body.createdAt != null && { createdAt: body.createdAt },
		...body.expiresAt != null && { expiresAt: body.expiresAt },
		...body.providerMetadata != null && { providerMetadata: body.providerMetadata }
	};
}
/**
* Converts the minimally validated Gateway batch result lines. The Gateway
* already sanitizes the complete result objects server-side.
*
* @yields Each Gateway batch item result.
*/
async function* convertGatewayBatchResultLines(lines) {
	for await (const line of lines) {
		const item = line;
		if (item.status === "succeeded") {
			const response = item.result?.response;
			if (response !== void 0 && typeof response.timestamp === "string") response.timestamp = new Date(response.timestamp);
		}
		yield item;
	}
}
var gatewayBatchItemResultLineSchema = lazySchema(() => zodSchema(z.object({
	type: z.literal("text"),
	id: z.string(),
	status: z.enum([
		"cancelled",
		"expired",
		"failed",
		"succeeded"
	])
}).catchall(z.unknown())));
var gatewayBatchErrorSchema = () => z.object({
	message: z.string(),
	type: z.string().nullish(),
	code: z.string().nullish(),
	statusCode: z.number().nullish()
});
var gatewayBatchRequestCountsSchema = () => z.object({
	total: z.number().nullish(),
	pending: z.number().nullish(),
	completed: z.number().nullish(),
	failed: z.number().nullish()
});
var gatewayBatchProviderMetadataSchema = () => z.record(z.string(), z.record(z.string(), z.unknown()));
var gatewayBatchStatusFieldsSchema = () => z.object({
	status: z.enum([
		"completed",
		"failed",
		"pending"
	]),
	rawStatus: z.string().nullish(),
	requestCounts: gatewayBatchRequestCountsSchema().nullish(),
	error: gatewayBatchErrorSchema().nullish(),
	createdAt: z.string().nullish(),
	expiresAt: z.string().nullish(),
	providerMetadata: gatewayBatchProviderMetadataSchema().nullish()
});
var gatewayBatchStartResponseSchema = lazySchema(() => zodSchema(gatewayBatchStatusFieldsSchema().extend({
	batchId: z.string(),
	warnings: z.array(z.object({
		requestId: z.string().nullish(),
		warning: z.unknown()
	}).catchall(z.unknown())).nullish()
})));
var gatewayBatchStatusResponseSchema = lazySchema(() => zodSchema(gatewayBatchStatusFieldsSchema()));
var GatewayLanguageModel = class GatewayLanguageModel {
	static [WORKFLOW_SERIALIZE](model) {
		return serializeModelOptions({
			modelId: model.modelId,
			config: model.config
		});
	}
	static [WORKFLOW_DESERIALIZE](options) {
		return new GatewayLanguageModel(options.modelId, options.config);
	}
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
		this.supportedUrls = { "*/*": [/.*/] };
	}
	get provider() {
		return this.config.provider;
	}
	async getArgs(options) {
		const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;
		return {
			args: this.maybeEncodeFileParts(optionsWithoutSignal),
			warnings: []
		};
	}
	async doGenerate(options) {
		const { args, warnings } = await this.getArgs(options);
		const { abortSignal } = options;
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue: rawResponse } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, options.headers, this.getModelConfigHeaders(this.modelId, false), await resolve(this.config.o11yHeaders)),
				body: args,
				successfulResponseHandler: createJsonResponseHandler(z.any()),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				...responseBody,
				request: { body: args },
				response: {
					headers: responseHeaders,
					body: rawResponse
				},
				warnings: [...responseBody.warnings ?? [], ...warnings]
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	async doStream(options) {
		const { args, warnings } = await this.getArgs(options);
		const { abortSignal } = options;
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { value: response, responseHeaders } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, options.headers, this.getModelConfigHeaders(this.modelId, true), await resolve(this.config.o11yHeaders)),
				body: args,
				successfulResponseHandler: createEventSourceResponseHandler(z.any()),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				stream: response.pipeThrough(new TransformStream({
					start(controller) {
						if (warnings.length > 0) controller.enqueue({
							type: "stream-start",
							warnings
						});
					},
					transform(chunk, controller) {
						if (chunk.success) {
							const streamPart = chunk.value;
							if (streamPart.type === "raw" && !options.includeRawChunks) return;
							if (streamPart.type === "response-metadata" && streamPart.timestamp && typeof streamPart.timestamp === "string") streamPart.timestamp = new Date(streamPart.timestamp);
							controller.enqueue(streamPart);
						} else controller.error(chunk.error);
					}
				})),
				request: { body: args },
				response: { headers: responseHeaders }
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	/**
	* Encodes inline `Uint8Array` file data to a base64 string in place.
	* @param options - The options to encode.
	* @returns The options with the file data encoded.
	*/
	maybeEncodeFileParts(options) {
		for (const message of options.prompt) {
			if (!Array.isArray(message.content)) continue;
			for (const part of message.content) if (part.type === "file" || part.type === "reasoning-file") part.data = maybeBase64EncodeFileData(part.data);
			else if (part.type === "tool-result" && part.output.type === "content") {
				for (const contentPart of part.output.value) if (contentPart.type === "file") contentPart.data = maybeBase64EncodeFileData(contentPart.data);
			}
		}
		return options;
	}
	getUrl() {
		return `${this.config.baseURL}/language-model`;
	}
	getModelConfigHeaders(modelId, streaming) {
		return {
			"ai-language-model-specification-version": "4",
			"ai-language-model-id": modelId,
			"ai-language-model-streaming": String(streaming)
		};
	}
};
function maybeBase64EncodeFileData(data) {
	if (data.type === "data") {
		const bytes = data.data;
		if (bytes instanceof Uint8Array) return {
			...data,
			data: Buffer.from(bytes).toString("base64")
		};
	}
	return data;
}
var GatewayEmbeddingModel = class GatewayEmbeddingModel {
	static [WORKFLOW_SERIALIZE](model) {
		return serializeModelOptions({
			modelId: model.modelId,
			config: model.config
		});
	}
	static [WORKFLOW_DESERIALIZE](options) {
		return new GatewayEmbeddingModel(options.modelId, options.config);
	}
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
		this.maxEmbeddingsPerCall = 2048;
		this.supportsParallelCalls = true;
	}
	get provider() {
		return this.config.provider;
	}
	async doEmbed({ values, dimensions, headers, abortSignal, providerOptions }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					values,
					dimensions,
					...providerOptions ? { providerOptions } : {}
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayEmbeddingResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				embeddings: responseBody.embeddings,
				usage: responseBody.usage ?? void 0,
				providerMetadata: responseBody.providerMetadata,
				response: {
					headers: responseHeaders,
					body: rawValue
				},
				warnings: responseBody.warnings ?? []
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	getUrl() {
		return `${this.config.baseURL}/embedding-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-embedding-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
var gatewayEmbeddingWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayEmbeddingResponseSchema = lazySchema(() => zodSchema(z.object({
	embeddings: z.array(z.array(z.number())),
	usage: z.object({ tokens: z.number() }).nullish(),
	warnings: z.array(gatewayEmbeddingWarningSchema()).optional(),
	providerMetadata: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
})));
var GatewayImageModel = class GatewayImageModel {
	static [WORKFLOW_SERIALIZE](model) {
		return serializeModelOptions({
			modelId: model.modelId,
			config: model.config
		});
	}
	static [WORKFLOW_DESERIALIZE](options) {
		return new GatewayImageModel(options.modelId, options.config);
	}
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
		this.maxImagesPerCall = Number.MAX_SAFE_INTEGER;
	}
	get provider() {
		return this.config.provider;
	}
	async doGenerate({ prompt, n, size, aspectRatio, seed, files, mask, providerOptions, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					prompt,
					n,
					...size && { size },
					...aspectRatio && { aspectRatio },
					...seed && { seed },
					...providerOptions && { providerOptions },
					...files && { files: files.map((file) => maybeEncodeImageFile(file)) },
					...mask && { mask: maybeEncodeImageFile(mask) }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayImageResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				images: responseBody.images,
				...responseBody.isRetryable != null && { isRetryable: responseBody.isRetryable },
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata,
				response: {
					timestamp: /* @__PURE__ */ new Date(),
					modelId: this.modelId,
					headers: responseHeaders
				},
				...responseBody.usage != null && { usage: {
					inputTokens: responseBody.usage.inputTokens ?? void 0,
					outputTokens: responseBody.usage.outputTokens ?? void 0,
					totalTokens: responseBody.usage.totalTokens ?? void 0
				} }
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	getUrl() {
		return `${this.config.baseURL}/image-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-image-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
function maybeEncodeImageFile(file) {
	if (file.type === "file" && file.data instanceof Uint8Array) return {
		...file,
		data: convertUint8ArrayToBase64(file.data)
	};
	return file;
}
var providerMetadataEntrySchema$3 = () => z.object({ images: z.array(z.unknown()).optional() }).catchall(z.unknown());
var gatewayImageWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayImageUsageSchema = () => z.object({
	inputTokens: z.number().nullish(),
	outputTokens: z.number().nullish(),
	totalTokens: z.number().nullish()
});
var gatewayImageResponseSchema = lazySchema(() => zodSchema(z.object({
	images: z.array(z.string()),
	isRetryable: z.boolean().optional(),
	warnings: z.array(gatewayImageWarningSchema()).optional(),
	providerMetadata: z.record(z.string(), providerMetadataEntrySchema$3()).optional(),
	usage: gatewayImageUsageSchema().optional()
})));
var GatewayVideoModel = class {
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
		this.maxVideosPerCall = Number.MAX_SAFE_INTEGER;
	}
	get provider() {
		return this.config.provider;
	}
	async doGenerate(options) {
		const { headers, abortSignal } = options;
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders), { accept: "text/event-stream" }),
				body: this.buildRequestBody(options),
				successfulResponseHandler: async ({ response, url, requestBodyValues }) => {
					if (response.body == null) throw new APICallError({
						message: "SSE response body is empty",
						url,
						requestBodyValues,
						statusCode: response.status
					});
					const reader = parseJsonEventStream({
						stream: response.body,
						schema: gatewayVideoEventSchema
					}).getReader();
					const { done, value: parseResult } = await reader.read();
					reader.releaseLock();
					if (done || !parseResult) throw new APICallError({
						message: "SSE stream ended without a data event",
						url,
						requestBodyValues,
						statusCode: response.status
					});
					if (!parseResult.success) throw new APICallError({
						message: "Failed to parse video SSE event",
						cause: parseResult.error,
						url,
						requestBodyValues,
						statusCode: response.status
					});
					const event = parseResult.value;
					if (event.type === "error") throw new APICallError({
						message: event.message,
						statusCode: event.statusCode,
						url,
						requestBodyValues,
						responseHeaders: Object.fromEntries([...response.headers]),
						responseBody: JSON.stringify(event),
						data: { error: {
							message: event.message,
							type: event.errorType,
							param: event.param
						} }
					});
					return {
						value: {
							videos: event.videos,
							warnings: event.warnings,
							providerMetadata: event.providerMetadata
						},
						responseHeaders: Object.fromEntries([...response.headers])
					};
				},
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				videos: responseBody.videos,
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response: {
					timestamp: /* @__PURE__ */ new Date(),
					modelId: this.modelId,
					headers: responseHeaders
				}
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	async handleWebhookOption({ webhook }) {
		const { url, received } = await webhook();
		return {
			webhookUrl: url,
			received
		};
	}
	async doStart(options) {
		const { headers, abortSignal, webhookUrl } = options;
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody } = await postJsonToApi({
				url: this.getStartUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					...this.buildRequestBody(options),
					...webhookUrl && { callbackUrl: webhookUrl }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayVideoStartResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				operation: responseBody.operation,
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response: {
					timestamp: /* @__PURE__ */ new Date(),
					modelId: this.modelId,
					headers: responseHeaders
				}
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	async doStatus({ operation, abortSignal, headers }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody } = await postJsonToApi({
				url: this.getStatusUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: { operation },
				successfulResponseHandler: createJsonResponseHandler(gatewayVideoStatusResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			const response = {
				timestamp: /* @__PURE__ */ new Date(),
				modelId: this.modelId,
				headers: responseHeaders
			};
			if (responseBody.status === "completed") return {
				status: "completed",
				videos: responseBody.videos,
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response
			};
			if (responseBody.status === "error") return {
				status: "error",
				error: responseBody.error,
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response
			};
			if (responseBody.status === "cancelled") return {
				status: "error",
				error: "Video generation was cancelled.",
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response
			};
			return {
				status: "pending",
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata ?? void 0,
				response
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	buildRequestBody({ prompt, n, aspectRatio, resolution, duration, fps, seed, generateAudio, image, frameImages, inputReferences, providerOptions }) {
		return {
			prompt,
			n,
			...aspectRatio && { aspectRatio },
			...resolution && { resolution },
			...duration && { duration },
			...fps && { fps },
			...seed && { seed },
			...generateAudio !== void 0 && { generateAudio },
			...providerOptions && { providerOptions },
			...image && { image: maybeEncodeVideoFile(image) },
			...frameImages && { frameImages: frameImages.map((frame) => ({
				...frame,
				image: maybeEncodeVideoFile(frame.image)
			})) },
			...inputReferences && { inputReferences: inputReferences.map((reference) => maybeEncodeVideoFile(reference)) }
		};
	}
	getUrl() {
		return `${this.config.baseURL}/video-model`;
	}
	getStartUrl() {
		return `${this.config.baseURL}/video-model/start`;
	}
	getStatusUrl() {
		return `${this.config.baseURL}/video-model/status`;
	}
	getModelConfigHeaders() {
		return {
			"ai-video-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
function maybeEncodeVideoFile(file) {
	if (file.type === "file" && file.data instanceof Uint8Array) return {
		...file,
		data: convertUint8ArrayToBase64(file.data)
	};
	return file;
}
var providerMetadataEntrySchema$2 = () => z.object({ videos: z.array(z.unknown()).optional() }).catchall(z.unknown());
var gatewayVideoDataSchema = () => z.union([z.object({
	type: z.literal("url"),
	url: z.string(),
	mediaType: z.string()
}), z.object({
	type: z.literal("base64"),
	data: z.string(),
	mediaType: z.string()
})]);
var gatewayVideoWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayVideoEventSchema = lazySchema(() => zodSchema(z.discriminatedUnion("type", [z.object({
	type: z.literal("result"),
	videos: z.array(gatewayVideoDataSchema()),
	warnings: z.array(gatewayVideoWarningSchema()).optional(),
	providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).optional()
}), z.object({
	type: z.literal("error"),
	message: z.string(),
	errorType: z.string(),
	statusCode: z.number(),
	param: z.unknown().nullable()
})])));
var gatewayVideoStartResponseSchema = lazySchema(() => zodSchema(z.object({
	operation: z.unknown(),
	warnings: z.array(gatewayVideoWarningSchema()).nullish(),
	providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).nullish()
})));
var gatewayVideoStatusResponseSchema = lazySchema(() => zodSchema(z.discriminatedUnion("status", [
	z.object({
		status: z.literal("pending"),
		warnings: z.array(gatewayVideoWarningSchema()).nullish(),
		providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).nullish()
	}),
	z.object({
		status: z.literal("completed"),
		videos: z.array(gatewayVideoDataSchema()),
		warnings: z.array(gatewayVideoWarningSchema()).nullish(),
		providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).nullish()
	}),
	z.object({
		status: z.literal("error"),
		error: z.string(),
		providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).nullish()
	}),
	z.object({
		status: z.literal("cancelled"),
		providerMetadata: z.record(z.string(), providerMetadataEntrySchema$2()).nullish()
	})
])));
var gatewayDecisionProviderOptionsSchema = lazySchema(() => zodSchema(z.object({ models: gatewayModelFallbacksSchema().optional() }).catchall(z.unknown())));
var probabilitySchema = () => z.number().finite().min(0).max(1);
var questionSchema = () => z.string().min(1).max(256);
var directConditionSchema = () => z.union([z.object({
	question: questionSchema().optional(),
	confidenceBelow: probabilitySchema()
}).strict(), z.object({
	question: questionSchema().optional(),
	probabilityBetween: z.array(probabilitySchema()).length(2).refine(([minimum, maximum]) => minimum <= maximum, { message: "probabilityBetween minimum must be less than or equal to maximum" })
}).strict()]);
var groupBeyondMaxDepthSchema = () => z.union([
	z.object({ any: z.unknown() }),
	z.object({ all: z.unknown() }),
	z.object({ atLeast: z.unknown() })
]).superRefine((_, context) => {
	context.addIssue({
		code: "custom",
		message: `conditions can be nested at most 5 levels deep`
	});
});
var conditionalModelFallbackSchema = () => z.object({
	model: z.string().min(1),
	when: conditionSchema(1)
}).strict();
var gatewayModelFallbacksSchema = () => z.array(z.union([z.string(), conditionalModelFallbackSchema()])).superRefine((entries, context) => {
	const conditionalIndexes = entries.flatMap((entry, index) => typeof entry === "string" ? [] : [index]);
	if (conditionalIndexes.length > 1) context.addIssue({
		code: "custom",
		message: "models supports at most one conditional decision fallback"
	});
	if (conditionalIndexes[0] !== void 0 && conditionalIndexes[0] !== 0) context.addIssue({
		code: "custom",
		message: "a conditional decision fallback must be the first models entry",
		path: [conditionalIndexes[0]]
	});
});
function conditionSchema(depth) {
	if (depth === 5) return z.union([directConditionSchema(), groupBeyondMaxDepthSchema()]);
	const childConditionSchema = conditionSchema(depth + 1);
	const conditionListSchema = z.array(childConditionSchema).min(1).max(20);
	return z.union([
		directConditionSchema(),
		z.object({ any: conditionListSchema }).strict(),
		z.object({ all: conditionListSchema }).strict(),
		z.object({ atLeast: z.object({
			count: z.number().int().min(1),
			conditions: conditionListSchema
		}).strict().refine(({ count, conditions }) => count <= conditions.length, {
			message: "atLeast count cannot exceed the number of conditions",
			path: ["count"]
		}) }).strict()
	]);
}
var GatewayDecisionModel = class {
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
		this.supportedQuestionTypes = [
			"choice",
			"score",
			"boolean"
		];
	}
	get provider() {
		return this.config.provider;
	}
	/** @deprecated Use `doDecide` instead. */
	doEvaluate(options) {
		return this.doDecide(options);
	}
	async doDecide({ state, questions, maxOutputTokens, reasoning, headers, abortSignal, providerOptions }) {
		const stateParts = toGatewayDecisionState(state);
		const gatewayOptions = await parseProviderOptions({
			provider: "gateway",
			providerOptions,
			schema: gatewayDecisionProviderOptionsSchema
		});
		const validatedProviderOptions = gatewayOptions == null ? providerOptions : {
			...providerOptions,
			gateway: gatewayOptions
		};
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					stateParts,
					questions,
					maxOutputTokens,
					reasoning,
					...validatedProviderOptions ? { providerOptions: validatedProviderOptions } : {}
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayDecisionResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				answers: responseBody.answers,
				...responseBody.rounding ? { rounding: responseBody.rounding } : {},
				...responseBody.usage ? { usage: responseBody.usage } : {},
				warnings: responseBody.warnings ?? [],
				providerMetadata: responseBody.providerMetadata,
				response: {
					modelId: responseBody.model ?? this.modelId,
					headers: responseHeaders,
					body: rawValue
				}
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	getUrl() {
		return `${this.config.baseURL}/decision-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-decision-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
var gatewayDecisionAnswerSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("choice"),
		choice: z.string(),
		probabilities: z.record(z.string(), z.number()).optional()
	}),
	z.object({
		type: z.literal("score"),
		score: z.number(),
		probabilities: z.record(z.string(), z.number()).optional()
	}),
	z.object({
		type: z.literal("boolean"),
		probability: z.number()
	}),
	z.object({ type: z.literal("refusal") })
]);
var gatewayDecisionWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayDecisionResponseSchema = lazySchema(() => zodSchema(z.object({
	answers: z.record(z.string(), gatewayDecisionAnswerSchema()),
	model: z.string().optional(),
	rounding: z.object({
		probabilityDecimals: z.number().optional(),
		scoreDecimals: z.number().optional()
	}).optional(),
	usage: z.object({
		inputTokens: z.number().optional(),
		outputTokens: z.number().optional()
	}).optional(),
	warnings: z.array(gatewayDecisionWarningSchema()).optional(),
	providerMetadata: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
})));
function toGatewayDecisionState(state) {
	return state.map((part) => {
		if (part.type !== "file") return part;
		if (part.data.type !== "data") throw new UnsupportedFunctionalityError({ functionality: `Gateway decision file input: ${part.data.type} data` });
		const { data } = part.data;
		return {
			...part,
			data: {
				type: "data",
				data: typeof data === "string" ? data : convertUint8ArrayToBase64(data)
			}
		};
	});
}
var GatewayRerankingModel = class {
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
	}
	get provider() {
		return this.config.provider;
	}
	async doRerank({ documents, query, topN, headers, abortSignal, providerOptions }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					documents,
					query,
					...topN != null ? { topN } : {},
					...providerOptions ? { providerOptions } : {}
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayRerankingResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				ranking: responseBody.ranking,
				providerMetadata: responseBody.providerMetadata,
				response: {
					headers: responseHeaders,
					body: rawValue
				},
				warnings: responseBody.warnings ?? []
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	getUrl() {
		return `${this.config.baseURL}/reranking-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-reranking-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
var gatewayRerankingWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayRerankingResponseSchema = lazySchema(() => zodSchema(z.object({
	ranking: z.array(z.object({
		index: z.number(),
		relevanceScore: z.number()
	})),
	warnings: z.array(gatewayRerankingWarningSchema()).optional(),
	providerMetadata: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
})));
/**
* `asGatewayError` is async while the WebSocket event handlers are
* synchronous, hence this helper.
*/
async function errorControllerWithGatewayError(controller, error, authMethod) {
	controller.error(await asGatewayError(error, authMethod));
}
/**
* Extract a human-readable message from an `error` stream part's payload for
* the terminal close error.
*/
function getServerErrorMessage(error) {
	if (error != null && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
	return getErrorMessage(error);
}
/** Canonical status codes for server error-part types (no HTTP status exists on the WebSocket). */
var SERVER_ERROR_STATUS_CODES = {
	authentication_error: 401,
	failed_dependency: 424,
	forbidden: 403,
	internal_server_error: 500,
	invalid_request_error: 400,
	model_not_found: 404,
	rate_limit_exceeded: 429
};
/**
* Maps a server error-part payload (`{ message, type }`) to the public
* Gateway error class for its type; unknown shapes keep the generic message.
*/
async function createErrorFromServerErrorPart(error, authMethod, streamLabel = "transcription") {
	if (typeof error === "object" && error != null && "message" in error && typeof error.message === "string" && "type" in error && typeof error.type === "string" && error.type in SERVER_ERROR_STATUS_CODES) return createGatewayErrorFromResponse({
		response: { error: {
			message: error.message,
			type: error.type
		} },
		statusCode: SERVER_ERROR_STATUS_CODES[error.type],
		authMethod
	});
	return /* @__PURE__ */ new Error(`AI Gateway ${streamLabel} stream failed: ${getServerErrorMessage(error)}`);
}
var GatewayTranscriptionModel = class {
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
	}
	get provider() {
		return this.config.provider;
	}
	async doGenerate({ audio, mediaType, providerOptions, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					audio: audio instanceof Uint8Array ? convertUint8ArrayToBase64(audio) : audio,
					mediaType,
					...providerOptions && { providerOptions }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayTranscriptionResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			const warnings = [...responseBody.warnings ?? []];
			if (isXaiTranscriptionModel(this.modelId) && requestsXaiDiarization(providerOptions) && !containsSpeaker(rawValue)) warnings.push({
				type: "unsupported",
				feature: "providerOptions.xai.diarize",
				details: "AI Gateway does not currently expose xAI speaker diarization metadata."
			});
			return {
				text: responseBody.text,
				segments: responseBody.segments ?? [],
				language: responseBody.language ?? void 0,
				durationInSeconds: responseBody.durationInSeconds ?? void 0,
				warnings,
				...responseBody.usage != null && { usage: responseBody.usage },
				providerMetadata: responseBody.providerMetadata,
				response: {
					timestamp: /* @__PURE__ */ new Date(),
					modelId: this.modelId,
					headers: responseHeaders,
					body: rawValue
				}
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	async doStream(options) {
		const currentDate = this.config._internal?.currentDate?.() ?? /* @__PURE__ */ new Date();
		const headers = combineHeaders(await resolve(this.config.headers ?? {}), options.headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders));
		const authMethod = await parseAuthMethod(headers);
		const startFrame = {
			type: TRANSCRIPTION_STREAM_START_FRAME_TYPE,
			inputAudioFormat: options.inputAudioFormat,
			...options.providerOptions != null && { providerOptions: options.providerOptions },
			...options.includeRawChunks != null && { includeRawChunks: options.includeRawChunks }
		};
		return {
			stream: createGatewayTranscriptionStream({
				webSocket: this.config.webSocket,
				url: toGatewayTranscriptionUrl(this.config.baseURL, this.modelId),
				protocols: getProtocolsFromHeaders(headers),
				headers,
				startFrame,
				audio: options.audio,
				abortSignal: options.abortSignal,
				authMethod
			}),
			request: { body: startFrame },
			response: {
				timestamp: currentDate,
				modelId: this.modelId
			}
		};
	}
	getUrl() {
		return `${this.config.baseURL}/transcription-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-transcription-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
function isXaiTranscriptionModel(modelId) {
	return modelId.startsWith("spacexai/") || modelId.startsWith("xai/");
}
function requestsXaiDiarization(providerOptions) {
	return providerOptions?.xai?.diarize === true || providerOptions?.spacexai?.diarize === true;
}
function containsSpeaker(value) {
	if (Array.isArray(value)) return value.some(containsSpeaker);
	if (value == null || typeof value !== "object") return false;
	return Object.entries(value).some(([key, nestedValue]) => key === "speaker" && nestedValue != null || containsSpeaker(nestedValue));
}
/**
* Gateway streaming transcription WebSocket URL: HTTP(S) base upgraded to
* WS(S), model id in `?ai-model-id=` (browser `WebSocket` cannot set headers;
* slash-safe for qualified ids like `openai/gpt-realtime-whisper`).
*/
function toGatewayTranscriptionUrl(baseURL, modelId) {
	const url = new URL(`${baseURL.replace(/^http/, "ws")}/transcription-model`);
	url.searchParams.set("ai-model-id", modelId);
	return url.toString();
}
/**
* Auth-carrying subprotocols from the resolved request headers (bearer token
* + optional team scope). Native `WebSocket` cannot send headers, so auth
* rides the `Sec-WebSocket-Protocol` handshake. Header lookups are
* case-insensitive because `combineHeaders` does not normalize casing and
* callers can pass arbitrary casing via the `headers` option.
*/
function getProtocolsFromHeaders(headers, { marker = GATEWAY_TRANSCRIPTION_SUBPROTOCOL, getProtocols = getGatewayTranscriptionProtocols } = {}) {
	const normalizedHeaders = normalizeHeaders(headers);
	const authorization = normalizedHeaders.authorization;
	const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : void 0;
	return token == null ? [marker] : getProtocols(token, { teamIdOrSlug: normalizedHeaders[VERCEL_AI_GATEWAY_TEAM_HEADER] });
}
/** Audio frames stay under server frame-size limits (envelope rule 7). */
var MAX_AUDIO_FRAME_BYTES = 65536;
function createGatewayTranscriptionStream({ webSocket, url, protocols, headers, startFrame, audio, abortSignal, authMethod }) {
	let finished = false;
	let cleanup = () => {};
	return new ReadableStream({
		start: (controller) => {
			let audioReader;
			let hasServerErrorPart = false;
			let lastServerError;
			let audioStopped = false;
			let connection;
			cleanup = (closeCode) => {
				if (audioReader != null) audioReader.cancel().catch(() => {});
				else audio.cancel().catch(() => {});
				connection?.close(closeCode);
			};
			const stopAudio = () => {
				audioStopped = true;
				if (audioReader != null) {
					audioReader.cancel().catch(() => {});
					audioReader = void 0;
				} else audio.cancel().catch(() => {});
			};
			const finishWithError = (error) => {
				if (finished) return;
				finished = true;
				cleanup();
				errorControllerWithGatewayError(controller, error, authMethod);
			};
			const sendAudio = async (socket) => {
				const reader = audio.getReader();
				audioReader = reader;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done || finished) break;
						const bytes = typeof value === "string" ? convertBase64ToUint8Array(value) : value;
						for (let offset = 0; offset < bytes.length; offset += MAX_AUDIO_FRAME_BYTES) {
							if (finished) break;
							socket.send(bytes.subarray(offset, offset + MAX_AUDIO_FRAME_BYTES));
							await waitForWebSocketBufferDrain(socket);
						}
					}
				} finally {
					reader.releaseLock();
					if (audioReader === reader) audioReader = void 0;
				}
				if (!finished && !audioStopped) socket.send(JSON.stringify({ type: TRANSCRIPTION_STREAM_AUDIO_DONE_FRAME_TYPE }));
			};
			connection = connectToWebSocket({
				url,
				protocols,
				headers,
				webSocket,
				abortSignal,
				onAbort: (reason) => {
					if (finished) return;
					finished = true;
					cleanup();
					controller.error(reason);
				},
				onProcessingError: finishWithError,
				onOpen: (socket) => {
					socket.send(JSON.stringify(startFrame));
					sendAudio(socket).catch(finishWithError);
				},
				onMessageText: (text) => {
					if (finished) return;
					const part = parseTranscriptionStreamPart(text);
					if (part == null) return;
					if (part.type === "finish") {
						finished = true;
						controller.enqueue(part);
						controller.close();
						cleanup(1e3);
						return;
					}
					if (part.type === "error") {
						hasServerErrorPart = true;
						lastServerError = part.error;
						stopAudio();
					}
					controller.enqueue(part);
				},
				onSocketError: () => {
					finishWithError(/* @__PURE__ */ new Error("Connection error on AI Gateway transcription stream"));
				},
				onClose: () => {
					if (hasServerErrorPart) {
						if (finished) return;
						createErrorFromServerErrorPart(lastServerError, authMethod).then(finishWithError);
						return;
					}
					finishWithError(/* @__PURE__ */ new Error("AI Gateway transcription stream closed before a finish part was received"));
				}
			});
		},
		cancel: () => {
			if (finished) return;
			finished = true;
			cleanup();
		}
	});
}
var providerMetadataEntrySchema$1 = () => z.object({}).catchall(z.unknown());
var gatewayTranscriptionWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewayTranscriptionResponseSchema = lazySchema(() => zodSchema(z.object({
	text: z.string(),
	segments: z.array(z.object({
		text: z.string(),
		startSecond: z.number(),
		endSecond: z.number()
	})).optional(),
	language: z.string().nullish(),
	durationInSeconds: z.number().nullish(),
	warnings: z.array(gatewayTranscriptionWarningSchema()).optional(),
	usage: z.record(z.string(), z.json()).optional(),
	providerMetadata: z.record(z.string(), providerMetadataEntrySchema$1()).optional()
})));
var GatewaySpeechModel = class {
	constructor(modelId, config) {
		this.modelId = modelId;
		this.config = config;
		this.specificationVersion = "v4";
	}
	get provider() {
		return this.config.provider;
	}
	async doGenerate({ text, voice, outputFormat, instructions, speed, language, providerOptions, headers, abortSignal }) {
		const resolvedHeaders = this.config.headers ? await resolve(this.config.headers) : void 0;
		try {
			const { responseHeaders, value: responseBody, rawValue } = await postJsonToApi({
				url: this.getUrl(),
				headers: combineHeaders(resolvedHeaders, headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders)),
				body: {
					text,
					...voice && { voice },
					...outputFormat && { outputFormat },
					...instructions && { instructions },
					...speed != null && { speed },
					...language && { language },
					...providerOptions && { providerOptions }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewaySpeechResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				...abortSignal && { abortSignal },
				fetch: this.config.fetch
			});
			return {
				audio: responseBody.audio,
				warnings: responseBody.warnings ?? [],
				...responseBody.usage != null && { usage: responseBody.usage },
				providerMetadata: responseBody.providerMetadata,
				response: {
					timestamp: /* @__PURE__ */ new Date(),
					modelId: this.modelId,
					headers: responseHeaders,
					body: rawValue
				}
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}));
		}
	}
	async doStream(options) {
		const currentDate = this.config._internal?.currentDate?.() ?? /* @__PURE__ */ new Date();
		const headers = combineHeaders(await resolve(this.config.headers ?? {}), options.headers ?? {}, this.getModelConfigHeaders(), await resolve(this.config.o11yHeaders));
		const authMethod = await parseAuthMethod(headers);
		const startFrame = {
			type: SPEECH_STREAM_START_FRAME_TYPE,
			...options.voice != null && { voice: options.voice },
			...options.outputFormat != null && { outputFormat: options.outputFormat },
			...options.instructions != null && { instructions: options.instructions },
			...options.speed != null && { speed: options.speed },
			...options.language != null && { language: options.language },
			...options.providerOptions != null && { providerOptions: options.providerOptions },
			...options.includeRawChunks != null && { includeRawChunks: options.includeRawChunks }
		};
		return {
			stream: createGatewaySpeechStream({
				webSocket: this.config.webSocket,
				url: toGatewaySpeechUrl(this.config.baseURL, this.modelId),
				protocols: getProtocolsFromHeaders(headers, {
					marker: GATEWAY_SPEECH_SUBPROTOCOL,
					getProtocols: getGatewaySpeechProtocols
				}),
				headers,
				startFrame,
				text: options.text,
				abortSignal: options.abortSignal,
				authMethod
			}),
			request: { body: startFrame },
			response: {
				timestamp: currentDate,
				modelId: this.modelId
			}
		};
	}
	getUrl() {
		return `${this.config.baseURL}/speech-model`;
	}
	getModelConfigHeaders() {
		return {
			"ai-speech-model-specification-version": "4",
			"ai-model-id": this.modelId
		};
	}
};
/**
* Gateway streaming speech WebSocket URL: HTTP(S) base upgraded to WS(S),
* model id in `?ai-model-id=` (browser `WebSocket` cannot set headers).
*/
function toGatewaySpeechUrl(baseURL, modelId) {
	const url = new URL(`${baseURL.replace(/^http/, "ws")}/speech-model`);
	url.searchParams.set("ai-model-id", modelId);
	return url.toString();
}
/**
* Keeps text-delta frames under 64 KiB (envelope rule 7) even when JSON
* escapes every code unit as `\uXXXX`.
*/
var MAX_TEXT_DELTA_CODE_UNITS = 8192;
/**
* Splits a long text delta into pieces of at most `MAX_TEXT_DELTA_CODE_UNITS`
* UTF-16 code units without separating a surrogate pair.
*/
function splitTextDelta(delta) {
	const pieces = [];
	let offset = 0;
	while (offset < delta.length) {
		let end = Math.min(offset + MAX_TEXT_DELTA_CODE_UNITS, delta.length);
		const lastCodeUnit = delta.charCodeAt(end - 1);
		if (end < delta.length && lastCodeUnit >= 55296 && lastCodeUnit <= 56319) end--;
		pieces.push(delta.slice(offset, end));
		offset = end;
	}
	return pieces;
}
function createGatewaySpeechStream({ webSocket, url, protocols, headers, startFrame, text, abortSignal, authMethod }) {
	let finished = false;
	let cleanup = () => {};
	return new ReadableStream({
		start: (controller) => {
			let textReader;
			let hasServerErrorPart = false;
			let lastServerError;
			let textStopped = false;
			let connection;
			const cancelText = () => {
				if (textReader != null) {
					textReader.cancel().catch(() => {});
					textReader = void 0;
				} else text.cancel().catch(() => {});
			};
			cleanup = (closeCode) => {
				cancelText();
				connection?.close(closeCode);
			};
			const finishWithError = (error) => {
				if (finished) return;
				finished = true;
				cleanup();
				errorControllerWithGatewayError(controller, error, authMethod);
			};
			const sendText = async (socket) => {
				const reader = text.getReader();
				textReader = reader;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done || finished || textStopped) break;
						let first = true;
						const pieces = splitTextDelta(value.text);
						if (pieces.length === 0 && (value.voice != null || value.providerOptions != null)) pieces.push("");
						for (const delta of pieces) {
							if (finished || textStopped) break;
							const frame = {
								type: SPEECH_STREAM_TEXT_DELTA_FRAME_TYPE,
								delta,
								...value.voice != null && { voice: value.voice },
								...first && value.providerOptions != null && { providerOptions: value.providerOptions }
							};
							first = false;
							socket.send(JSON.stringify(frame));
							await waitForWebSocketBufferDrain(socket);
						}
					}
				} finally {
					reader.releaseLock();
					if (textReader === reader) textReader = void 0;
				}
				if (!finished && !textStopped) socket.send(JSON.stringify({ type: SPEECH_STREAM_TEXT_DONE_FRAME_TYPE }));
			};
			connection = connectToWebSocket({
				url,
				protocols,
				headers,
				webSocket,
				abortSignal,
				onAbort: (reason) => {
					if (finished) return;
					finished = true;
					cleanup();
					controller.error(reason);
				},
				onProcessingError: finishWithError,
				onOpen: (socket) => {
					socket.send(JSON.stringify(startFrame));
					sendText(socket).catch(finishWithError);
				},
				onMessageText: async (messageText) => {
					if (finished) return;
					const part = parseSpeechStreamPart(messageText);
					if (part == null) return;
					if (part.type === "finish") {
						finished = true;
						controller.enqueue(part);
						controller.close();
						cleanup(1e3);
						return;
					}
					if (part.type === "error") {
						hasServerErrorPart = true;
						lastServerError = part.error;
						textStopped = true;
						cancelText();
						part.error = await createErrorFromServerErrorPart(part.error, authMethod, "speech");
						if (finished) return;
					}
					controller.enqueue(part);
				},
				onSocketError: () => {
					finishWithError(/* @__PURE__ */ new Error("Connection error on AI Gateway speech stream"));
				},
				onClose: ({ code, reason }) => {
					if (hasServerErrorPart) {
						if (finished) return;
						createErrorFromServerErrorPart(lastServerError, authMethod, "speech").then(finishWithError);
						return;
					}
					finishWithError(/* @__PURE__ */ new Error("AI Gateway speech stream closed before a finish part was received" + (code != null ? ` (code ${code}${reason ? `: ${reason}` : ""})` : "") + "."));
				}
			});
		},
		cancel: () => {
			if (finished) return;
			finished = true;
			cleanup();
		}
	});
}
var providerMetadataEntrySchema = () => z.object({}).catchall(z.unknown());
var gatewaySpeechWarningSchema = () => z.discriminatedUnion("type", [
	z.object({
		type: z.literal("unsupported"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("compatibility"),
		feature: z.string(),
		details: z.string().optional()
	}),
	z.object({
		type: z.literal("deprecated"),
		setting: z.string(),
		message: z.string()
	}),
	z.object({
		type: z.literal("other"),
		message: z.string()
	})
]);
var gatewaySpeechResponseSchema = lazySchema(() => zodSchema(z.object({
	audio: z.string(),
	warnings: z.array(gatewaySpeechWarningSchema()).optional(),
	usage: z.record(z.string(), z.json()).optional(),
	providerMetadata: z.record(z.string(), providerMetadataEntrySchema()).optional()
})));
/**
* Realtime model backed by the AI Gateway.
*
* The Gateway normalizes realtime exactly like it normalizes every other
* modality: the client speaks the normalized AI SDK realtime protocol and the
* Gateway translates to and from the upstream provider server-side. This model
* is therefore a thin identity codec over that normalized protocol — only the
* connection and authentication are Gateway-specific.
*/
var GatewayRealtimeModel = class {
	constructor(modelId, config) {
		this.specificationVersion = "v4";
		this.modelId = modelId;
		this.provider = config.provider;
		this.config = config;
	}
	/**
	* Mints a single-use, short-lived client secret (`vcst_`) the browser uses to
	* open the realtime WebSocket without ever holding the long-lived Gateway
	* credential. The customer's server calls this (via
	* `gateway.experimental_realtime.getToken`) and hands the returned token to
	* the browser, which connects with it through the `ai-gateway-auth.<token>`
	* subprotocol. `expiresAfterSeconds` is forwarded to the mint endpoint;
	* `sessionConfig` is intentionally unused here — it is applied later via the
	* normalized `session-update` event.
	*/
	async doCreateClientSecret(options) {
		const secret = await this.config.createClientSecret({
			modelId: this.modelId,
			...options?.expiresAfterSeconds != null && { expiresAfterSeconds: options.expiresAfterSeconds }
		});
		return {
			token: secret.token,
			url: toGatewayRealtimeUrl(this.config.baseURL, this.modelId),
			...secret.expiresAt != null && { expiresAt: secret.expiresAt }
		};
	}
	getWebSocketConfig(options) {
		return {
			url: options.url,
			protocols: getGatewayRealtimeProtocols(options.token, { teamIdOrSlug: this.config.teamIdOrSlug })
		};
	}
	parseServerEvent(raw) {
		return raw;
	}
	serializeClientEvent(event) {
		return event;
	}
	buildSessionConfig(config) {
		return config;
	}
};
/**
* Build the Gateway realtime WebSocket URL. The HTTP(S) base URL is upgraded to
* WS(S) and the model id rides the `?ai-model-id=` query — the WS transport of
* the `ai-model-id` header the HTTP routes use, since a browser `WebSocket`
* cannot set headers. The model id is passed through verbatim; the Gateway owns
* resolution (including the bare → `openai/` qualification), exactly like the
* non-realtime routes. The query is slash-safe for qualified ids such as
* `openai/gpt-realtime-2`.
*/
function toGatewayRealtimeUrl(baseURL, modelId) {
	const url = new URL(`${baseURL.replace(/^http/, "ws")}/realtime-model`);
	url.searchParams.set("ai-model-id", modelId);
	return url.toString();
}
var jsonObjectSchema = () => z.record(z.string(), z.unknown());
var browserbaseFetchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.browserbase_fetch",
	inputSchema: lazySchema(() => zodSchema(z.object({
		url: z.string().url().describe("URL of the page to fetch."),
		allow_redirects: z.boolean().optional().describe("Whether to follow HTTP redirects (default: false)."),
		allow_insecure_ssl: z.boolean().optional().describe("Whether to bypass TLS certificate verification (default: false). Only use for trusted hosts."),
		proxies: z.boolean().optional().describe("Whether to route the request through Browserbase proxies (default: false)."),
		format: z.enum([
			"raw",
			"json",
			"markdown"
		]).optional().describe("Output format. raw returns the response body unchanged, markdown returns page content as Markdown, and json returns structured content using schema."),
		schema: jsonObjectSchema().optional().describe("JSON Schema for structured extraction. Only use with format set to json.")
	}))),
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		id: z.string(),
		content: z.union([z.string(), jsonObjectSchema()]),
		contentType: z.string(),
		encoding: z.string(),
		headers: z.record(z.string(), z.string()),
		statusCode: z.number()
	}), z.object({
		error: z.enum([
			"api_error",
			"configuration_error",
			"execution_error",
			"invalid_input",
			"rate_limit",
			"timeout",
			"unknown"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var browserbaseFetch = (config = {}) => browserbaseFetchToolFactory(config);
var browserbaseSearchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.browserbase_search",
	inputSchema: lazySchema(() => zodSchema(z.object({
		query: z.string().min(1).max(200).describe("Web search query. Must be between 1 and 200 characters."),
		num_results: z.number().int().min(1).max(25).optional().describe("Maximum number of results to return (1-25, default: 10).")
	}))),
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		query: z.string(),
		requestId: z.string(),
		results: z.array(z.object({
			id: z.string(),
			title: z.string(),
			url: z.string(),
			author: z.string().optional(),
			favicon: z.string().optional(),
			image: z.string().optional(),
			publishedDate: z.string().optional()
		}))
	}), z.object({
		error: z.enum([
			"api_error",
			"configuration_error",
			"execution_error",
			"invalid_input",
			"rate_limit",
			"timeout",
			"unknown"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var browserbaseSearch = (config = {}) => browserbaseSearchToolFactory(config);
var exaSearchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.exa_search",
	inputSchema: lazySchema(() => zodSchema(z.object({
		query: z.string().describe("Natural-language web search query. This is required."),
		type: z.enum([
			"auto",
			"fast",
			"instant"
		]).optional().describe("Search method. Use auto for the default balance of speed and quality."),
		num_results: z.number().optional().describe("Maximum number of results to return (1-100, default: 10)."),
		category: z.enum([
			"company",
			"people",
			"research paper",
			"news",
			"personal site",
			"financial report"
		]).optional().describe("Optional content category to focus results."),
		user_location: z.string().optional().describe("Two-letter ISO country code such as 'US'."),
		include_domains: z.array(z.string()).optional().describe("Only return results from these domains."),
		exclude_domains: z.array(z.string()).optional().describe("Exclude results from these domains."),
		start_published_date: z.string().optional().describe("Only return links published after this ISO 8601 date."),
		end_published_date: z.string().optional().describe("Only return links published before this ISO 8601 date."),
		contents: z.object({
			text: z.union([z.boolean(), z.object({
				max_characters: z.number().optional(),
				include_html_tags: z.boolean().optional(),
				verbosity: z.enum([
					"compact",
					"standard",
					"full"
				]).optional(),
				include_sections: z.array(z.enum([
					"header",
					"navigation",
					"banner",
					"body",
					"sidebar",
					"footer",
					"metadata"
				])).optional(),
				exclude_sections: z.array(z.enum([
					"header",
					"navigation",
					"banner",
					"body",
					"sidebar",
					"footer",
					"metadata"
				])).optional()
			})]).optional(),
			highlights: z.union([z.boolean(), z.object({
				query: z.string().optional(),
				max_characters: z.number().optional()
			})]).optional(),
			max_age_hours: z.number().optional(),
			livecrawl_timeout: z.number().optional(),
			subpages: z.number().optional(),
			subpage_target: z.union([z.string(), z.array(z.string())]).optional(),
			extras: z.object({
				links: z.number().optional(),
				image_links: z.number().optional()
			}).optional()
		}).optional().describe("Controls extracted page content and freshness.")
	}))),
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		requestId: z.string(),
		searchType: z.string().optional(),
		resolvedSearchType: z.string().optional(),
		results: z.array(z.object({
			title: z.string(),
			url: z.string(),
			id: z.string(),
			publishedDate: z.string().nullable().optional(),
			author: z.string().nullable().optional(),
			image: z.string().nullable().optional(),
			favicon: z.string().nullable().optional(),
			text: z.string().optional(),
			highlights: z.array(z.string()).optional(),
			highlightScores: z.array(z.number()).optional(),
			summary: z.string().optional(),
			subpages: z.array(z.any()).optional(),
			extras: z.object({
				links: z.array(z.string()).optional(),
				imageLinks: z.array(z.string()).optional()
			}).optional()
		})),
		costDollars: z.object({
			total: z.number().optional(),
			search: z.record(z.string(), z.number()).optional()
		}).optional()
	}), z.object({
		error: z.enum([
			"api_error",
			"rate_limit",
			"timeout",
			"invalid_input",
			"configuration_error",
			"execution_error",
			"unknown"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var exaSearch = (config = {}) => exaSearchToolFactory(config);
var parallelSearchModes = [
	"turbo",
	"fast",
	"basic",
	"advanced",
	"one-shot",
	"agentic"
];
var parallelSearchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.parallel_search",
	inputSchema: lazySchema(() => zodSchema(z.object({
		objective: z.string().describe("Natural-language description of the web research goal, including source or freshness guidance and broader context from the task. Maximum 5000 characters."),
		search_queries: z.array(z.string()).optional().describe("Provide 2-3 concise keyword queries, 3-6 words each (max 5, 200 chars each). Strongly recommended; the search runs on these queries."),
		mode: z.enum(parallelSearchModes).optional().describe("Search mode: \"turbo\" and \"fast\" return quickly with shorter excerpts, \"basic\" is balanced (default), \"advanced\" is the most thorough. \"turbo\" supports English and Japanese only. \"one-shot\" and \"agentic\" are deprecated aliases of \"basic\" and \"advanced\"."),
		max_results: z.number().optional().describe("Maximum number of results to return (1-20). Defaults to 10 if not specified."),
		source_policy: z.object({
			include_domains: z.array(z.string()).optional().describe("Domains or domain/path prefixes to restrict results to, without scheme or port. Example: ['wikipedia.org', 'docs.python.org/3']."),
			exclude_domains: z.array(z.string()).optional().describe("Domains or domain/path prefixes to exclude, without scheme or port. Example: ['reddit.com']."),
			after_date: z.string().optional().describe("Only include results published on or after this date. Use an ISO 8601 calendar date formatted YYYY-MM-DD (e.g. 2025-01-01); do not include a time.")
		}).optional().describe("Source policy for controlling which domains to include/exclude and freshness."),
		excerpts: z.object({
			max_chars_per_result: z.number().optional().describe("Maximum characters per result."),
			max_chars_total: z.number().optional().describe("Deprecated: use the top-level max_chars_total.")
		}).optional().describe("Excerpt configuration for controlling result length."),
		max_chars_total: z.number().optional().describe("Maximum total characters across all result excerpts."),
		fetch_policy: z.object({
			max_age_seconds: z.number().optional().describe("Maximum age of cached content in seconds before a live fetch, minimum 600."),
			timeout_seconds: z.number().optional().describe("Timeout in seconds for a live fetch when content is not cached. Capped by the gateway tool timeout."),
			disable_cache_fallback: z.boolean().optional().describe("Return an error instead of older cached content when a live fetch fails.")
		}).optional().describe("Fetch policy for controlling content freshness."),
		location: z.string().optional().describe("ISO 3166-1 alpha-2 country code to localize results, e.g. \"us\".")
	}))),
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		search_id: z.string(),
		results: z.array(z.object({
			url: z.string(),
			title: z.string().nullable().optional(),
			publish_date: z.string().nullable().optional(),
			excerpts: z.array(z.string())
		})),
		warnings: z.array(z.object({
			type: z.string(),
			message: z.string(),
			detail: z.record(z.string(), z.unknown()).nullable().optional()
		})).nullable().optional(),
		usage: z.array(z.object({
			name: z.string(),
			count: z.number().optional()
		})).nullable().optional(),
		session_id: z.string().optional()
	}), z.object({
		error: z.enum([
			"api_error",
			"configuration_error",
			"execution_error",
			"gateway_rate_limit",
			"invalid_input",
			"rate_limit",
			"timeout",
			"unknown",
			"unknown_tool"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var parallelSearch = (config = {}) => parallelSearchToolFactory(config);
var perplexitySearchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.perplexity_search",
	inputSchema: lazySchema(() => zodSchema(z.object({
		query: z.union([z.string(), z.array(z.string())]).describe("Search query (string) or multiple queries (array of up to 5 strings). Multi-query searches return combined results from all queries."),
		max_results: z.number().optional().describe("Maximum number of search results to return (1-20, default: 10)"),
		max_tokens_per_page: z.number().optional().describe("Maximum number of tokens to extract per search result page (256-2048, default: 2048)"),
		max_tokens: z.number().optional().describe("Maximum total tokens across all search results (default: 25000, max: 1000000)"),
		country: z.string().optional().describe("Two-letter ISO 3166-1 alpha-2 country code for regional search results (e.g., 'US', 'GB', 'FR')"),
		search_domain_filter: z.array(z.string()).optional().describe("List of domains to include or exclude from search results (max 20). To include: ['nature.com', 'science.org']. To exclude: ['-example.com', '-spam.net']"),
		search_language_filter: z.array(z.string()).optional().describe("List of ISO 639-1 language codes to filter results (max 10, lowercase). Examples: ['en', 'fr', 'de']"),
		search_after_date: z.string().optional().describe("Include only results published after this date. Format: 'MM/DD/YYYY' (e.g., '3/1/2025'). Cannot be used with search_recency_filter."),
		search_before_date: z.string().optional().describe("Include only results published before this date. Format: 'MM/DD/YYYY' (e.g., '3/15/2025'). Cannot be used with search_recency_filter."),
		last_updated_after_filter: z.string().optional().describe("Include only results last updated after this date. Format: 'MM/DD/YYYY' (e.g., '3/1/2025'). Cannot be used with search_recency_filter."),
		last_updated_before_filter: z.string().optional().describe("Include only results last updated before this date. Format: 'MM/DD/YYYY' (e.g., '3/15/2025'). Cannot be used with search_recency_filter."),
		search_recency_filter: z.enum([
			"day",
			"week",
			"month",
			"year"
		]).optional().describe("Filter results by relative time period. Cannot be used with search_after_date or search_before_date.")
	}))),
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		results: z.array(z.object({
			title: z.string(),
			url: z.string(),
			snippet: z.string(),
			date: z.string().optional(),
			lastUpdated: z.string().optional()
		})),
		id: z.string()
	}), z.object({
		error: z.enum([
			"api_error",
			"rate_limit",
			"timeout",
			"invalid_input",
			"unknown"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var perplexitySearch = (config = {}) => perplexitySearchToolFactory(config);
var takoDataSourceInputSchema = () => z.object({
	count: z.number().optional().describe("Maximum number of data results to return (1-20). When include_contents is true, each additional result adds its own data surcharge."),
	include_contents: z.boolean().optional().describe("Inline rows for each data result. This adds a data surcharge based on row count and dataset source. To estimate cost, search with include_contents disabled and inspect cards.content.export_pricing. This applies to every returned card; limit sources.data.count and sources.data.max_rows to control cost."),
	mode: z.enum(["inline", "url"]).optional().describe("Requested data delivery mode. Search card data is always inline."),
	content_format: z.enum([
		"card_json",
		"csv",
		"json_compact",
		"json_records"
	]).optional().describe("Serialization for inlined card data."),
	max_rows: z.number().optional().describe("Maximum rows to inline per result. Omit to use the allowance in cards.content.export_pricing. A data surcharge applies per 1,000 exported rows; lower values reduce cost."),
	node_ids: z.array(z.string()).optional().describe("Data Graph node IDs to prioritize. Maximum 20."),
	strict: z.boolean().optional().describe("Only return cards matching node_ids. Requires a non-empty node_ids.")
});
var takoWebSourceInputSchema = () => z.object({
	count: z.number().optional().describe("Maximum number of web results to return (1-20)."),
	include_contents: z.boolean().optional().describe("Inline extracted web page text. This can add a data charge."),
	category: z.enum([
		"finance",
		"news",
		"sports"
	]).optional().describe("Optional web-result category filter."),
	include_domains: z.array(z.string()).optional().describe("Only return results from these bare domains."),
	exclude_domains: z.array(z.string()).optional().describe("Exclude results from these bare domains."),
	snippet_max_chars: z.number().optional().describe("Maximum characters in each web-result snippet."),
	highlights: z.boolean().optional().describe("Include highlighted passages in web results. Defaults to true in AI Gateway."),
	article_content_max_chars: z.number().optional().describe("Maximum extracted characters per web page when including contents."),
	published_after: z.string().optional().describe("Keep results published on or after this ISO date (YYYY-MM-DD)."),
	published_before: z.string().optional().describe("Keep results published on or before this ISO date (YYYY-MM-DD).")
});
var takoSearchInputSchema = lazySchema(() => zodSchema(z.object({
	query: z.string().describe("Natural-language search query. Include the entity, metric, and time period. Quote a phrase to force it to one entity, for example \"Tesla\":PRODUCT price."),
	effort: z.enum([
		"deep",
		"fast",
		"instant"
	]).optional().describe("Search effort. fast is the balanced default, instant favors cached results and low latency, and deep broadens retrieval with reranking at higher cost and latency."),
	sources: z.object({
		data: takoDataSourceInputSchema().optional(),
		web: takoWebSourceInputSchema().optional()
	}).optional().describe("Sources to search. Omit to search both curated data and the web. When provided, only keys present are searched."),
	location: z.object({
		latitude: z.number().describe("Latitude between -90 and 90."),
		longitude: z.number().describe("Longitude between -180 and 180.")
	}).optional().describe("End-user coordinates for localized results."),
	country_code: z.string().optional().describe("Two-letter ISO 3166-1 country code, such as 'US'."),
	locale: z.string().optional().describe("BCP-47 locale, such as 'en-US'."),
	timezone: z.string().optional().describe("IANA timezone, such as 'America/New_York'."),
	output_settings: z.object({
		image_dark_mode: z.boolean().optional().describe("Render card preview images in dark mode."),
		force_refresh: z.boolean().optional().describe("Instant-effort only. Request a refreshed instant result.")
	}).optional().describe("Controls card rendering in the search response."),
	include_related: z.number().optional().describe("Maximum related search suggestions to include (1-20).")
})));
var takoDatasetCellSchema = () => z.union([
	z.boolean(),
	z.number(),
	z.string()
]).nullable();
var takoResultContentSchema = () => z.object({
	content_format: z.enum([
		"card_json",
		"csv",
		"json_compact",
		"json_records"
	]).nullish(),
	cost: z.number().optional(),
	data: z.string().nullish(),
	records: z.array(z.record(z.string(), takoDatasetCellSchema())).nullish(),
	dataset: z.object({
		columns: z.array(z.object({
			name: z.string(),
			type: z.enum([
				"boolean",
				"date",
				"datetime",
				"number",
				"string"
			]),
			unit: z.string().nullish()
		})),
		rows: z.array(z.array(takoDatasetCellSchema())),
		total_rows: z.number(),
		truncated: z.boolean(),
		ref: z.string(),
		sources: z.array(z.object({
			name: z.string(),
			index: z.enum(["data", "web"]).optional()
		})),
		provenance: z.enum(["query", "web_extraction"]).optional()
	}).nullish(),
	card_data: z.object({}).passthrough().nullish(),
	card_data_schema: z.object({}).passthrough().nullish(),
	url: z.string().nullish(),
	expires_at: z.string().nullish(),
	total_rows: z.number().nullish(),
	truncated: z.boolean().optional(),
	export_pricing: z.object({
		baseline_usd: z.number(),
		free_rows: z.number(),
		max_rows_ceiling: z.number(),
		row_cpm_usd: z.number()
	}).nullish(),
	manifest: z.array(z.object({
		dtype: z.enum([
			"boolean",
			"date",
			"datetime",
			"number",
			"string"
		]).nullish(),
		entity: z.string().nullish(),
		metric: z.string().nullish(),
		name: z.string().nullish(),
		unit: z.string().nullish()
	})).nullish()
}).passthrough();
var takoCardSchema = () => z.object({
	card_id: z.string().nullish(),
	title: z.string().nullish(),
	description: z.string().nullish(),
	semantic_description: z.string().nullish(),
	webpage_url: z.string().nullish(),
	image_url: z.string().nullish(),
	embed_url: z.string().nullish(),
	sources: z.array(z.object({
		source_name: z.string().nullish(),
		source_description: z.string().nullish(),
		source_index: z.enum(["data", "web"]),
		source_text: z.string().nullish(),
		url: z.string().nullish()
	})).nullish(),
	methodologies: z.array(z.object({
		methodology_name: z.string().nullable(),
		methodology_description: z.string().nullable()
	})).nullish(),
	source_indexes: z.array(z.enum(["data", "web"])).nullish(),
	card_type: z.string().nullish(),
	relevance: z.enum([
		"High",
		"Low",
		"Medium"
	]).nullish(),
	content: takoResultContentSchema().nullish(),
	exportable: z.boolean().optional(),
	nodes: z.array(z.object({
		id: z.string(),
		type: z.enum(["entity", "metric"]),
		name: z.string(),
		description: z.string().nullish()
	})).nullish(),
	metric_definitions: z.array(z.object({
		name: z.string(),
		definition: z.string()
	})).nullish(),
	data_freshness: z.object({
		coverage_end: z.string().nullish(),
		data_as_of: z.string().nullish(),
		last_updated: z.string().nullish()
	}).nullish()
}).passthrough();
var takoWebResultSchema = () => z.object({
	title: z.string(),
	url: z.string(),
	snippet: z.string().nullish(),
	source_name: z.string().nullish(),
	publish_date: z.string().nullish(),
	content: takoResultContentSchema().nullish()
}).passthrough();
var takoSearchToolFactory = createProviderExecutedToolFactory({
	id: "gateway.tako_search",
	inputSchema: takoSearchInputSchema,
	outputSchema: lazySchema(() => zodSchema(z.union([z.object({
		request_id: z.string(),
		cards: z.array(takoCardSchema()).optional(),
		web_results: z.array(takoWebResultSchema()).optional(),
		usage: z.object({
			total_cost_usd: z.number(),
			compute: z.object({ cost_usd: z.number() }).nullish(),
			data: z.object({
				cost_usd: z.number(),
				datasets: z.number()
			}).nullish()
		}).nullish(),
		related: z.array(z.object({}).passthrough()).nullish()
	}).passthrough(), z.object({
		error: z.enum([
			"api_error",
			"configuration_error",
			"execution_error",
			"invalid_input",
			"rate_limit",
			"timeout",
			"unknown_tool"
		]),
		statusCode: z.number().optional(),
		message: z.string()
	})])))
});
var takoSearch = (config = {}) => takoSearchToolFactory(config);
/**
* Gateway-specific provider-defined tools.
*/
var gatewayTools = {
	/**
	* Fetch page content using Browserbase's lightweight Fetch API.
	*
	* Supports raw, Markdown, and schema-driven JSON output as well as redirects,
	* proxy routing, and TLS controls.
	*/
	browserbaseFetch,
	/**
	* Search the web using Browserbase's Search API for fast, structured results.
	*
	* Returns titles, URLs, and available publication metadata without requiring
	* a browser session.
	*/
	browserbaseSearch,
	/**
	* Search the web using Exa for current information and token-efficient
	* excerpts optimized for agent workflows.
	*
	* Supports search type, category, domain, date, location, and content
	* extraction controls.
	*/
	exaSearch,
	/**
	* Search the web using Parallel AI's Search API for LLM-optimized excerpts.
	*
	* Takes a natural language objective and returns relevant excerpts,
	* replacing multiple keyword searches with a single call for broad
	* or complex queries. Supports different search types for depth vs
	* breadth tradeoffs.
	*/
	parallelSearch,
	/**
	* Search the web using Perplexity's Search API for real-time information,
	* news, research papers, and articles.
	*
	* Provides ranked search results with advanced filtering options including
	* domain, language, date range, and recency filters.
	*/
	perplexitySearch,
	/**
	* Search the web and Tako's curated knowledge graph in one call for
	* token-efficient web excerpts and structured data results grounded in
	* premium sources, each with an embed-ready visualization.
	*
	* Supports effort, per-source web and data controls, localization, and inline
	* contents for agents that need to reason over underlying data.
	*/
	takoSearch
};
async function getVercelRequestId() {
	return (0, import_dist.getContext)().headers?.["x-vercel-id"];
}
var VERSION = "4.0.123";
var AI_GATEWAY_PROTOCOL_VERSION = "0.0.1";
/** Response shape of `POST /v1/realtime/client-secrets`. `expiresAt` is epoch seconds. */
var gatewayClientSecretResponseSchema = lazySchema(() => zodSchema(z.object({
	token: z.string(),
	expiresAt: z.number().nullish()
})));
/**
* Create a remote provider instance.
*/
function createGateway(options = {}) {
	let pendingMetadata = null;
	let metadataCache = null;
	const cacheRefreshMillis = options.metadataCacheRefreshMillis ?? 3e5;
	let lastFetchTime = 0;
	const baseURL = withoutTrailingSlash(options.baseURL) ?? "https://ai-gateway.vercel.sh/v4/ai";
	const createAuthHeaders = (auth) => withUserAgentSuffix({
		Authorization: `Bearer ${auth.token}`,
		"ai-gateway-protocol-version": AI_GATEWAY_PROTOCOL_VERSION,
		[GATEWAY_AUTH_METHOD_HEADER]: auth.authMethod,
		...options.teamIdOrSlug != null ? { [VERCEL_AI_GATEWAY_TEAM_HEADER]: options.teamIdOrSlug } : {},
		...options.headers
	}, `ai-sdk-gateway/${VERSION}`);
	const getHeaders = async () => {
		try {
			return createAuthHeaders(await getGatewayAuthToken(options));
		} catch (error) {
			throw GatewayAuthenticationError.createContextualError({
				apiKeyProvided: false,
				oidcTokenProvided: false,
				statusCode: 401,
				cause: error
			});
		}
	};
	const getRealtimeAuthToken = async () => {
		try {
			return await getGatewayAuthToken(options);
		} catch (error) {
			throw GatewayAuthenticationError.createContextualError({
				apiKeyProvided: false,
				oidcTokenProvided: false,
				statusCode: 401,
				cause: error
			});
		}
	};
	const mintClientSecret = async (params) => {
		assertGatewayClientSecretServerEnvironment();
		const auth = await getRealtimeAuthToken();
		const headers = createAuthHeaders(auth);
		const url = new URL("/v1/realtime/client-secrets", baseURL).toString();
		try {
			const { value } = await postJsonToApi({
				url,
				headers,
				body: {
					model: params.modelId,
					...params.routeKind != null && { routeKind: params.routeKind },
					...params.expiresAfterSeconds != null && { expiresIn: params.expiresAfterSeconds }
				},
				successfulResponseHandler: createJsonResponseHandler(gatewayClientSecretResponseSchema),
				failedResponseHandler: createJsonErrorResponseHandler({
					errorSchema: z.any(),
					errorToMessage: (data) => getErrorMessage(data) ?? "unknown error"
				}),
				fetch: options.fetch
			});
			return {
				token: value.token,
				...value.expiresAt != null && { expiresAt: value.expiresAt }
			};
		} catch (error) {
			throw await asGatewayError(error, await parseAuthMethod(headers));
		}
	};
	const createO11yHeaders = () => {
		const deploymentId = loadOptionalSetting({
			settingValue: void 0,
			environmentVariableName: "VERCEL_DEPLOYMENT_ID"
		});
		const environment = loadOptionalSetting({
			settingValue: void 0,
			environmentVariableName: "VERCEL_ENV"
		});
		const region = loadOptionalSetting({
			settingValue: void 0,
			environmentVariableName: "VERCEL_REGION"
		});
		const projectId = loadOptionalSetting({
			settingValue: void 0,
			environmentVariableName: "VERCEL_PROJECT_ID"
		});
		return async () => {
			const requestId = await getVercelRequestId();
			return {
				...deploymentId && { "ai-o11y-deployment-id": deploymentId },
				...environment && { "ai-o11y-environment": environment },
				...region && { "ai-o11y-region": region },
				...requestId && { "ai-o11y-request-id": requestId },
				...projectId && { "ai-o11y-project-id": projectId }
			};
		};
	};
	const createLanguageModel = (modelId) => {
		return new GatewayLanguageModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	const createBatch = () => new GatewayBatch({
		provider: "gateway",
		maxLineBytes: options.batchResultDownloads?.maxLineBytes,
		baseURL,
		headers: getHeaders,
		fetch: options.fetch,
		o11yHeaders: createO11yHeaders()
	});
	const getAvailableModels = async () => {
		const now = options._internal?.currentDate?.().getTime() ?? Date.now();
		if (!pendingMetadata || now - lastFetchTime > cacheRefreshMillis) {
			lastFetchTime = now;
			pendingMetadata = new GatewayFetchMetadata({
				baseURL,
				headers: getHeaders,
				fetch: options.fetch
			}).getAvailableModels().then((metadata) => {
				metadataCache = metadata;
				return metadata;
			}).catch(async (error) => {
				throw await asGatewayError(error, await parseAuthMethod(await getHeaders()));
			});
		}
		return metadataCache ? Promise.resolve(metadataCache) : pendingMetadata;
	};
	const getCredits = async () => {
		return new GatewayFetchMetadata({
			baseURL,
			headers: getHeaders,
			fetch: options.fetch
		}).getCredits().catch(async (error) => {
			throw await asGatewayError(error, await parseAuthMethod(await getHeaders()));
		});
	};
	const getSpendReport = async (params) => {
		return new GatewaySpendReport({
			baseURL,
			headers: getHeaders,
			fetch: options.fetch
		}).getSpendReport(params).catch(async (error) => {
			throw await asGatewayError(error, await parseAuthMethod(await getHeaders()));
		});
	};
	const getGenerationInfo = async (params) => {
		return new GatewayGenerationInfoFetcher({
			baseURL,
			headers: getHeaders,
			fetch: options.fetch
		}).getGenerationInfo(params).catch(async (error) => {
			throw await asGatewayError(error, await parseAuthMethod(await getHeaders()));
		});
	};
	const provider = function(modelId) {
		if (new.target) throw new Error("The Gateway Provider model function cannot be called with the new keyword.");
		return createLanguageModel(modelId);
	};
	provider.specificationVersion = "v4";
	provider.getAvailableModels = getAvailableModels;
	provider.getCredits = getCredits;
	provider.getSpendReport = getSpendReport;
	provider.getGenerationInfo = getGenerationInfo;
	provider.imageModel = (modelId) => {
		return new GatewayImageModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	provider.languageModel = createLanguageModel;
	provider.experimental_batch = createBatch;
	const createEmbeddingModel = (modelId) => {
		return new GatewayEmbeddingModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	provider.embeddingModel = createEmbeddingModel;
	provider.textEmbeddingModel = createEmbeddingModel;
	provider.videoModel = (modelId) => {
		return new GatewayVideoModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	const createRerankingModel = (modelId) => {
		return new GatewayRerankingModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	provider.rerankingModel = createRerankingModel;
	provider.reranking = createRerankingModel;
	const createDecisionModel = (modelId) => {
		return new GatewayDecisionModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders()
		});
	};
	provider.decisionModel = createDecisionModel;
	provider.decision = createDecisionModel;
	provider.evaluationModel = createDecisionModel;
	provider.evaluation = createDecisionModel;
	const createSpeechModel = (modelId) => {
		return new GatewaySpeechModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders(),
			webSocket: options.webSocket
		});
	};
	provider.speechModel = createSpeechModel;
	provider.speech = createSpeechModel;
	provider.experimental_speech = Object.assign((modelId) => createSpeechModel(modelId), { getToken: async (tokenOptions) => {
		const secret = await mintClientSecret({
			modelId: tokenOptions.model,
			routeKind: "speech",
			...tokenOptions.expiresAfterSeconds != null && { expiresAfterSeconds: tokenOptions.expiresAfterSeconds }
		});
		return {
			token: secret.token,
			url: toGatewaySpeechUrl(baseURL, tokenOptions.model),
			...secret.expiresAt != null && { expiresAt: secret.expiresAt }
		};
	} });
	const createTranscriptionModel = (modelId) => {
		return new GatewayTranscriptionModel(modelId, {
			provider: "gateway",
			baseURL,
			headers: getHeaders,
			fetch: options.fetch,
			o11yHeaders: createO11yHeaders(),
			webSocket: options.webSocket
		});
	};
	provider.transcriptionModel = createTranscriptionModel;
	provider.transcription = createTranscriptionModel;
	provider.experimental_transcription = Object.assign((modelId) => createTranscriptionModel(modelId), { getToken: async (tokenOptions) => {
		const secret = await mintClientSecret({
			modelId: tokenOptions.model,
			routeKind: "transcription",
			...tokenOptions.expiresAfterSeconds != null && { expiresAfterSeconds: tokenOptions.expiresAfterSeconds }
		});
		return {
			token: secret.token,
			url: toGatewayTranscriptionUrl(baseURL, tokenOptions.model),
			...secret.expiresAt != null && { expiresAt: secret.expiresAt }
		};
	} });
	const createRealtimeModel = (modelId) => new GatewayRealtimeModel(modelId, {
		provider: "gateway.realtime",
		baseURL,
		teamIdOrSlug: options.teamIdOrSlug,
		createClientSecret: mintClientSecret
	});
	provider.experimental_realtime = Object.assign((modelId) => createRealtimeModel(modelId), { getToken: async (tokenOptions) => {
		const { model: modelId, ...secretOptions } = tokenOptions;
		const secret = await createRealtimeModel(modelId).doCreateClientSecret(secretOptions);
		return {
			token: secret.token,
			url: secret.url,
			...secret.expiresAt != null && { expiresAt: secret.expiresAt }
		};
	} });
	provider.chat = provider.languageModel;
	provider.embedding = provider.embeddingModel;
	provider.image = provider.imageModel;
	provider.video = provider.videoModel;
	provider.tools = gatewayTools;
	return provider;
}
var gateway = createGateway();
async function getGatewayAuthToken(options) {
	const apiKey = loadOptionalSetting({
		settingValue: options.apiKey,
		environmentVariableName: "AI_GATEWAY_API_KEY"
	});
	if (apiKey) return {
		token: apiKey,
		authMethod: "api-key"
	};
	return {
		token: await (0, import_dist.getVercelOidcToken)(),
		authMethod: "oidc"
	};
}
function assertGatewayClientSecretServerEnvironment() {
	if (typeof globalThis.window !== "undefined") throw new Error("AI Gateway client secrets must be minted server-side: minting needs your Gateway credential, which must never reach the browser. Call gateway.experimental_realtime.getToken(), gateway.experimental_transcription.getToken(), or gateway.experimental_speech.getToken() from your server and pass the returned token to the client.");
}
//#endregion
export { isNonNullable as $, union as $t, createNullLanguageModelUsage as A, WORKFLOW_DESERIALIZE as At, executeTool as B, discriminatedUnion as Bt, createBinaryStreamResponseHandler as C, toolCaller as Ct, createJsonLinesResponseHandler as D, withUserAgentSuffix as Dt, createJsonErrorResponseHandler as E, waitForWebSocketBufferDrain as Et, createToolNameMapping as F, _null as Ft, getRuntimeEnvironmentUserAgent as G, looseObject as Gt, filterNullable as H, json as Ht, deleteFromApi as I, any as It, isAbortError as J, object as Jt, getToolCaller as K, never as Kt, detectMediaType as L, array as Lt, createProviderDefinedToolFactoryWithOutputSchema as M, ZodNumber as Mt, createProviderExecutedToolFactory as N, _enum as Nt, createJsonResponseHandler as O, withoutTrailingSlash as Ot, createProviderStreamError as P, _instanceof as Pt, isFullMediaType as Q, tuple as Qt, downloadBlob as R, boolean as Rt, createBinaryResponseHandler as S, toWebSocketUrl as St, createIdGenerator as T, validateTypes as Tt, generateId as U, lazy as Ut, fetchUntrustedUrl as V, intersection as Vt, getFromApi as W, literal as Wt, isCustomReasoning as X, strictObject as Xt, isBuffer as Y, record as Yt, isExecutableTool as Z, string as Zt, convertBase64ToUint8Array as _, resolveProviderReference as _t, require_token_error as a, InvalidPromptError as an, loadApiKey as at, convertToFormData as b, safeValidateTypes as bt, DownloadError as c, UnsupportedFunctionalityError as cn, normalizeBatchRequestCounts as ct, asArray as d, postFormDataToApi as dt, unknown as en, isProviderReference as et, asSchema as f, postJsonToApi as ft, convertAsyncIteratorToReadableStream as g, resolveFullMediaType as gt, connectToWebSocket as h, readResponseWithSizeLimit as ht, require_token_util as i, InvalidArgumentError as in, lazySchema as it, createProviderDefinedToolFactory as j, WORKFLOW_SERIALIZE as jt, createLanguageModelResponseMetadata as k, zodSchema as kt, EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL as l, getErrorMessage as ln, parseJSON as lt, combineHeaders as m, postToApi as mt, GatewayError as n, AISDKError as nn, isRecord as nt, DEFAULT_MAX_DOWNLOAD_SIZE as o, InvalidResponseDataError as on, loadOptionalSetting as ot, cancelResponseBody as p, postMultipartStreamToApi as pt, getTopLevelMediaType as q, number as qt, gateway as r, APICallError as rn, isUrlSupported as rt, DelayedPromise as s, TooManyEmbeddingValuesForCallError as sn, mediaTypeToExtension as st, GatewayAuthenticationError as t, _coercedNumber as tn, isProviderStreamError as tt, StreamingToolCallTracker as u, isJSONObject as un, parseProviderOptions as ut, convertInlineFileDataToUint8Array as v, retryWithExponentialBackoff as vt, createEventSourceResponseHandler as w, validateBaseURL as wt, convertUint8ArrayToBase64 as x, serializeModelOptions as xt, convertToBase64 as y, safeParseJSON as yt, encodePathSegment as z, custom as zt };
