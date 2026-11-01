// Canonical presentation identities from the published /sigil/guide; never service entitlement.
const CDN = 'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/';
export const PERSONAL_MAINS = Object.freeze([
  {id:'hito',name:'Hito',role:'The Anchor',tone:'นิ่ง · มั่นคง · ไว้ใจได้',greeting:'ค่อย ๆ ดูไปด้วยกันครับ',image:CDN+'6a881dd06540c1a7ede54fbc_HITO%20-%20SIGIL%20-%20GUIDE.webp'},
  {id:'hiei',name:'Hiei',role:'The Boundary',tone:'ชัดเจน · สุขุม · มีขอบเขต',greeting:'ผมจะช่วยสรุปให้ชัดเจนครับ',image:CDN+'69f13b3f78698d853ab11bda_HITEI_Compa2.webp'},
  {id:'hiro',name:'Hiro',role:'The Observer',tone:'ละเอียด · เข้าใจ · เป็นจังหวะ',greeting:'เรามาดูรายละเอียดด้วยกันครับ',image:CDN+'6a881dd05ebe5ef18a552581_HIRO%20-%20SIGIL%20-%20GUIDE.webp'},
  {id:'hima',name:'Hima',role:'The Warm Spark',tone:'อบอุ่น · เป็นธรรมชาติ · มีชีวิตชีวา',greeting:'ผมอยู่ตรงนี้ พร้อมช่วยครับ',image:CDN+'6a881dd055fd78e105a14ad6_HIMA%20-%20SIGIL%20-%20GUIDE.webp'},
].map(Object.freeze));
export const personalMain = id => PERSONAL_MAINS.find(item=>item.id===id) || null;
