# Delivery workflow

For every requested code or content change in this repository:

1. Work on the branch requested by the user (`dev` by default for development work, or `main` when explicitly requested).
2. Verify the change as appropriate.
3. Commit all task-related changes with a clear commit message.
4. Push the commit to the matching remote branch.
5. Force a deployment with the Vercel CLI after the push:
   - on `dev`, run a forced Preview deployment;
   - on `main`, run a forced Production deployment with `--prod`.
6. Report the commit hash, pushed branch, and Vercel deployment URL.

Do not leave completed task changes uncommitted or unpushed unless the user explicitly asks for that.
