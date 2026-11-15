export interface CoModelInput {
 role:string; sessionId:string; modelName?:unknown; lifecycle?:unknown;
 partnerId?:string; actorPartnerId?:string; evidence?:unknown;
}
export function coModelView(input:CoModelInput):Record<string, unknown>;
export function renderCoModel(view:Record<string, unknown>):string;
