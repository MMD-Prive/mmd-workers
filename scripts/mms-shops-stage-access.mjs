// Synthetic review personas only, not real Partner authentication or shop membership.
// Scope comes from the selected persona, never from the requested shop.
const PERSONAS = Object.freeze({
  owner: { id: 'stage-owner', role: 'owner', shop_keys: ['kalima', 'relax'] },
  'partner-kalima': { id: 'stage-partner-kalima', role: 'partner', shop_keys: ['kalima'] },
  'partner-relax': { id: 'stage-partner-relax', role: 'partner', shop_keys: ['relax'] },
});
export function stageActorForPersona(persona) {
  if (!Object.hasOwn(PERSONAS, persona)) {
    throw Object.assign(new Error('STAGE_PERSONA_REQUIRED'), { status: 403 });
  }
  return structuredClone(PERSONAS[persona]);
}
