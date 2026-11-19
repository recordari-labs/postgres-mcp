# Contributing

Issues and pull requests are welcome. Keep the server a single NestJS application: PostgreSQL, read-only queries, YAML policy, HTTP and Docker.

- Run `npm test` and `npm run lint` before opening a pull request.
- Add a regression test for every policy bypass.
- Do not weaken startup checks to make a demo boot.
- Do not change `package.json` `version` except through `npm version`. The Release workflow refuses a tag that does not match it.
- The Apache 2.0 license in `LICENSE` covers contributions.
