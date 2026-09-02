const APPROVE_FRAGMENT = "await call('/applications/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:approve?'Approved':sel.value,internal_notes:memo.value,approve_to_therapist:approve})});await refresh();setRuntime(approve?'อนุมัติ Therapist แล้ว':'บันทึกใบสมัครแล้ว','ok')";

const CONNECTED_APPROVE_FRAGMENT = "var result=await call('/applications/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:approve?'Approved':sel.value,internal_notes:memo.value,approve_to_therapist:approve})});if(approve){var therapist=result&&result.therapist;if(!therapist||!therapist.therapist_id)throw new Error('Approve สำเร็จไม่สมบูรณ์: ไม่พบ Therapist ที่สร้างจากใบสมัคร');if(therapist.status!=='Review'||therapist.availability_status!=='Paused'||therapist.matching_enabled!==false)throw new Error('Therapist ยังไม่อยู่ใน safe review state: ต้องเป็น Review / Paused / Matching OFF');await refresh();showTab('therapists',true);setRuntime('อนุมัติแล้ว · Review · Paused · Matching OFF','ok');requestAnimationFrame(function(){var card=q('[data-ther-card=\"'+CSS.escape(therapist.therapist_id)+'\"]');if(!card)return;card.setAttribute('data-approve-highlight','true');card.scrollIntoView({behavior:'smooth',block:'center'});var details=card.querySelector('details');if(details)details.open=true;setTimeout(function(){card.removeAttribute('data-approve-highlight')},2400)})}else{await refresh();setRuntime('บันทึกใบสมัครแล้ว','ok')}";

const HIGHLIGHT_STYLE = ".record-card[data-approve-highlight=\"true\"]{outline:3px solid rgba(181,216,94,.72);outline-offset:3px;box-shadow:0 18px 48px rgba(49,94,67,.2);transition:outline-color .3s ease,box-shadow .3s ease}";
const MARKER = "<!-- mms-admin-approve-ui:v2 -->";

export function wireMmsApproveUi(page = "") {
  const html = String(page || "");
  if (!html || html.includes(MARKER)) return html;
  if (!html.includes(APPROVE_FRAGMENT)) return html;

  let wired = html.replace(APPROVE_FRAGMENT, CONNECTED_APPROVE_FRAGMENT);
  if (wired.includes("</style>")) wired = wired.replace("</style>", `${HIGHLIGHT_STYLE}</style>`);
  if (wired.includes("</body>")) wired = wired.replace("</body>", `${MARKER}</body>`);
  else wired += MARKER;
  return wired;
}

export const MMS_APPROVE_UI_MARKER = MARKER;
