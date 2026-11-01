// worker.mjs is the exact preserved live member-renewal-presentation-worker module.
import existing from './worker.mjs';
import {createCheckoutPresentation} from './renewal-checkout-response.mjs';
export default createCheckoutPresentation(existing);
