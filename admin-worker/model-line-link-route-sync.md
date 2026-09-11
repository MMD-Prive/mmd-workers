# MMD MODEL Link API route sync

The owner page `/internal/admin/model-link` is worker-owned, but it calls separate admin API routes for queue reads and explicit LINK mutations.

Required Cloudflare route patterns:

- `mmdbkk.com/v1/admin/models/activation-candidates`
- `mmdbkk.com/v1/admin/models/activation-candidates*`
- `www.mmdbkk.com/v1/admin/models/activation-candidates`
- `www.mmdbkk.com/v1/admin/models/activation-candidates*`
- `mmdbkk.com/v1/admin/model/activation/issue`
- `www.mmdbkk.com/v1/admin/model/activation/issue`

Unauthenticated smoke should return JSON `{ ok:false, error:"unauthorized" }`, never Webflow HTML/404.
