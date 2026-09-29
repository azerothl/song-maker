import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio } from "./firstLaunch.ts";
import {
  shouldResumeFollowOnPlaybackRestart,
  staffScrollTopTo,
} from "./staffScroll.ts";

describe("staff a11y tokens", () => {
  it("respecte le contraste AA sur le bouton Suivre actif", () => {
    assert.ok(contrastRatio("#ffffff", "#805cdf") >= 4.5);
    assert.ok(contrastRatio("#f3f0fa", "#2a2536") >= 4.5);
  });
});

describe("shouldResumeFollowOnPlaybackRestart", () => {
  it("détecte un retour au début après lecture avancée", () => {
    assert.equal(shouldResumeFollowOnPlaybackRestart(12.4, 0), true);
    assert.equal(shouldResumeFollowOnPlaybackRestart(1.2, 0.02), true);
  });

  it("ignore les petits sauts ou la lecture au début", () => {
    assert.equal(shouldResumeFollowOnPlaybackRestart(0.1, 0), false);
    assert.equal(shouldResumeFollowOnPlaybackRestart(12, 12.5), false);
  });
});

describe("staffScrollTopTo", () => {
  it("assigne scrollTop directement si reduced motion", () => {
    const el = {
      scrollTop: 0,
      scrollTo() {
        throw new Error("scrollTo ne doit pas être appelé");
      },
    } as unknown as HTMLElement;
    staffScrollTopTo(el, 120, true);
    assert.equal(el.scrollTop, 120);
  });

  it("utilise scrollTo smooth sinon", () => {
    let called: ScrollToOptions | undefined;
    const el = {
      scrollTop: 0,
      scrollTo(opts: ScrollToOptions) {
        called = opts;
      },
    } as unknown as HTMLElement;
    staffScrollTopTo(el, 80, false);
    assert.deepEqual(called, { top: 80, behavior: "smooth" });
  });
});
