import { r as __toESM } from "../_runtime.mjs";
import { p as Primitive, v as require_jsx_runtime } from "./@radix-ui/react-accordion+[...].mjs";
import { u as require_react } from "./@floating-ui/react-dom+[...].mjs";
//#region node_modules/@radix-ui/react-separator/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", {
	value,
	configurable: true
});
var Orientation = {
	Horizontal: "horizontal",
	Vertical: "vertical"
};
var DEFAULT_ORIENTATION = Orientation.Horizontal;
var ORIENTATIONS = Object.values(Orientation);
var Separator = /* @__PURE__ */ import_react.forwardRef(/* @__PURE__ */ __name(function Separator2(props, forwardedRef) {
	const { decorative, orientation: orientationProp = DEFAULT_ORIENTATION, ...domProps } = props;
	const orientation = isValidOrientation(orientationProp) ? orientationProp : DEFAULT_ORIENTATION;
	const ariaOrientation = orientation === Orientation.Vertical ? orientation : void 0;
	const semanticProps = decorative ? { role: "none" } : {
		"aria-orientation": ariaOrientation,
		role: "separator"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
		"data-orientation": orientation,
		...semanticProps,
		...domProps,
		ref: forwardedRef
	});
}, "Separator"));
function isValidOrientation(orientation) {
	return ORIENTATIONS.includes(orientation);
}
__name(isValidOrientation, "isValidOrientation");
//#endregion
export { Separator as t };
