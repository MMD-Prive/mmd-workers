// Synthetic evidence for regression fixtures only. Never production evidence.
import { REVIEW_SCHEMA, REVIEW_ROOT, threeMonthReviewWindow } from './src/compcard-history-review.js';
import { COMPCARD_JOURNAL_ROOT } from './src/compcard-journal.js';
export async function seedSyntheticReview(deps, now, models) {
  for (const model of models) {
    const proof = {schema:REVIEW_SCHEMA,model_id:model.id,timezone:'Asia/Bangkok',revision:'synthetic-regression-only',reviewed_by:'test fixture',reviewed_at:now,
      rooms:Object.entries(deps.manifest.destinations).map(([destination,chat_id])=>({destination,chat_id,status:'verified_complete',manual_posts_included:true,includes_all_authors:true,
        reconciliation_method:'direct_room_history_review',identity_reconciliation_complete:true,unresolved_count:0,from:threeMonthReviewWindow(now).from,through:now,evidence_refs:['synthetic regression evidence only'],observations:[]}))};
    await deps.bucket.put(COMPCARD_JOURNAL_ROOT+REVIEW_ROOT+'models/'+model.id+'.json',JSON.stringify(proof));
  }
}
