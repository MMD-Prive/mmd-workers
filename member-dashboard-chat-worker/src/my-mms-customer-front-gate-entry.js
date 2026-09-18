import currentWorker from "./mms-line-front-gate.js";
import {
  handleMyMmsCustomerApi,
  handleMyMmsCustomerAsset,
  handleMyMmsCustomerUi,
  isMyMmsCustomerApiRequest,
  isMyMmsCustomerAssetRequest,
  isMyMmsCustomerUiRequest,
} from "./my-mms-customer-app-front-gate.js";

export * from "./mms-line-front-gate.js";

export default {
  ...currentWorker,
  async fetch(request, env = {}, ctx) {
    if (isMyMmsCustomerApiRequest(request)) return handleMyMmsCustomerApi(request, env);
    if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request);
    if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request);
    return currentWorker.fetch(request, env, ctx);
  },
};
