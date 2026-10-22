// Same loopback app/browser runner on GitHub-hosted Ubuntu, with no Docker.
process.env.SEED_QA_PLATFORM="github-actions";
await import("./browser-qa-container.mjs");
