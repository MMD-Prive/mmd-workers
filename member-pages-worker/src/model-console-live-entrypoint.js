import live from '../live-baseline/member-pages-worker.js';
import {handleDoubleMomentCheckout,isDoubleMomentCheckoutRequest} from './double-moment-checkout.js';
import {handleMemberClientCredits,isMemberClientCreditsRequest} from './member-app-client-credits.js';
import {handleMemberAppSessionApi} from './member-app-session.js';
import {readMemberAppSession} from './member-app-api.js';
import {handleLiffPromotionPurchase,isLiffPromotionPurchasePath} from './liff-promotion-purchase.js';
import {applyConsolePresentation} from './model-console-live-presentation.js';

export * from '../live-baseline/member-pages-worker.js';
export {CustomerRequestMutationCoordinator} from './customer-request-mutation-live.js';

// Retain the exact deployed identity/recovery handlers and durable classes.
// Only the existing Console/credit routes use their newer local handlers.
export default {
  ...live,
  async fetch(request,env,ctx) {
    if(isDoubleMomentCheckoutRequest(request))return handleDoubleMomentCheckout(request,env);
    if(isMemberClientCreditsRequest(request))return handleMemberClientCredits(request,env);
    if(isLiffPromotionPurchasePath(request.url))return handleLiffPromotionPurchase(request,env);
    const path=new URL(request.url).pathname.replace(/\/+$/,'');
    if(path==='/api/member/app/session/travel'||path==='/api/member/app/session/travel/photo') {
      return handleMemberAppSessionApi(request,env,readMemberAppSession);
    }
    return applyConsolePresentation(request,await live.fetch(request,env,ctx));
  },
};
