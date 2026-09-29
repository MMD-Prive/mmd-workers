# Refund completed link pack implementation

Owner decision locked by PR #2092 and implemented by PR #2094.

HYPE refund-completed packs collect links for Boss Per, but do not auto-send customer/model job links.

Required pack order:
1. Customer receipt URL
2. Customer job/confirm URL
3. Admin job URL
4. Model job/app URL

Customer job/confirm URL must be resolved only from an existing Session confirmation URL or an already stored safe session-derived value. If unavailable, the pack must show `unavailable` and must not synthesize a customer job link from job id.
