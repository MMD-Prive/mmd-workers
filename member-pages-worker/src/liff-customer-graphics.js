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
.customer-progress[hidden]{display:none}.customer-progress progress{display:block;width:100%;height:6px;accent-color:#C9B38B;margin-bottom:6px}
.customer-progress button{display:block;min-height:44px;margin-top:8px}.customer-progress button[hidden]{display:none}
.customer-booking-empty{position:relative;min-height:64px;margin:0;color:#aaa79e;font-size:12px}
@media(prefers-reduced-motion:reduce){.customer-progress progress{animation:none}}
`;
