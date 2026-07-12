# omybusiness

Static Cloudflare Pages version of `omybusiness.com`, migrated from Tistory.

## Local commands

```bash
npm install
npm run migrate
npm run build
```

## Cloudflare Pages

- Framework preset: `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20` or newer

After connecting the GitHub repository in Cloudflare Pages, add the custom domain
`omybusiness.com` and move DNS from Tistory to Cloudflare when the preview looks right.
