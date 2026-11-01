import { MMS_SKILLS } from '../../../../mms-worker/src/core.mjs';
export const zoneCatalog={provinces:[{code:'BKK',label_th:'กรุงเทพมหานคร'}],zones:[{code:'BKK-FIXTURE',province_code:'BKK',label_th:'เขตตัวอย่างสำหรับพรีวิว'}]};
export function responseFor(path,method='GET',scenario='ready'){
 if(scenario==='error')return {status:503,body:{ok:false,error:{message:'ระบบตัวอย่างยังตรวจข้อมูลไม่ได้ กรุณาลองใหม่'}}};
 if(path.endsWith('/profile'))return scenario==='signed-out'?{status:401,body:{ok:false}}:{status:200,body:{ok:true,data:{display_name:'บัญชีตัวอย่างสำหรับออกแบบ'}}};
 if(path.endsWith('/service-zones'))return {status:200,body:{ok:true,data:zoneCatalog}};
 if(path.endsWith('/catalog'))return {status:200,body:{ok:true,data:{skills:MMS_SKILLS,zones:[{code:'BKK-FIXTURE',label:'เขตตัวอย่างสำหรับพรีวิว'}],max_selected_skills:6}}};
 if(path.endsWith('/match')&&method==='POST')return {status:200,body:{ok:true,data:{matches:[],requires_manual_coordination:false}}};
 if(path.endsWith('/prebookings'))return {status:503,body:{ok:false,error:{message:'พรีวิวเท่านั้น ยังไม่ได้ส่งคำขอจองหรือสร้างนัดจริง'}}};
 return {status:403,body:{ok:false,error:{message:'พรีวิวเท่านั้น ยังไม่ได้ส่งคำขอจองหรือสร้างนัดจริง'}}};
}
