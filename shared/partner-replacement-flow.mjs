// Uninstalled orchestration contract. No route, storage binding, credential or
// production gate is introduced here. Providers MUST share one durable fence
// with every session writer before this could be used outside a local fixture.
const clone = value => structuredClone(value);
const fail = code => ({ok: false, code});
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const stamp = row => ({generation: row.generation, revision: row.revision, model: row.model,
  partner: row.partner, customer: row.customer, credential: row.credential});
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutPending = row => ({...row, pending: null});
const receiptView = row => ({session_id: row.session_id, generation: row.generation,
  revision: row.revision, state: row.state, customer_ack: row.customer_ack});
const linkError = (link, row, actor, now) => {
  if (!link || link.role !== 'customer' || link.customer !== actor.id || link.session_id !== row.session_id)
    return 'confirmation_link_invalid';
  if (!Number.isFinite(now) || !Number.isFinite(link.expires_at) || link.expires_at <= now)
    return 'confirmation_link_expired';
  if (link.generation !== row.generation || link.revision !== row.revision || link.credential !== row.credential)
    return 'confirmation_link_superseded';
  return null;
};

export function createPartnerReplacementFlow({enabled = false, createProviders} = {}) {
  let providers;
  return async (context, raw) => {
    if (enabled !== true) return fail('runtime_gate_closed');
    providers ??= createProviders?.();
    const p = providers;
    if (!p) return fail('replacement_provider_unavailable');
    const input = clone(raw);
    const allowed = ['action', 'session_id', 'generation', 'revision', 'operation_id', 'next_model', 'link_id'];
    if (!input || Object.keys(input).some(key => !allowed.includes(key)) ||
        !['replace', 'issue_customer_link', 'acknowledge'].includes(input.action) ||
        !id(input.session_id) || !id(input.operation_id) || !id(input.revision) ||
        !Number.isSafeInteger(input.generation) || input.generation < 1 ||
        (input.action === 'replace' ? !id(input.next_model) : input.next_model !== undefined) ||
        (input.action === 'acknowledge' ? !id(input.link_id) : input.link_id !== undefined)) return fail('invalid_request');
    try {
      // Identity comes from the provider, never from form fields or a link URL.
      const actor = await p.resolveActor(context);
      if (!actor) return fail('authentication_required');
      return await p.withSessionFence(input.session_id, async tx => {
        const row = await tx.read();
        if (!row || row.session_id !== input.session_id) return fail('session_not_found');
        const ownerAction = input.action !== 'acknowledge';
        if (ownerAction ? actor.role !== 'owner' || actor.partner !== row.partner :
          actor.role !== 'customer' || actor.id !== row.customer) return fail('ownership_required');
        if (row.pending) return fail('pending_reconciliation');
        if (!['offered', 'confirmed', 'offer_declined', 'offer_expired'].includes(row.state)) return fail('job_already_started');
        const key = JSON.stringify([actor.id, input.operation_id]);
        const fingerprint = JSON.stringify([input.action, input.session_id, input.generation,
          input.revision, input.next_model ?? null, input.link_id ?? null]);
        const saved = await tx.receipt(key);
        if (saved) {
          if (saved.fingerprint !== fingerprint) return fail('operation_conflict');
          if (!equal(saved.after, stamp(row))) return fail('offer_changed');
          return {...clone(saved.result), session: receiptView(row), replay: true};
        }
        if (input.generation !== row.generation || input.revision !== row.revision) return fail('offer_changed');
        if (input.action === 'replace') {
          if (input.next_model === row.model) return fail('model_unchanged');
          // Production owner-edit still rejects Partner settlement edits. Only
          // an explicit provider can supply a review of this exact snapshot.
          const review = await p.reviewReplacement?.(clone(row), clone(input), actor);
          if (!review?.ok) return fail('partner_settlement_review_required');
          if (!equal(review.before, withoutPending(row)) || review.next_model !== input.next_model ||
              review.partner !== row.partner) return fail('replacement_review_stale');
        }
        if (input.action === 'issue_customer_link' && !row.replacement_verified) return fail('replacement_readback_required');
        if (input.action === 'acknowledge') {
          const link = await p.readCustomerLink(input.link_id);
          const code = linkError(link, row, actor, p.now());
          if (code) return fail(code);
          if (row.customer_ack) return {ok: true, session: receiptView(row), replay: true, notification_sent: false};
        }
        const pending = {key, generation: row.generation};
        let attempted = false;
        try {
          await tx.claim(pending);
          // prepare may reject safely. commit is the first attempted external
          // write; failures after that boundary always retain pending.
          const commit = await p.prepare({row: clone(row), input: clone(input), actor});
          const freshLink = input.action === 'acknowledge' ? await p.readCustomerLink(input.link_id) : null;
          if (!await tx.owns(pending)) return fail('pending_reconciliation');
          const fresh = await tx.read();
          if (!equal(withoutPending(fresh), withoutPending(row))) {
            await tx.releaseOwn(pending); return fail('offer_changed');
          }
          // All awaited preparation/read checks precede this final expiry
          // check. A known rejection here has not attempted a write.
          if (input.action === 'acknowledge') {
            const code = linkError(freshLink, fresh, actor, p.now());
            if (code) { await tx.releaseOwn(pending); return fail(code); }
          }
          attempted = true;
          const written = await commit();
          const after = await tx.read();
          if (input.action === 'issue_customer_link' && !id(written?.link_id)) return fail('outcome_unknown');
          if (!await p.verifyReadback({before: clone(row), after: clone(after), input, written}))
            return fail('outcome_unknown');
          // Return safe receipt metadata only. No signed URL or financial data.
          const result = {ok: true, session: receiptView(after), notification_sent: false,
            ...(input.action === 'issue_customer_link' ? {link_id: written.link_id} : {})};
          await tx.complete(pending, key, {fingerprint, after: stamp(after), result});
          return result;
        } catch {
          if (attempted) return fail('outcome_unknown');
          await tx.releaseOwn(pending);
          return fail('prewrite_rejected');
        }
      });
    } catch { return fail('replacement_unavailable'); }
  };
}
