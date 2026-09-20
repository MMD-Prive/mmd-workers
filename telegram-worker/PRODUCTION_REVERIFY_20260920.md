# Telegram production re-verification marker

Per-deploy nonce acceptance rerun. The deploy generates a masked random nonce, injects it only into the deployed telegram-worker version, and uses it solely to invoke the hard-coded canonical webhook lock. Bot/Webhook secrets remain runtime-owned.
