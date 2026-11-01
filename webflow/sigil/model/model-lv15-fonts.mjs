// Shared by the Webflow embed, Worker-rendered pages and local preview.
// Existing Webflow fonts were inspected read-only; no font uploads are required.
// Canela is the existing selected Trial asset, not a claim of publication rights.
export const LV15_FONT_FACES = Object.freeze([
  ['Canela',400,'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa0f04650d5df1332b66adf_Canela-Regular-Trial.otf','opentype'],
  ['Outfit',400,'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf','truetype'],
  ['Outfit',500,'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4QK1C4E.ttf','truetype'],
  ['Outfit',600,'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4e6yC4E.ttf','truetype'],
  ['Playfair Display',400,'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf','truetype'],
  ['Playfair Display',500,'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vUDQ.ttf','truetype'],
  ['Noto Sans Thai',400,'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a61a059d1a4642fd242f81b_NotoSansThai-Regular.ttf','truetype'],
  ['Noto Sans Thai',500,'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a61a0597bbe15e445736287_NotoSansThai-Medium.ttf','truetype'],
  ['Noto Sans Thai',600,'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a61a0597769068f579eb6da_NotoSansThai-SemiBold.ttf','truetype'],
].map(face=>Object.freeze(face)));
export const LV15_FONT_CSS = LV15_FONT_FACES.map(([family,weight,url,format])=>
  `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("${url}") format("${format}")}`
).join('\n');
