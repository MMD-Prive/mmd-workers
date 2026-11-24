export const PUBLIC_BOOKING_FORMATS = Object.freeze({
  dining: 'ร่วมมื้ออาหาร',
  event: 'ร่วมอีเวนต์',
  party: 'ร่วมงานปาร์ตี้',
  travel: 'ร่วมเดินทาง',
  guest_care: 'ดูแลแขก',
  social_appearance: 'ร่วมงานสังคม',
  brand_guest: 'แขกรับเชิญของแบรนด์',
  city_companion: 'เพื่อนเที่ยวในเมือง',
  other: 'อื่น ๆ',
});

export const PUBLIC_BOOKING_MINIMUM_BUDGET = 5000;

export function readPublicBookingDetails(input) {
  const { public_format, duration_minutes, budget_thb } = input;
  if (![public_format, duration_minutes, budget_thb].some(value => value !== undefined)) return {};
  if ((input.scope || 'public') !== 'public' ||
      typeof public_format !== 'string' || !Object.hasOwn(PUBLIC_BOOKING_FORMATS, public_format) ||
      !Number.isSafeInteger(duration_minutes) || duration_minutes <= 0 ||
      !Number.isSafeInteger(budget_thb) || budget_thb < PUBLIC_BOOKING_MINIMUM_BUDGET) return null;
  return { public_format, duration_minutes, budget_thb };
}

export function isSupportedPublicBookingLocationAndDuration(input) {
  const area = typeof input.area === 'string' ? input.area.trim().toLowerCase() : '';
  return ['bangkok', 'bkk', 'กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ', 'กทม', 'กทม.'].includes(area) &&
    Number.isSafeInteger(input.duration_minutes) && input.duration_minutes >= 180 && input.duration_minutes <= 300;
}
