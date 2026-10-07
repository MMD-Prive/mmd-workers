-- HYPE Preview Intake: replace the seeded public headline.
-- 0001 originally seeded "สูงสุดถึง 350 POINTS", which docs/CAMPAIGN_CONTRACT.yaml lists as unsafe copy
-- (Black Card is private consideration only, never a public 350-point offer).
UPDATE hype_campaigns
SET public_offer_headline_th = 'รับรหัส 6 หลักผ่าน Telegram Preview เพื่อใช้รับ Points พิเศษ Standard ได้ 150 / Premium ได้ 250',
    updated_at = datetime('now')
WHERE campaign_id = 'preview_pride_jun2026'
  AND public_offer_headline_th LIKE '%350%';
