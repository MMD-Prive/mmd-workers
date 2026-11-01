// Approved MY MMD customer pack, 2026-10-19. Decorative only.
export const CUSTOMER_GRAPHICS = {
  "current-booking": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 320 120\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 108H308M26 108V52H88V108M38 52V32H75V52M110 108V72H172V108M190 108V22H252V108M202 22V12H240V22M264 108V64H294V108M202 42H240M202 60H240M202 78H240\"/></svg>",
    "bytes": 365,
    "sha256": "02f55d5073a0fdb41fd92a7524c448070686597cc5ffa2f14d443c377d00be30"
  },
  "no-current-booking": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M24 80H136M40 80V22H120V80M40 38H120M58 14V28M102 14V28M66 58H94M80 44V72\"/></svg>",
    "bytes": 287,
    "sha256": "9f995a3f28b03635356e12e8a22ad1a97667c3e00e8394e6a371d82b54afebf8"
  },
  "membership-frame": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 320 120\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 40V12H60M260 12H308V40M308 80V108H260M60 108H12V80M144 28L160 14L176 28L160 42Z\"/></svg>",
    "bytes": 298,
    "sha256": "7a56fc074f3d0489f6443cea5549f91d7fb1fbc1e5c24e733087e0a92f6075ae"
  },
  "points-ledger": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M28 80V16H132V80ZM46 34H114M46 48H98M46 62H80M114 58V74M106 66H122\"/></svg>",
    "bytes": 280,
    "sha256": "cf0b70d14a7047ab0cfc480d553ab039344417cea771c6ba5aa78e0b3fe61790"
  },
  "history-archive": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M30 22H130V78H30ZM22 14H138V30H22ZM66 46H94M80 46V66M72 66H96\"/></svg>",
    "bytes": 275,
    "sha256": "2ea8b946f924d6a8afdea1330e467aab1a911f46431e96e02e5ee4d5d4e882a6"
  },
  "credit-wallet": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M24 26H136V78H24ZM24 26V18H118V26M102 42H140V64H102ZM116 53H124\"/></svg>",
    "bytes": 277,
    "sha256": "700bcc2604bdb98ee7e01be2d55d73231be7fba777d856f6f5b234a2a96a20b4"
  },
  "coupon": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M24 26H136V40C124 40 124 56 136 56V70H24V56C36 56 36 40 24 40ZM94 26V70M50 38L70 58M54 38H50V42M70 54V58H66\"/></svg>",
    "bytes": 321,
    "sha256": "08756bcb935af90f6e413e3d4d16268ec7cba5a0286e873d859bf6b3d584d647"
  },
  "payment-proof": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 96\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M48 14H98L118 34V82H48ZM98 14V34H118M62 48H104M62 60H86M82 72L90 80L106 64\"/></svg>",
    "bytes": 288,
    "sha256": "58e4b591283bb86fbf1dd77e06c40386d31926ae2dcc27e41a848dc9e91a16ea"
  }
};
export function customerGraphic(name) {
  return `<span class="customer-graphic" data-mmd-graphic="${name}" aria-hidden="true">${CUSTOMER_GRAPHICS[name].svg}</span>`;
}
export const CUSTOMER_GRAPHICS_CSS = `
.customer-graphic{display:block;position:absolute;inset:8px 8px auto auto;width:96px;height:64px;color:#C9B38B;opacity:.18;pointer-events:none;overflow:hidden}
.customer-graphic svg{width:100%;height:100%}
.digital-snapshot,.digital-mission,.digital-view>.card,.digital-requests{position:relative;isolation:isolate}
.customer-graphic~*{position:relative}
.customer-progress{margin:8px 0;padding:8px 10px;border:1px solid #C9B38B55;border-radius:8px;color:#F3F0E8;background:#171B1D;font-size:12px;overflow-wrap:anywhere}
.hype-progress{flex-wrap:wrap}.hype-progress progress{min-width:0;flex:1 0 100%;width:100%}.customer-boot-progress{width:100%;font-size:12px}
.customer-entry-progress:empty{display:none}
.customer-progress[hidden]{display:none}.customer-progress progress{display:block;width:100%;height:6px;accent-color:#C9B38B;margin-bottom:6px}
.customer-progress button{display:block;min-height:44px;margin-top:8px}.customer-progress button[hidden]{display:none}
.customer-booking-empty{position:relative;min-height:64px;margin:0;color:#aaa79e;font-size:12px}
@media(prefers-reduced-motion:reduce){.customer-progress progress{animation:none}}
`;

// V6 navigation/status icons; the installed V4 artwork above is unchanged.
export const CUSTOMER_ICONS_V6={
  "icon-booking": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">booking</title><rect x=\"4\" y=\"5\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"M8 3v4m8-4v4M4 10h16m-11 5 2 2 4-4\"/></svg>",
    "bytes": 329,
    "sha256": "c008de3188ae728311645d8907f8d4bd32dcb6a95abdd1a5dc0ef09e52d8b4af"
  },
  "icon-check": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">check</title><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m7 12 3 3 7-7\"/></svg>",
    "bytes": 288,
    "sha256": "1c9136806b52b310c88bfbee59d36c60338724433dc2fdc5427fe591b7a09b28"
  },
  "icon-error": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">error</title><path d=\"m12 3 10 18H2L12 3Z\"/><path d=\"M12 9v5m0 3v.1\"/></svg>",
    "bytes": 289,
    "sha256": "5c500c28d7ca43960ffa6da4af154b5f1612e4db070cb42cd47a2be121417a8b"
  },
  "icon-history": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">history</title><path d=\"M4 8a9 9 0 1 1-1 8M3 3v6h6m3-3v6l4 2\"/></svg>",
    "bytes": 282,
    "sha256": "a878920f5f2a62e4759e8ba04436142dade60e4a22b3771f8cbda5b795f39416"
  },
  "icon-home": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">home</title><path d=\"m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10\"/></svg>",
    "bytes": 278,
    "sha256": "47772a49cbdc0dda517815558a224d6f11774e4f0d6fc5a8ebb1597a0e8c1ea6"
  },
  "icon-lock": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">lock</title><rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"3\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3m-4 4v3\"/></svg>",
    "bytes": 323,
    "sha256": "23e58123b6a308f4014f6c2c4ece6ad09c2e924a89538dd6988c9f1d57d18583"
  },
  "icon-profile": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">profile</title><circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2Z\"/></svg>",
    "bytes": 302,
    "sha256": "a5390f245f8845747f60d04e6bf8621e73f1ebb17d330ef58c01f98029800d58"
  },
  "icon-retry": {
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" role=\"img\" aria-labelledby=\"title\"><title id=\"title\">retry</title><path d=\"M20 8a9 9 0 1 0 1 8M21 3v6h-6\"/></svg>",
    "bytes": 273,
    "sha256": "5d3b26bb7e2195be21a49c21358b8005a65981999a36edc9d961e299cfa741d3"
  }
};
export function customerIcon(name){
  const svg=CUSTOMER_ICONS_V6[name].svg.replace(/<title[^>]*>[^<]*<\/title>/g, "").replace(/role="img" aria-labelledby="title"/g, 'aria-hidden="true" focusable="false"');
  return `<span class="customer-icon" data-mmd-icon="${name}" aria-hidden="true">${svg}</span>`;
}
