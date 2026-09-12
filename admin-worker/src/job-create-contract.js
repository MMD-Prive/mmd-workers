// Normalize the nested Create Job form and legacy SIGIL payloads at ingress.
export function normalizeJobCreateBody(input = {}) {
  const body = structuredClone(input);
  const client = body.client || {};
  const lineage = body.client_lineage || {};
  const line = body.line_identity || client.line || {};
  const model = body.model || {};
  const work = body.work || {};
  const details = body.job_details || {};
  const schedule = body.schedule || {};
  const notes = body.notes || {};
  const partnerRelationship = details.partner_relationship || body.partner_relationship || {};
  const settlementOwner = String(partnerRelationship.settlement_owner || '').trim().toLowerCase();
  const settlementMethod = String(partnerRelationship.settlement_method || '').trim().toLowerCase();
  const partnerManaged = settlementOwner === 'modeling_partner' || settlementMethod === 'partner_managed';
  if (partnerManaged) {
    for (const key of ['pay_model_thb', 'pay_model', 'model_pay_thb', 'model_pay', 'model_payout_thb', 'model_payout', 'expected_payout_thb']) {
      delete body[key];
    }
    if (body.payment && typeof body.payment === 'object' && !Array.isArray(body.payment)) {
      body.payment = { ...body.payment };
      for (const key of ['pay_model_thb', 'pay_model', 'model_pay_thb', 'model_pay', 'model_payout_thb', 'model_payout', 'expected_payout_thb']) {
        delete body.payment[key];
      }
    }
    partnerRelationship.model_payout_thb = null;
  }
  const clientId = body.client_record_id || body.client_id || lineage.client_id || client.client_id || '';
  if ((body.canonical_only === true || body.create_context === 'internal_create_job') &&
      (!/^rec[A-Za-z0-9]{14}$/.test(clientId) || lineage.manual_public_only === true || client.manual_public_only === true)) {
    throw new Error('canonical_client_required');
  }
  return {
    ...body,
    client_id: clientId,
    client_record_id: clientId,
    client_name: body.client_name || lineage.client_name || client.name,
    client_lineage: {
      ...lineage, client_id: clientId,
      client_name: body.client_name || lineage.client_name || client.name,
      member_id: lineage.member_id || client.member_id,
      member_email: lineage.member_email || client.email,
    },
    line_identity: {
      ...line, line_record_id: line.line_record_id || line.record_id,
      line_user_id: line.line_user_id || line.user_id,
    },
    model_name: body.model_name || model.model_name,
    model: { ...model, model_lookup_key: model.model_lookup_key || model.lookup_key },
    job_type: body.job_type || work.job_lane || work.work_type || body.work_type,
    job_date: body.job_date || details.job_date || schedule.date,
    start_time: body.start_time || details.start_time || schedule.start,
    end_time: body.end_time || details.end_time || schedule.end,
    location_name: body.location_name || details.location_name || body.location?.text,
    google_map_url: body.google_map_url || details.google_map_url || body.location?.map_url,
    pay_model_thb: partnerManaged ? undefined : (body.pay_model_thb ?? body.model_payout_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay ?? body.payment?.pay_model_thb ?? body.payment?.model_payout_thb),
    private_access: {
      ...(body.private_access || {}),
      selected_private_folder: body.private_access?.selected_private_folder || work.model_folder || body.model_folder,
      selected_orientation: body.private_access?.selected_orientation || body.selected_orientation || body.private_orientation,
    },
    telegram_gate: {
      ...(body.telegram_gate || {}),
      customer_telegram_status: body.telegram_gate?.customer_telegram_status || body.customer_telegram_status || client.telegram?.status,
      model_telegram_status: body.telegram_gate?.model_telegram_status || body.model_telegram_status || model.telegram_status,
    },
    note: body.note || (typeof notes === 'string' ? notes : [notes.operation_note || notes.handling_note || notes.handling, notes.internal].filter(Boolean).join('\n')),
  };
}
