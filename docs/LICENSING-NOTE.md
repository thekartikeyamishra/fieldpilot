# The licence conflict you need to decide

`LICENSE` is now **proprietary**: all rights reserved, Kartikeya Mishra, with
commercial use requiring a paid licence.

**This conflicts with the hackathon.** lablab.ai's rules state submissions must
be original and **MIT-compliant**, and require a public GitHub repository. A
proprietary licence on the submitted repo may disqualify you.

You cannot have the same repository be both. Three honest options:

## Option A — Two repositories (recommended)

- `fieldpilot-hackathon` — public, MIT, the submission. A snapshot, frozen after
  30 September.
- `fieldpilot` — private, proprietary, everything after that.

You keep ownership of ongoing work. What is MIT is the snapshot people saw, not
your future product. **Do this before submitting**, because you cannot un-publish
code once it is out.

## Option B — MIT the submission, accept it

Simplest, and genuinely fine for many founders: the moat is the accumulated
context graph and your customer relationships, not the source. MIT does not
transfer your trademark, your data, or your customers.

## Option C — Ask the organisers

"MIT-compliant" may mean your dependencies must be MIT-compatible rather than
your own code being MIT. Worth one email to community@lablab.ai before you
assume the stricter reading. Archive the reply.

---

**My recommendation: Option A, decided this week.** It costs an hour and
preserves every option. Option B is defensible but irreversible.

Whichever you pick, before you publish anything: run the secret scan in CI
(`.github/workflows/ci.yml` already includes one), confirm no `.env` file is in
git history, and check that `src/content/business.ts` does not contain anything
you would rather not publish.

I am not a lawyer. Have an Indian technology lawyer confirm the licence text
before you sell under it.
